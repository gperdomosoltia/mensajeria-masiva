const { fetch } = require('undici');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getNotifier } = require('../../controller/notifier.registry');
const { getPagoRegistrar } = require('../../controller/pago.registry');

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

// ---------- tools (schemas + ejecutores) ----------
function buildToolSchemas() {
  return [
    {
      type: 'function',
      name: 'notificar_humano',
      description: [
        'Avisa por WhatsApp al agente de ventas humano.',
        'LLÁMALA DE INMEDIATO en cuanto el cliente exprese que quiere reservar, agendar,',
        'apartar un cupo, inscribirse o separar un horario, aunque todavía falten datos:',
        'en ese caso usa tipo_notificacion "RESERVA" y manda lo que tengas.',
        'Úsala también si el cliente pide hablar con una persona, reclama o pregunta algo',
        'que no puedes resolver. No anuncies que estás usando una herramienta: después de',
        'llamarla, confirma con naturalidad al cliente que un asesor lo contactará.'
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          tipo_notificacion: {
            type: 'string',
            enum: ['RESERVA', 'INTERES', 'SOPORTE', 'RECLAMO', 'OTRO'],
            description: 'RESERVA cuando el cliente quiere reservar o agendar.'
          },
          descripcion: {
            type: 'string',
            description: 'Resumen en una o dos frases de lo que pidió el cliente, en sus términos.'
          },
          nombre_cliente: { type: 'string' },
          apellido_cliente: { type: 'string' },
          telefono: { type: 'string', description: 'Solo si el cliente da un número distinto al del chat.' },
          email: { type: 'string' },
          servicio: { type: 'string', description: 'Clase, plan o servicio que quiere reservar.' },
          fecha: { type: 'string', description: 'Fecha pedida, tal como la dijo el cliente (ej. "sábado 14" o "14/09").' },
          hora: { type: 'string', description: 'Hora pedida (ej. "7:00 am").' },
          cantidad_personas: { type: 'string', description: 'Cuántas personas asistirían.' },
          source: { type: 'string' }
        },
        required: ['descripcion', 'tipo_notificacion'],
        additionalProperties: true
      }
    },
    {
      type: 'function',
      name: 'pago_pendiente',
      description: [
        'Regístra que el cliente va a pagar o ya pagó la mensualidad, y avisa al asesor.',
        'LLÁMALA DE INMEDIATO cuando el cliente pida los datos para pagar,',
        'diga que ya pagó o anuncie que va a mandar el comprobante. Usa motivo "comprobante"',
        'si dice que ya pagó o que manda el comprobante, y "datos_pago" si está pidiendo los datos.',
        'No anuncies que estás usando una herramienta y no escribas nada después de llamarla:',
        'el sistema ya le responde al cliente.'
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', enum: ['comprobante', 'datos_pago'] },
          descripcion: { type: 'string', description: 'Una frase con lo que dijo el cliente.' }
        },
        required: ['motivo'],
        additionalProperties: true
      }
    }
  ];
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
    return {
      out: JSON.stringify({
        status: 'success',
        mensaje: acked ? 'Asesor notificado; ya se le respondió al cliente' : 'Registrado; no se mandó un nuevo acuse al cliente'
      }),
      suppress: acked
    };
  } catch (e) {
    return { out: JSON.stringify({ status: 'error', mensaje: String(e?.message || e) }), suppress: false };
  }
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

function mapBatchToTurn(queuedParts = []) {
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
  return blocks.length ? [{ role: 'user', content: blocks }] : [];
}

async function respondWithConversation({
  channel = 'whatsapp',
  user_id,
  rawUserId,
  user_name,
  conversation_id,
  messages,
  promptId = process.env.PROMPT_ID
}) {
  if (!conversation_id) throw new Error('conversation_id requerido');
  const tools = buildToolSchemas(); // 'notificar_humano' y 'pago_pendiente'

  const input = mapBatchToTurn(messages);
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
        // --- CORRECCIÓN 4: Se elimina la lógica para llamar a exec_get_tasa_bcv ---
        if (name === 'notificar_humano') out = await exec_notificar_humano({ channel, rawUserId, argsJSON });
        else if (name === 'pago_pendiente') {
          const r = await exec_pago_pendiente({ rawUserId, argsJSON, userName: user_name });
          out = r.out;
          suprimir = r.suppress;
        }
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

module.exports = { respondWithConversation };