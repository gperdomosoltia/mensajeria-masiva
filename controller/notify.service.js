// Aviso por WhatsApp a los agentes de ventas.
//
// Se dispara por dos vías, ambas con el mismo formato de payload:
//   - la tool `notificar_humano` que la IA llama cuando el cliente quiere reservar
//     (services/ai/respond.js, llamada directa en proceso);
//   - POST /notificar_agente, para integraciones externas (dashboard, etc.).
//
// Los mensajes salen por el mismo número de WhatsApp del bot y van a
// AGENTE_VENTAS_PHONE y AGENTE_VENTAS_PHONE_2.
const normalizeWhatsAppJid = require('../helper/normalizePhoneNumber.js');

const TIPOS_PERMITIDOS = new Set(['RESERVA', 'INTERES', 'SOPORTE', 'RECLAMO', 'OTRO']);

// Valor de placeholder que traen las variables de Railway sin configurar.
const PLACEHOLDER = 'REEMPLAZAR';

function normalizeTipoNotificacion(value) {
  if (!value) return 'OTRO';
  const t = String(value).toUpperCase().trim();
  return TIPOS_PERMITIDOS.has(t) ? t : 'OTRO';
}

function limpiar(value) {
  if (value === undefined || value === null) return '';
  const s = String(value).trim();
  return s && s.toUpperCase() !== PLACEHOLDER && s !== 'null' && s !== 'undefined' ? s : '';
}

// JIDs de los agentes de ventas, sin duplicados y descartando los que sigan en
// REEMPLAZAR o tengan formato inválido.
function destinatariosVentas() {
  const crudos = [process.env.AGENTE_VENTAS_PHONE, process.env.AGENTE_VENTAS_PHONE_2];
  const jids = [];
  for (const crudo of crudos) {
    const valor = limpiar(crudo);
    if (!valor) continue;
    try {
      const jid = normalizeWhatsAppJid(valor);
      if (!jids.includes(jid)) jids.push(jid);
    } catch (err) {
      console.warn(`[HANDLE_NOTIFICATION] Número de agente inválido ("${valor}"):`, err.message);
    }
  }
  return jids;
}

function construirMensaje(datos) {
  const agente = limpiar(process.env.AGENTE_VENTAS_NAME) || 'Equipo de ventas';
  const nombre = [datos.nombre_cliente, datos.apellido_cliente].filter(Boolean).join(' ').trim();

  const encabezado = datos.tipo === 'RESERVA'
    ? `${agente}, nueva solicitud de RESERVA 🗓️`
    : `${agente}, nueva notificación (${datos.tipo})`;

  const lineas = [encabezado, ''];
  if (nombre)                  lineas.push(`Cliente: ${nombre}`);
  if (datos.telefono)          lineas.push(`Teléfono: ${datos.telefono}`);
  if (datos.servicio)          lineas.push(`Servicio: ${datos.servicio}`);
  if (datos.fecha)             lineas.push(`Fecha: ${datos.fecha}`);
  if (datos.hora)              lineas.push(`Hora: ${datos.hora}`);
  if (datos.cantidad_personas) lineas.push(`Personas: ${datos.cantidad_personas}`);
  if (datos.email)             lineas.push(`Email: ${datos.email}`);
  if (datos.descripcion)       lineas.push('', datos.descripcion);

  return lineas.join('\n');
}

