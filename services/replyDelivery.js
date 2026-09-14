// Entrega de la respuesta del bot al cliente y cierre del turno en el historial.
//
// Vive aparte de index.js para poder probar el caso que importa: `enviarMensajeWhatsapp`
// atrapa sus propios errores y devuelve `false` en vez de lanzar, así que dar por buena
// la entrega porque "no lanzó" marcaba el turno como `responded` sin que el cliente
// hubiera recibido nada — y el dashboard lo mostraba con el tag verde "Respondido".
// El estado solo avanza a `responded` cuando el envío resolvió estrictamente `true`.

function crearEntregaDeRespuesta({ enviarMensajeWhatsapp, updateHistoryEntry }) {
    /**
     * @param {string} to        JID del destinatario.
     * @param {string|null} reply Texto a enviar; vacío o null significa que no hay nada que decir.
     * @param {string} historyId Turno a cerrar en el historial.
     * @param {object} result    Resultado de la IA, del que se sacan los tokens.
     * @returns {Promise<{sent: boolean, reason?: string}>}
     */
    return async function entregarRespuesta(to, reply, historyId, result) {
        if (!reply || reply.trim() === '') return { sent: false, reason: 'sin_texto' };

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
