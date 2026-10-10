const { fetch } = require('undici');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getNotifier } = require('../../controller/notifier.registry');
const { getPagoRegistrar } = require('../../controller/pago.registry');
// Se requiere directo: guardarCedula solo necesita el modelo, no el cliente de WhatsApp,
// así que no hace falta el registro que usan las otras dos tools.
const mongoController = require('../../controller/mongo.controller');
const {
  esReservas, botInstanceId, INSTANCIA_GENERAL, INSTANCIA_RESERVAS,
  numeroReservas, numeroInformacionGeneral, formatoLocal
} = require('../instancia');
const { crearClienteClases, crearToolsDeClases } = require('../clases');
const { crearDerivaciones } = require('../derivaciones');
const { normalizarCedula } = require('../identity');
const Derivacion = require('../../models/derivacionModel');
const { buildToolSchemas } = require('./tools');

const toolsDeClases = crearToolsDeClases({
  cliente: crearClienteClases({ fetch }),
  findSubscription: mongoController.findSubscription,
  updateSubscription: mongoController.updateSubscription,
  // Reserva dentro de la anticipación mínima con cupo: la decide el equipo desde /agenda.
  pausarConversacion: (telefono, horas, motivo) => mongoController.pauseBotForUser(telefono, horas, motivo)
});
const derivaciones = crearDerivaciones({ Derivacion });

// ---------- helpers ----------
function collectFunctionCalls(res) {
  const calls = [];
  for (const item of res.output ?? []) if (item?.type === 'function_call') calls.push(item);
  return calls;
}
function ensureWhatsAppJid(raw) {
  if (!raw) return raw;
  return raw.endsWith('@c.us') ? raw : `${raw}@c.us`;
}
/** "584121234567@c.us" → "584121234567": así lo guardan el dashboard y las derivaciones. */
function telefonoDelChat(rawUserId) {
  return String(rawUserId || '').split('@')[0];
}
function parseArgs(argsJSON) {
  try { return argsJSON ? JSON.parse(argsJSON) : {}; } catch { return {}; }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * El modelo no sabe qué día es. Sin esto, "mañana" o "el jueves" no se pueden pasar a
 * una fecha, y la tool de horarios necesita la fecha exacta.
 */
function lineaFechaActual(ahora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(ahora).map(x => [x.type, x.value]));
  const dia = DIAS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)];
  return `[Sistema] Fecha y hora actual en Caracas: ${dia} ${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute} (hoy es ${p.year}-${p.month}-${p.day}).`;
}

// ---------- tools (ejecutores; los schemas están en ./tools.js) ----------

const MENSAJES_CEDULA = {
  falta_tipo: 'Falta saber si es V (venezolano) o E (extranjero). Pregúntaselo con naturalidad y vuelve a llamarme con la letra.',
  formato: 'Ese valor no tiene forma de cédula ni de RIF. Pídele que lo repita, sin insistir si no quiere darlo.',
  vacio: 'No llegó ningún número. Pídeselo al cliente.',
  sin_usuario: 'No se pudo identificar el chat; sigue la conversación sin pedirlo de nuevo.',
  error_al_guardar: 'No se pudo guardar ahora. Sigue la conversación con naturalidad y no insistas.'
};

async function exec_consulta_suplementos({ rawUserId, userName }) {
  const registrar = getPagoRegistrar();
  if (!registrar) return { out: JSON.stringify({ status: 'error', mensaje: 'Servicio no disponible' }), suppress: false };

  const jid = ensureWhatsAppJid(rawUserId);
  try {
    const resultado = await registrar({
      userId: String(jid).split('@')[0],
      rawUserId: jid,
      userName: userName || null,
      tipo: 'suplementos',
      motivo: 'suplementos'
    });
    const acked = Boolean(resultado?.acked);
    return {
      out: JSON.stringify({
        status: 'success',
        mensaje: acked
          ? 'Asesor notificado; ya se le respondió al cliente'
          : 'Registrado, pero NO se le respondió al cliente: dile tú que un asesor lo atiende, sin dar precios ni tasas.'
      }),
      suppress: acked
    };
  } catch (e) {
    return { out: JSON.stringify({ status: 'error', mensaje: String(e?.message || e) }), suppress: false };
  }
}

