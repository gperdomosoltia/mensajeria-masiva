// Entrega de la respuesta del bot al cliente y cierre del turno en el historial.
//
// Vive aparte de index.js para poder probar el caso que importa: `enviarMensajeWhatsapp`
// atrapa sus propios errores y devuelve `false` en vez de lanzar, así que dar por buena
// la entrega porque "no lanzó" marcaba el turno como `responded` sin que el cliente
// hubiera recibido nada — y el dashboard lo mostraba con el tag verde "Respondido".
// El estado solo avanza a `responded` cuando el envío resolvió estrictamente `true`.

// Términos que el bot no puede nombrar por chat: los precios de suplementos se manejan
// con una tasa distinta a la del BCV y mencionarla acarrea un problema regulatorio. Esto
// es la red de abajo; el control principal es la instrucción del prompt.
const TERMINOS_PROHIBIDOS = /(usdt|binance|tether|tasa\s+paralela|d[oó]lar\s+paralelo|monitor\s+d[oó]lar)/i;

function crearEntregaDeRespuesta({ enviarMensajeWhatsapp, updateHistoryEntry, alBloquear }) {
    /**
     * @param {string} to        JID del destinatario.
     * @param {string|null} reply Texto a enviar; vacío o null significa que no hay nada que decir.
     * @param {string} historyId Turno a cerrar en el historial.
     * @param {object} result    Resultado de la IA, del que se sacan los tokens.
     * @returns {Promise<{sent: boolean, reason?: string}>}
     */
    return async function entregarRespuesta(to, reply, historyId, result) {
        if (!reply || reply.trim() === '') return { sent: false, reason: 'sin_texto' };

        if (TERMINOS_PROHIBIDOS.test(reply)) {
            console.warn(`🚫 Respuesta bloqueada para ${to}: nombraba un término prohibido.`);
            // Se guarda lo que estuvo a punto de decir: sin eso no hay forma de revisar
            // por qué el cliente quedó esperando a un asesor.
            await updateHistoryEntry(historyId, {
                response: reply,
                status: 'blocked_terms',
                responseBy: 'bot'
            });
            // El caso deriva la conversación a un asesor, que es donde debía terminar.
            // Un fallo acá no puede hacer que el texto salga igual.
            try {
                if (typeof alBloquear === 'function') await alBloquear({ to, reply });
            } catch (error) {
                console.error('❌ No se pudo derivar la conversación tras el bloqueo:', error.message);
            }
            return { sent: false, reason: 'terminos_prohibidos' };
        }

        let enviado = false;
        try {
            enviado = await enviarMensajeWhatsapp(to, reply);
        } catch (error) {
            console.error('❌ Error entregando la respuesta al cliente:', error.message);
        }

        if (enviado !== true) {
            // Se guarda igual lo que el bot intentó decir: sin eso, un fallo de envío deja
            // el turno sin rastro de qué se perdió.
            console.error(`❌ No se pudo entregar la respuesta a ${to}; el turno queda como fallido.`);
            await updateHistoryEntry(historyId, {
                response: reply,
                status: 'webhook_failed',
                responseBy: 'bot'
            });
            return { sent: false, reason: 'envio_fallido' };
        }

        await updateHistoryEntry(historyId, {
            response: reply,
            status: 'responded',
            responseBy: 'bot',
            promptTokens: result?.usage?.input_tokens,
            completionTokens: result?.usage?.output_tokens,
            totalTokens: result?.usage?.total_tokens
        });
        return { sent: true };
    };
}

module.exports = { crearEntregaDeRespuesta };
