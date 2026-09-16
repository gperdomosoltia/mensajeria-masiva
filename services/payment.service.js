// Casos que esperan a un asesor: acusa recibo al cliente, pausa el bot para ese número y
// deja el caso en `payment_reviews` para que el dashboard lo trabaje.
// Las dependencias se inyectan para poder testear sin Mongo ni WhatsApp.
//
// Empezó siendo solo para pagos. Las consultas de suplementos usan exactamente la misma
// maquinaria —pausa, recordatorio cada 20 min, push de escritorio y tarjeta en el panel—
// y se distinguen con `tipo`.

const ACK_COMPROBANTE = 'Recibí tu comprobante ✅ Un asesor lo valida y te confirma por aquí mismo. Gracias por avisar.';
const ACK_DATOS_PAGO = 'Con gusto: un asesor te escribe por aquí en un momento con los datos de pago y valida tu mensualidad.';
// Deliberadamente no nombra el tema ni ninguna tasa: sacar eso de la boca del bot es el
// punto de todo este flujo.
const ACK_SUPLEMENTOS = 'Con gusto: un asesor te atiende esa consulta en un momento y te da todos los detalles.';

const CASOS = {
    pago: {
        etiqueta: 'PAGO',
        tipoNotificacion: 'PAGO',
        reason: (motivo) => `pago_${motivo}`,
        ack: (motivo) => (motivo === 'comprobante' ? ACK_COMPROBANTE : ACK_DATOS_PAGO),
        descripcion: (motivo) => (motivo === 'comprobante'
            ? 'El cliente envió un comprobante de pago y espera confirmación.'
            : 'El cliente pidió los datos para pagar la mensualidad.')
    },
    suplementos: {
        etiqueta: 'SUPLEMENTOS',
        tipoNotificacion: 'SUPLEMENTOS',
        reason: () => 'suplementos',
        ack: () => ACK_SUPLEMENTOS,
        descripcion: () => 'El cliente preguntó por suplementos. El bot no dio precio ni tasa: los cotiza un asesor.'
    }
};

