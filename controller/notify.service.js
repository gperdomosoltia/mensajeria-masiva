function normalizeTipoNotificacion(value) {
  if (!value) return 'OTRO';
  const t = String(value).toUpperCase().trim();
  return TIPOS_PERMITIDOS.has(t) ? t : 'OTRO';
}

function createNotifier({ client, mongoose, addToBlackList, MessageMedia, enviarMensajeWhatsapp, fetch }) {
  return async function handleAgentNotification({ descripcion, imagen, phone_number, source, nombre_cliente, apellido_cliente, tipo_notificacion, curso, email_curso }) {
    const tipo = "1";
    console.log(`[HANDLE_NOTIFICATION] Procesando notificación:`, { tipo, descripcion, imagen, phone_number });

    if (!tipo || !descripcion) {
      console.warn('[HANDLE_NOTIFICATION] Faltan parámetros requeridos');
      return false;
    }
    if (!source) source = "instagram";

    let finalMsg = `${descripcion} \n Telefono: ${phone_number}`;
    let addToBlacklist = false;
    let rawIds = [];


    finalMsg = `${process.env.AGENTE_VENTAS_NAME || 'Louishanna'}, \n${descripcion}`;
    rawIds = [
      process.env.AGENTE_VENTAS_PHONE && (process.env.AGENTE_VENTAS_PHONE + '@c.us'),
      process.env.AGENTE_VENTAS_PHONE_2 && (process.env.AGENTE_VENTAS_PHONE_2 + '@c.us')
    ].filter(Boolean);
    addToBlacklist = true;
    console.log('[HANDLE_NOTIFICATION] Tipo 1: Notificando a agentes de ventas');
    

    // Persistencia (opcional según source)
    if (source === 'whatsapp' && phone_number) {
      try {
        const notificationsCollection = mongoose.connection.collection('notificaciones');
        const now = new Date();
        const tipoNotif = normalizeTipoNotificacion(tipo_notificacion);
        const cursoNorm = normalizeCurso(curso);

        const newNotification = {
          user: phone_number.replace('@c.us', ''),
          tipo_notificacion: tipoNotif,
          date: now,
          dateFormat: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          notification: finalMsg
        };
        if (nombre_cliente)  newNotification.nombre_cliente  = nombre_cliente;
        if (apellido_cliente)newNotification.apellido_cliente= apellido_cliente;
        if (cursoNorm)       newNotification.curso           = cursoNorm;
        if (email_curso)     newNotification.email_curso     = email_curso;

        await notificationsCollection.insertOne(newNotification);
        console.log('[HANDLE_NOTIFICATION] ✅ Notificación guardada en la base de datos.');
      } catch (dbError) {
        console.error('❌ [HANDLE_NOTIFICATION] Error al guardar la notificación en la BD:', dbError);
      }
    }

    if (rawIds.length === 0) {
      console.error('[HANDLE_NOTIFICATION] No se encontraron destinatarios válidos para el tipo', tipo);
      return false;
    }

    let result = false;
    //Nota de Jhosmar, dejo esto en lo que vemos si se usa o no
    // if (tipo === '2' && imagen && imagen !== '' && imagen !== "null") {
    //   console.log('[HANDLE_NOTIFICATION] Se detectó imagen para tipo 2, iniciando descarga y envío...');
    //   try {
    //     const res = await fetch(imagen);
    //     if (!res.ok) throw new Error('No se pudo descargar la imagen');
    //     const buffer = Buffer.from(await res.arrayBuffer());
    //     const base64Data = buffer.toString('base64');
    //     const media = new MessageMedia('image/jpeg', base64Data, 'pedido.jpg');
    //     await Promise.all(rawIds.map(id => client.sendMessage(id, media, { caption: finalMsg })));
    //     console.log('[HANDLE_NOTIFICATION] Imagen enviada correctamente a', rawIds);
    //     result = true;
    //   } catch (err) {
    //     console.error('❌ [HANDLE_NOTIFICATION] Error enviando imagen:', err);
    //     return false;
    //   }
    // } else {
      console.log('[HANDLE_NOTIFICATION] Enviando solo mensaje de texto a', rawIds);
      const results = await Promise.all(rawIds.map(id => enviarMensajeWhatsapp(id, finalMsg)));
      result = results.every(r => r === true);
      if (result) console.log('[HANDLE_NOTIFICATION] Mensaje de texto enviado correctamente');
      else console.warn('[HANDLE_NOTIFICATION] Falló el envío del mensaje de texto');
    // }

    if (result && addToBlacklist && phone_number) {
      try {
        const phoneNumberClean = phone_number.replace('@c.us', '');
        await addToBlackList(phoneNumberClean);
        console.log(`[HANDLE_NOTIFICATION] Número ${phoneNumberClean} agregado a la blacklist.`);
      } catch (err) {
        console.error('[HANDLE_NOTIFICATION] Error actualizando la blacklist:', err);
      }
    }
    return {result, messageSent: finalMsg, tipo_notificacion};
  };
}
  
module.exports = { createNotifier };