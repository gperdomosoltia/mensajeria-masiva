// Registro de un pago por validar: acusa recibo al cliente, pausa el bot para ese
// número y deja el caso en `payment_reviews` para que el dashboard lo trabaje.
// Las dependencias se inyectan para poder testear sin Mongo ni WhatsApp.

const ACK_COMPROBANTE = 'Recibí tu comprobante ✅ Un asesor lo valida y te confirma por aquí mismo. Gracias por avisar.';
const ACK_DATOS_PAGO = 'Con gusto: un asesor te escribe por aquí en un momento con los datos de pago y valida tu mensualidad.';

function crearServicioPagos({ PaymentReview, pauseBotForUser, enviarMensajeWhatsapp, notificarAgentes }) {
    return async function registrarPagoPendiente({ userId, rawUserId, userName = null, motivo, gcs_objectKey = null }) {
        if (!userId || !rawUserId || !motivo) return { created: false, review: null, acked: false };

        // El cliente puede mandar tres capturas seguidas: un solo caso por cliente.
        const existente = await PaymentReview.findOne({ user: String(userId), status: 'pending' });
        if (existente) {
            if (gcs_objectKey && !existente.gcs_objectKey) existente.gcs_objectKey = gcs_objectKey;
            if (motivo === 'comprobante') existente.motivo = 'comprobante';
            try { await existente.save(); } catch (e) { console.error('❌ [PAGO] No se pudo actualizar el caso existente:', e.message); }
            console.log(`[PAGO] Ya había un caso pendiente para ${userId}; no se duplica.`);
            // No se manda acuse: el cliente ya recibió el de la primera captura.
            return { created: false, review: existente, acked: false };
        }

        const horas = Number(process.env.PAGO_PAUSE_HOURS || 2);
        const pausa = await pauseBotForUser(String(userId), horas, `pago_${motivo}`);
        if (!pausa || !pausa.until) {
            console.error(`❌ [PAGO] No se pudo pausar el bot para ${userId}; no se crea el caso.`);
            return { created: false, review: null, acked: false };
        }

        const review = await PaymentReview.create({
            user: String(userId),
            phone: rawUserId,
            name: userName,
            status: 'pending',
            motivo,
            gcs_objectKey,
            detectedAt: new Date(),
            pauseUntil: pausa.until,
            nextNotifyAt: new Date(),   // el dashboard manda el primer recordatorio en su próximo ciclo
            notifyCount: 0
        });

        // `acked` solo queda en true si el envío resuelve sin lanzar: es lo que le dice
        // a services/ai/respond.js si de verdad puede suprimir la respuesta del modelo.
        let acked = false;
        try {
            await enviarMensajeWhatsapp(rawUserId, motivo === 'comprobante' ? ACK_COMPROBANTE : ACK_DATOS_PAGO);
            acked = true;
        } catch (e) {
            console.error('❌ [PAGO] No se pudo enviar el acuse al cliente:', e.message);
        }

        try {
            await notificarAgentes({
                tipo_notificacion: 'PAGO',
                descripcion: motivo === 'comprobante'
                    ? 'El cliente envió un comprobante de pago y espera confirmación.'
                    : 'El cliente pidió los datos para pagar la mensualidad.',
                nombre_cliente: userName || '',
                phone_number: rawUserId,
                source: 'whatsapp'
            });
        } catch (e) {
            console.error('❌ [PAGO] No se pudo avisar a los agentes:', e.message);
        }

        console.log(`[PAGO] Caso creado para ${userId} (${motivo}); bot pausado hasta ${pausa.until.toISOString()}.`);
        return { created: true, review, acked };
    };
}

module.exports = { crearServicioPagos, ACK_COMPROBANTE, ACK_DATOS_PAGO };