function createNotifier({ client, mongoose, pauseBotForUser, MessageMedia, enviarMensajeWhatsapp, fetch }) {
  return async function handleAgentNotification(payload = {}) {
    // `telefono` lo manda la tool de la IA; `phone_number` lo manda el endpoint
    // HTTP histórico. Se aceptan los dos.
    const telefonoCrudo = limpiar(payload.phone_number) || limpiar(payload.telefono);
    const tipo = normalizeTipoNotificacion(payload.tipo_notificacion);

    const datos = {
      tipo,
      descripcion: limpiar(payload.descripcion),
      nombre_cliente: limpiar(payload.nombre_cliente) || limpiar(payload.nombre),
      apellido_cliente: limpiar(payload.apellido_cliente) || limpiar(payload.apellido),
      telefono: telefonoCrudo.replace('@c.us', '').replace('@lid', ''),
      servicio: limpiar(payload.servicio),
      fecha: limpiar(payload.fecha),
      hora: limpiar(payload.hora),
      cantidad_personas: limpiar(payload.cantidad_personas),
      email: limpiar(payload.email) || limpiar(payload.email_curso)
    };

    console.log('[HANDLE_NOTIFICATION] Procesando notificación:', {
      tipo, telefono: datos.telefono, servicio: datos.servicio, fecha: datos.fecha, hora: datos.hora
    });

    if (!datos.descripcion) {
      console.warn('[HANDLE_NOTIFICATION] Falta "descripcion"; se descarta la notificación.');
      return { result: false, error: 'descripcion_requerida' };
    }

    const rawIds = destinatariosVentas();
    if (rawIds.length === 0) {
      console.error('[HANDLE_NOTIFICATION] No hay destinatarios válidos: revisa AGENTE_VENTAS_PHONE / AGENTE_VENTAS_PHONE_2.');
      return { result: false, error: 'sin_destinatarios' };
    }

    const finalMsg = construirMensaje(datos);
    const source = limpiar(payload.source) || 'whatsapp';

    // Bitácora en Mongo: alimenta el dashboard y deja registro de la reserva.
    try {
      const notificationsCollection = mongoose.connection.collection('notificaciones');
      const now = new Date();
      const newNotification = {
        user: datos.telefono || null,
        tipo_notificacion: tipo,
        source,
        date: now,
        dateFormat: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        notification: finalMsg,
        destinatarios: rawIds
      };
      if (datos.nombre_cliente)   newNotification.nombre_cliente   = datos.nombre_cliente;
      if (datos.apellido_cliente) newNotification.apellido_cliente = datos.apellido_cliente;
      if (datos.servicio)         newNotification.servicio         = datos.servicio;
      if (datos.fecha)            newNotification.fecha            = datos.fecha;
      if (datos.hora)             newNotification.hora             = datos.hora;
      if (datos.cantidad_personas) newNotification.cantidad_personas = datos.cantidad_personas;
      if (datos.email)            newNotification.email            = datos.email;

      await notificationsCollection.insertOne(newNotification);
      console.log('[HANDLE_NOTIFICATION] ✅ Notificación guardada en la base de datos.');
    } catch (dbError) {
      console.error('❌ [HANDLE_NOTIFICATION] Error al guardar la notificación en la BD:', dbError);
    }

    console.log('[HANDLE_NOTIFICATION] Enviando mensaje de texto a', rawIds);
    const results = await Promise.all(rawIds.map(id => enviarMensajeWhatsapp(id, finalMsg)));
    const result = results.every(r => r === true);
    if (result) console.log('[HANDLE_NOTIFICATION] Mensaje enviado correctamente');
    else console.warn('[HANDLE_NOTIFICATION] Falló el envío a alguno de los destinatarios:', results);

    // Pausa temporal: el humano toma el chat y el bot no interfiere. Al vencer,
    // el bot vuelve a responder solo (no hace falta desbloquear a mano).
    let pausedUntil = null;
    if (result && datos.telefono && typeof pauseBotForUser === 'function') {
      try {
        const pausa = await pauseBotForUser(datos.telefono, undefined, `notificacion_${tipo.toLowerCase()}`);
        pausedUntil = pausa?.until || null;
        if (pausedUntil) console.log(`[HANDLE_NOTIFICATION] Bot pausado para ${datos.telefono} hasta ${pausedUntil.toISOString()}`);
      } catch (err) {
        console.error('[HANDLE_NOTIFICATION] Error pausando el bot para el usuario:', err);
      }
    }

    return { result, messageSent: finalMsg, tipo_notificacion: tipo, destinatarios: rawIds, pausedUntil };
  };
}

module.exports = { createNotifier };