function crearServicioPagos({ PaymentReview, pauseBotForUser, enviarMensajeWhatsapp, notificarAgentes }) {
    return async function registrarCasoParaAsesor({ userId, rawUserId, userName = null, tipo = 'pago', motivo, gcs_objectKey = null }) {
        if (!userId || !rawUserId || !motivo) return { created: false, review: null, acked: false };
        const caso = CASOS[tipo] || CASOS.pago;

        // El cliente puede mandar tres capturas seguidas: un solo caso por cliente.
        let existente = await PaymentReview.findOne({ user: String(userId), status: 'pending' });

        // Un caso `pending` cuya pausa ya venció es un caso viejo, no un duplicado real
        // (p. ej. el dashboard estuvo caído y nunca lo expiró): se cierra como `expired`
        // y se sigue como si no hubiera caso, creando uno nuevo. Solo un caso con la
        // pausa todavía viva corta el flujo.
        if (existente && existente.pauseUntil && existente.pauseUntil.getTime() <= Date.now()) {
            existente.status = 'expired';
            existente.nextNotifyAt = null;
            try { await existente.save(); } catch (e) { console.error('❌ [PAGO] No se pudo expirar el caso vencido:', e.message); }
            console.log(`[PAGO] Caso pendiente de ${userId} tenía la pausa vencida; se marca expired y se crea uno nuevo.`);
            existente = null;
        }

        if (existente) {
            if (gcs_objectKey && !existente.gcs_objectKey) existente.gcs_objectKey = gcs_objectKey;
            if (motivo === 'comprobante') existente.motivo = 'comprobante';
            try { await existente.save(); } catch (e) { console.error('❌ [PAGO] No se pudo actualizar el caso existente:', e.message); }
            console.log(`[PAGO] Ya había un caso pendiente para ${userId}; no se duplica.`);
            // No se manda acuse: el cliente ya recibió el de la primera captura.
            return { created: false, review: existente, acked: false };
        }

        const horas = Number(process.env.PAGO_PAUSE_HOURS || 2);

        // M11: se crea el caso ANTES de pausar. Si `PaymentReview.create` fallara
        // DESPUÉS de pausar (orden anterior), quedaba una pausa huérfana de 2h sin
        // caso, sin acuse y sin aviso, y nada explicaba por qué el bot se calló. Así,
        // un fallo acá no deja nada pausado. El pauseUntil se estima con `horas` y se
        // corrige con el valor real de `pauseBotForUser` apenas se conoce.
        let review;
        try {
            review = await PaymentReview.create({
                user: String(userId),
                phone: rawUserId,
                name: userName,
                status: 'pending',
                tipo: CASOS[tipo] ? tipo : 'pago',
                motivo,
                gcs_objectKey,
                detectedAt: new Date(),
                pauseUntil: new Date(Date.now() + horas * 60 * 60 * 1000),
                nextNotifyAt: new Date(),   // el dashboard manda el primer recordatorio en su próximo ciclo
                notifyCount: 0
            });
        } catch (e) {
            console.error('❌ [PAGO] No se pudo crear el caso de pago:', e.message);
            return { created: false, review: null, acked: false };
        }

        const pausa = await pauseBotForUser(String(userId), horas, caso.reason(motivo));
        if (!pausa) {
            console.error(`❌ [PAGO] No se pudo pausar el bot para ${userId}; se descarta el caso recién creado.`);
            try {
                review.status = 'expired';
                review.nextNotifyAt = null;
                await review.save();
            } catch (e) {
                console.error('❌ [PAGO] No se pudo expirar el caso sin pausa:', e.message);
            }
            return { created: false, review: null, acked: false };
        }

        // Se refleja en el caso el deadline real de la pausa (por si difiere del estimado).
        // Una pausa manual vigente manda sobre esta y no trae `until` (es indefinida): ahí
        // se deja el deadline estimado, y el dashboard no expira el caso mientras el asesor
        // mantenga el chat pausado a mano.
        if (pausa.until) {
            review.pauseUntil = pausa.until;
            try { await review.save(); } catch (e) { console.error('❌ [PAGO] No se pudo actualizar pauseUntil en el caso:', e.message); }
        }

        // `acked` solo queda en true si el envío RESOLVIÓ estrictamente `true`: es lo que
        // le dice a services/ai/respond.js si de verdad puede suprimir la respuesta del
        // modelo. enviarMensajeWhatsapp (index.js) no lanza en un fallo real de WhatsApp:
        // atrapa el error de client.sendMessage y resuelve `false` (o `undefined` si
        // faltan argumentos), así que basta con que no lance no alcanza para confiar en
        // el acuse — hay que mirar el valor resuelto.
        let acked = false;
        try {
            const enviado = await enviarMensajeWhatsapp(rawUserId, caso.ack(motivo));
            acked = enviado === true;
            if (!acked) console.error(`❌ [PAGO] enviarMensajeWhatsapp no confirmó el envío del acuse a ${userId} (resolvió ${JSON.stringify(enviado)}).`);
        } catch (e) {
            console.error('❌ [PAGO] No se pudo enviar el acuse al cliente:', e.message);
        }

        try {
            await notificarAgentes({
                tipo_notificacion: caso.tipoNotificacion,
                descripcion: caso.descripcion(motivo),
                nombre_cliente: userName || '',
                phone_number: rawUserId,
                source: 'whatsapp',
                // I2: este flujo ya pausó con el deadline del pago (PAGO_PAUSE_HOURS);
                // que notify.service no lo pise con su propia pausa (BOT_PAUSE_HOURS).
                skip_pause: true
            });
        } catch (e) {
            console.error('❌ [PAGO] No se pudo avisar a los agentes:', e.message);
        }

        const hastaLog = pausa.until ? pausa.until.toISOString() : 'que el asesor lo reanude (pausa manual)';
        console.log(`[${caso.etiqueta}] Caso creado para ${userId} (${motivo}); bot pausado hasta ${hastaLog}.`);
        return { created: true, review, acked };
    };
}

module.exports = { crearServicioPagos, ACK_COMPROBANTE, ACK_DATOS_PAGO, ACK_SUPLEMENTOS };