async function exec_registrar_cedula({ rawUserId, argsJSON }) {
  const a = parseArgs(argsJSON);
  const valor = a.cedula || a.documento || a.rif || a.numero || '';

  // En reservas, la cédula guardada es la de la titular y va en cada reserva suya. En
  // las pruebas el modelo llamó esta tool con la cédula de una invitada y pisó la de la
  // titular: acá no se reemplaza una cédula distinta. Si de verdad estaba mal, la
  // corrige un asesor desde el dashboard.
  if (esReservas()) {
    const nueva = normalizarCedula(valor);
    const subscription = nueva.ok ? await mongoController.findSubscription(ensureWhatsAppJid(rawUserId)) : null;
    if (nueva.ok && subscription?.cedula && subscription.cedula !== nueva.valor) {
      return JSON.stringify({
        status: 'error',
        motivo: 'ya_registrada',
        mensaje: [
          'Quien escribe ya tiene otra cédula registrada, así que esta no se guardó.',
          'Si es la de un invitado, va en reservar_cupo_clase (campo cedula), no aquí.',
          'Si la persona dice que la suya estaba mal, avisa al equipo con notificar_humano para que la corrija.'
        ].join(' ')
      });
    }
  }

  const r = await mongoController.guardarCedula({ user: rawUserId, cedula: valor, origen: 'cliente' });
  if (r.ok) {
    return JSON.stringify({
      status: 'success',
      cedula: r.valor,
      mensaje: 'Cédula guardada. Sigue con naturalidad; no repitas el número ni lo confirmes dos veces.'
    });
  }
  // Con falta_tipo se devuelve el número que ya dio: si no, cuando la persona contesta
  // solo "V", el modelo a veces le vuelve a pedir la cédula completa.
  const numero = r.motivo === 'falta_tipo' ? String(valor).replace(/\D/g, '') : undefined;
  return JSON.stringify({
    status: 'error',
    motivo: r.motivo,
    numero,
    mensaje: r.motivo === 'falta_tipo'
      ? `Falta saber si es V (venezolano) o E (extranjero). Pregúntaselo con naturalidad; cuando conteste, vuelve a llamarme con la letra y este mismo número (ej. "V-${numero}"), sin pedirle el número otra vez.`
      : (MENSAJES_CEDULA[r.motivo] || 'No se pudo guardar.')
  });
}

async function exec_notificar_humano({ channel, rawUserId, argsJSON }) {
    let a = {};
    try { a = argsJSON ? JSON.parse(argsJSON) : {}; } catch { a = {}; }

    const payload = {
      descripcion: a.descripcion || a.detalle || 'Solicitud de contacto humano',
      tipo_notificacion: a.tipo_notificacion || 'OTRO',
      nombre_cliente: a.nombre_cliente || a.nombre || '',
      apellido_cliente: a.apellido_cliente || a.apellido || '',
      email: a.email || a.email_curso || '',
      servicio: a.servicio || '',
      fecha: a.fecha || '',
      hora: a.hora || '',
      cantidad_personas: a.cantidad_personas || '',
      source: channel || 'whatsapp',
      // En reservas avisar al equipo no silencia el bot: la persona puede seguir
      // pidiendo o consultando cupos mientras un asesor revisa.
      skip_pause: esReservas(),
      botInstanceId: botInstanceId(),
      // El teléfono del chat manda: es el número real por el que escribe el cliente.
      telefono: (channel === 'whatsapp' && rawUserId) ? ensureWhatsAppJid(rawUserId) : (a.telefono || undefined)
    };

    // Camino normal: el notificador vive en el mismo proceso (lo registra index.js),
    // así que se llama directo, sin salto HTTP ni timeouts.
    const notifier = getNotifier();
    if (notifier) {
      try {
        const res = await notifier(payload);
        return JSON.stringify(
          res?.result
            ? { status: 'success', mensaje: 'Agente de ventas notificado', tipo: res.tipo_notificacion }
            : { status: 'error', mensaje: res?.error || 'No se pudo notificar al agente' }
        );
      } catch (e) {
        return JSON.stringify({ status: 'error', mensaje: String(e?.message || e) });
      }
    }

    // Respaldo: si este módulo corre fuera del proceso del bot, se usa el endpoint HTTP.
    const url = process.env.NOTIFICAR_HUMANO_URL;
    if (!url) return JSON.stringify({ status: 'error', mensaje: 'Notificador no disponible: no hay notifier registrado ni NOTIFICAR_HUMANO_URL' });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: Number(process.env.CALLBACK_TIMEOUT_MS || 8000)
    });

    const text = await resp.text();
    if (!resp.ok) return JSON.stringify({ status: 'error', http_status: resp.status, body: text });
    try { return JSON.stringify(JSON.parse(text)); } catch { return JSON.stringify({ status: 'success', data: text }); }
}

