// Control único de la pausa del bot.
//
// Todo lo que silencia al bot para un chat pasa por acá: el aviso de reserva a un
// agente (controller/notify.service.js), el caso de pago por confirmar
// (services/payment.service.js) y la pausa que el asesor activa a mano desde el
// dashboard. Antes cada gate vivía suelto en index.js; ahora `estadoPausa` es la
// única pregunta que hace el manejador de mensajes.
//
// Dos clases de pausa:
//   - automática: tiene `until` y se levanta sola al vencer (el TTL de Mongo borra
//     el documento) o cuando el dashboard confirma el pago.
//   - manual: la pone una persona, normalmente sin `until` (indefinida), y manda
//     sobre las automáticas: ninguna la pisa ni la acorta, y solo se levanta con
//     el botón Reanudar del dashboard (`force: true`).

const DEFAULT_PAUSE_HOURS = 2;

function crearControlDePausa({ BotPause }) {
    /**
     * Devuelve la pausa vigente o null.
     *
     * El TTL de Mongo borra el documento al vencer `until`, pero puede tardar hasta
     * un minuto: por eso se compara la fecha igual. Una pausa sin `until` es
     * indefinida y nunca vence (Mongo ignora los documentos cuyo campo TTL no es
     * una fecha, así que tampoco la borra).
     */
    async function getBotPause(userId) {
        if (!userId) return null;
        try {
            const pausa = await BotPause.findOne({ user: String(userId) });
            if (!pausa) return null;
            if (pausa.until && new Date(pausa.until).getTime() <= Date.now()) return null;
            return pausa;
        } catch (error) {
            return null;
        }
    }

    /**
     * Pausa el bot para un usuario.
     *
     * @param {string} userId  Número sin sufijo JID.
     * @param {number|null} hours  Horas de pausa. En una pausa manual, `null` la deja
     *                             indefinida; en una automática se cae a BOT_PAUSE_HOURS.
     * @param {string} reason  Motivo, para poder explicar en el dashboard por qué calla.
     * @param {{manual?: boolean, by?: string|null}} options
     * @returns {Promise<object|null>} La pausa resultante, o la manual vigente si esta
     *                                 llamada era automática y no debía pisarla.
     */
    async function pauseBotForUser(userId, hours, reason, options = {}) {
        if (!userId) return null;
        const manual = options.manual === true;
        const by = options.by ?? null;

        let until = null;
        if (!manual || hours != null) {
            const horas = Number(hours ?? process.env.BOT_PAUSE_HOURS ?? DEFAULT_PAUSE_HOURS);
            if (!Number.isFinite(horas) || horas <= 0) return null;
            until = new Date(Date.now() + horas * 60 * 60 * 1000);
        }

        try {
            // La manual manda: una pausa automática que llegue después no la toca.
            const vigente = await getBotPause(userId);
            if (vigente && vigente.manual === true && !manual) {
                console.log(`⏸️ ${userId} está pausado a mano: la pausa automática (${reason}) no lo modifica.`);
                return vigente;
            }

            return await BotPause.findOneAndUpdate(
                { user: String(userId) },
                { $set: { user: String(userId), until, reason: reason || 'notificacion_agente', manual, pausedBy: by } },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('❌ Error creando la pausa del bot:', error.message);
            return null;
        }
    }

    /**
     * Levanta la pausa de un usuario.
     *
     * Sin `force` respeta la pausa manual: el botón "Pago procesado" del dashboard
     * confirma el pago y avisa al cliente, pero no le devuelve la palabra al bot en
     * un chat que el asesor silenció a propósito.
     *
     * @returns {Promise<{resumed: boolean, reason?: string}>}
     */
    async function resumeBotForUser(userId, options = {}) {
        if (!userId) return { resumed: false, reason: 'sin_usuario' };
        const force = options.force === true;
        try {
            if (!force) {
                const vigente = await getBotPause(userId);
                if (vigente && vigente.manual === true) {
                    console.log(`⏸️ ${userId} sigue pausado a mano; no se reanuda automáticamente.`);
                    return { resumed: false, reason: 'pausa_manual' };
                }
            }
            await BotPause.deleteOne({ user: String(userId) });
            return { resumed: true };
        } catch (error) {
            console.error('❌ Error reanudando el bot:', error.message);
            return { resumed: false, reason: 'error' };
        }
    }

    /**
     * Gate único del manejador de mensajes: ¿tiene el bot permitido responderle a
     * este usuario? Cubre el apagón global (`bot_status`) y la pausa del chat.
     *
     * La black_list queda fuera a propósito: es un baneo permanente, no una pausa,
     * y mezclarlas haría que un número bloqueado se muestre como pausado y con un
     * botón de reanudar que no le corresponde.
     */
    async function estadoPausa(userId, botConfig) {
        if (!botConfig || botConfig.bot_status !== true) {
            return { pausado: true, motivo: 'bot_apagado', until: null, manual: false };
        }
        const pausa = await getBotPause(userId);
        if (!pausa) return { pausado: false, motivo: null, until: null, manual: false };
        return {
            pausado: true,
            motivo: pausa.reason || 'pausa',
            until: pausa.until ?? null,
            manual: pausa.manual === true
        };
    }

    return { getBotPause, pauseBotForUser, resumeBotForUser, estadoPausa };
}

module.exports = { crearControlDePausa, DEFAULT_PAUSE_HOURS };