// Devuelve { out, suppress }: `suppress` solo va en true si el servicio de pagos
// de verdad le mandó el acuse al cliente (resultado.acked). Si el caso ya estaba
// duplicado o la pausa falló, el cliente no recibió nada todavía, así que el turno
// debe caer al camino normal (texto del modelo o el de respaldo) en vez de quedar mudo.
async function exec_pago_pendiente({ rawUserId, argsJSON, userName }) {
  let a = {};
  try { a = argsJSON ? JSON.parse(argsJSON) : {}; } catch { a = {}; }
  const registrar = getPagoRegistrar();
  if (!registrar) return { out: JSON.stringify({ status: 'error', mensaje: 'Servicio de pagos no disponible' }), suppress: false };

  const jid = ensureWhatsAppJid(rawUserId);
  const motivo = a.motivo === 'datos_pago' ? 'datos_pago' : 'comprobante';
  try {
    const resultado = await registrar({ userId: String(jid).split('@')[0], rawUserId: jid, userName: userName || null, motivo });
    const acked = Boolean(resultado?.acked);
    // M9: el prompt le dice al modelo que no escriba nada después de llamar esta tool.
    // Cuando NO hubo acuse (caso duplicado con pausa viva, o falló la pausa), el
    // cliente no recibió nada todavía, así que el mensaje se lo tiene que decir
    // explícito: si no, el modelo se queda callado y el turno cae al fallback genérico.
    return {
      out: JSON.stringify({
        status: 'success',
        mensaje: acked
          ? 'Asesor notificado; ya se le respondió al cliente'
          : 'Registrado, pero NO se le respondió al cliente: respóndele tú en este turno.'
      }),
      suppress: acked
    };
  } catch (e) {
    return { out: JSON.stringify({ status: 'error', mensaje: String(e?.message || e) }), suppress: false };
  }
}

async function exec_derivar_a_reservas({ rawUserId, argsJSON }) {
  const a = parseArgs(argsJSON);
  const numero = numeroReservas();
  const subscription = await mongoController.findSubscription(ensureWhatsAppJid(rawUserId));
  try {
    await derivaciones.crear({
      telefono: telefonoDelChat(rawUserId),
      origen: INSTANCIA_GENERAL,
      destino: INSTANCIA_RESERVAS,
      contexto: {
        motivo: a.motivo || null,
        solicitudes: Array.isArray(a.solicitudes) ? a.solicitudes : [],
        cantidad_invitados: a.cantidad_invitados ?? null,
        resumen: a.resumen || ''
      },
      nombreCliente: a.nombre_cliente || null,
      cedulaRegistrada: Boolean(subscription?.cedula)
    });
  } catch (e) {
    // Sin contexto el bot de reservas atiende desde cero; el número se da igual.
    console.error('❌ No se pudo guardar la derivación a reservas:', e?.message || e);
  }
  return JSON.stringify({
    status: 'success',
    numero_reservas: formatoLocal(numero),
    enlace: `https://wa.me/${numero}`
  });
}

async function exec_derivar_a_informacion_general({ rawUserId, argsJSON }) {
  const a = parseArgs(argsJSON);
  const numero = numeroInformacionGeneral();
  try {
    await derivaciones.crear({
      telefono: telefonoDelChat(rawUserId),
      origen: INSTANCIA_RESERVAS,
      destino: INSTANCIA_GENERAL,
      contexto: { tema: a.tema || '', resumen: a.resumen || '' }
    });
  } catch (e) {
    console.error('❌ No se pudo guardar la derivación a información general:', e?.message || e);
  }
  return JSON.stringify({
    status: 'success',
    numero_informacion_general: formatoLocal(numero),
    enlace: `https://wa.me/${numero}`
  });
}

// Tools del bot de reservas que llaman al dashboard (services/clases.js).
const TOOLS_DE_CLASES = new Set(['consultar_horarios', 'reservar_cupo_clase', 'consultar_mis_reservas', 'solicitar_cancelacion']);

async function exec_tool_de_clases(name, { rawUserId, argsJSON, userName }) {
  const a = parseArgs(argsJSON);
  const chat = { telefono: telefonoDelChat(rawUserId), rawUserId: ensureWhatsAppJid(rawUserId), userName };
  let resultado;
  if (name === 'consultar_horarios') resultado = await toolsDeClases.consultarHorarios(a);
  else if (name === 'reservar_cupo_clase') resultado = await toolsDeClases.reservarCupo(a, chat);
  else if (name === 'consultar_mis_reservas') resultado = await toolsDeClases.misReservas(chat);
  else resultado = await toolsDeClases.solicitarCancelacion(a, chat);
  return JSON.stringify(resultado);
}

function normalizeImageSource(content, mimetype) {
  if (!content) return null;
  if (typeof content === 'string' && content.startsWith('data:')) return content;
  if (typeof content === 'string' && /^https?:\/\//i.test(content)) return content;
  if (typeof content === 'string' && mimetype) return `data:${mimetype};base64,${content}`;
  if (typeof content === 'object' && content.base64 && content.mimetype)
    return `data:${content.mimetype};base64,${content.base64}`;
  return null;
}

function mapBatchToTurn(queuedParts = [], { contextoDerivacion = null, ahora = new Date() } = {}) {
  const blocks = [];
  for (const p of queuedParts) {
    if (!p) continue;
    if (p.type === 'text') {
      const txt = (p.content ?? '').toString().trim();
      if (txt) blocks.push({ type: 'input_text', text: txt });
    } else if (p.type === 'image') {
      if (p.caption) {
        const cap = p.caption.toString().trim();
        if (cap) blocks.push({ type: 'input_text', text: cap });
      }
      const src = normalizeImageSource(p.content, p.mimetype);
      if (src) blocks.push({ type: 'input_image', image_url: src });
    }
  }
  if (!blocks.length) return [];
  // El contexto del sistema va primero y en bloques propios, para que el modelo no lo
  // confunda con algo que escribió el cliente.
  const sistema = [{ type: 'input_text', text: lineaFechaActual(ahora) }];
  if (contextoDerivacion) sistema.push({ type: 'input_text', text: contextoDerivacion });
  return [{ role: 'user', content: [...sistema, ...blocks] }];
}

async function respondWithConversation({
  channel = 'whatsapp',
  user_id,
  rawUserId,
  user_name,
  conversation_id,
  messages,
  contextoDerivacion = null,
  promptId = process.env.PROMPT_ID
}) {
  if (!conversation_id) throw new Error('conversation_id requerido');
  const tools = buildToolSchemas();
  const permitidas = new Set(tools.map(t => t.name));

  const input = mapBatchToTurn(messages, { contextoDerivacion });
  if (!input.length) throw new Error('EMPTY_INPUT');

  let hops = 0;
  let suppressed = false;
  let inputList = input.slice();

  while (true) {
    const resp = await openai.responses.create({
      conversation: conversation_id,
      input: inputList,
      prompt: promptId ? { id: promptId } : undefined,
      tools,
      store: true,
      metadata: { source: channel, userId: user_id }
    });

    const calls = collectFunctionCalls(resp);
    if (!calls.length) {
      return {
        ok: true,
        text: resp.output_text ?? '',
        responseId: resp.id,
        conversationId: resp?.conversation?.id || conversation_id,
        usage: resp.usage ?? null,
        suppressed
      };
    }

    const outputs = [];
    for (const call of calls) {
      const { name, call_id, arguments: argsJSON } = call;
      let out = '';
      let suprimir = false;
      try {
        // Una tool de la otra instancia no se ejecuta aunque el modelo la invente.
        if (!permitidas.has(name)) out = JSON.stringify({ error: `Tool ${name} no disponible` });
        else if (name === 'notificar_humano') out = await exec_notificar_humano({ channel, rawUserId, argsJSON });
        else if (name === 'pago_pendiente') {
          const r = await exec_pago_pendiente({ rawUserId, argsJSON, userName: user_name });
          out = r.out;
          suprimir = r.suppress;
        }
        else if (name === 'consulta_suplementos') {
          const r = await exec_consulta_suplementos({ rawUserId, userName: user_name });
          out = r.out;
          suprimir = r.suppress;
        }
        else if (name === 'registrar_cedula') out = await exec_registrar_cedula({ rawUserId, argsJSON });
        else if (name === 'derivar_a_reservas') out = await exec_derivar_a_reservas({ rawUserId, argsJSON });
        else if (name === 'derivar_a_informacion_general') out = await exec_derivar_a_informacion_general({ rawUserId, argsJSON });
        else if (TOOLS_DE_CLASES.has(name)) out = await exec_tool_de_clases(name, { rawUserId, argsJSON, userName: user_name });
        else out = JSON.stringify({ error: `Tool ${name} no implementada` });
      } catch (e) {
        out = JSON.stringify({ error: String(e?.message || e) });
      }
      if (suprimir) suppressed = true;
      outputs.push({ type: 'function_call_output', call_id, output: out });
    }

    inputList = outputs;
    hops++;
    const maxHops = Number(process.env.TOOL_HOPS_MAX || 5);
    if (hops >= maxHops) inputList.push({ role: 'user', content: 'Por favor entrega una respuesta final breve sin más herramientas.' });
    if (hops > maxHops + 1) return { ok: false, error: 'TOOL_LOOP_EXCEEDED', conversationId: conversation_id, suppressed };
  }
}

module.exports = { respondWithConversation, mapBatchToTurn, lineaFechaActual };