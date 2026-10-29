// Aviso por Slack cuando la cuenta de OpenAI se queda sin saldo.
//
// Los dos bots usan la misma cuenta: sin saldo, todo mensaje falla con 429
// `insufficient_quota` y en el panel solo se ve "Fallo" en cada conversación, con el
// número todavía vinculado (19/10 pasaron horas así sin que nadie lo notara).
//
// Se avisa una sola vez por día (hora de Venezuela) entre los dos bots: el primero que
// inserta el documento del día en `alertas_slack` es el que avisa. Va por la misma Mongo
// que comparten, así que tampoco se repite si un bot se reinicia.

const mongoose = require('mongoose');

const COLECCION = 'alertas_slack';
const ENLACE_SALDO = 'https://platform.openai.com/settings/organization/billing/';
const TIMEOUT_MS = 8_000;

/** El 429 de saldo agotado, no el de demasiadas peticiones (ese se resuelve solo). */
function esSinCreditos(error) {
    if (!error) return false;
    const codigos = [error.code, error.type, error.error?.code, error.error?.type];
    return codigos.includes('insufficient_quota') || codigos.includes('credit_balance_exhausted');
}

function fechaVenezuela(fecha) {
    return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

function horaVenezuela(fecha) {
    return fecha.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', hour12: true });
}

function textoAviso(instancia, fecha) {
    const bot = instancia === 'nexus_reservas' ? 'reservas (5891)' : 'información general (5897)';
    return [
        '🔴 OpenAI se quedó sin créditos: los bots de Nexus no están respondiendo.',
        `Lo detectó el bot de ${bot} a las ${horaVenezuela(fecha)}. Afecta a los dos números.`,
        `Cargar saldo: ${ENLACE_SALDO}`,
        'Los mensajes que fallen no se reintentan: revisar en el panel las conversaciones marcadas "Fallo".',
    ].join('\n');
}

async function publicarEnSlack(text, { token = process.env.SLACK_BOT_TOKEN, canal = process.env.SLACK_CHANNEL_ID } = {}) {
    if (!token || !canal) {
        console.warn('[Slack] SLACK_BOT_TOKEN o SLACK_CHANNEL_ID sin configurar: no se envía el aviso.');
        return false;
    }
    try {
        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: canal, text, unfurl_links: false }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        // Slack responde 200 aun cuando falla (not_in_channel, invalid_auth...).
        const payload = await response.json().catch(() => ({}));
        if (!payload.ok) {
            console.error(`[Slack] No se pudo publicar el aviso: ${payload.error ?? `HTTP ${response.status}`}`);
            return false;
        }
        return true;
    } catch (error) {
        console.error('[Slack] No se pudo publicar el aviso:', error.message);
        return false;
    }
}

/**
 * Avisa si `error` es de saldo agotado y nadie avisó todavía hoy. Nunca lanza: se
 * llama desde el manejo de errores de la cola y no debe tapar el error original.
 */
function crearAlertaSinCreditos({
    coleccion = () => mongoose.connection.collection(COLECCION),
    enviar = publicarEnSlack,
    ahora = () => new Date(),
    instancia = () => process.env.BOT_INSTANCE_ID || 'nexus_general',
} = {}) {
    // Para no ir a Mongo con cada mensaje que falla una vez que ya se avisó hoy.
    let ultimoDiaAvisado = null;

    return async function avisarSiSinCreditos(error) {
        if (!esSinCreditos(error)) return false;
        const fecha = ahora();
        const dia = fechaVenezuela(fecha);
        if (ultimoDiaAvisado === dia) return false;
        const _id = `openai_sin_creditos:${dia}`;
        try {
            await coleccion().insertOne({ _id, instancia: instancia(), creadoEn: fecha });
        } catch (e) {
            if (e?.code === 11000) {
                ultimoDiaAvisado = dia; // ya avisó el otro bot (o este antes de reiniciarse)
                return false;
            }
            console.error('❌ No se pudo registrar el aviso de OpenAI sin créditos:', e.message);
            return false;
        }
        ultimoDiaAvisado = dia;
        const enviado = await enviar(textoAviso(instancia(), fecha));
        if (!enviado) {
            // Si Slack no lo recibió, se libera el día para que el próximo fallo reintente.
            ultimoDiaAvisado = null;
            await coleccion().deleteOne({ _id }).catch(() => {});
        }
        return enviado;
    };
}

module.exports = { esSinCreditos, fechaVenezuela, textoAviso, publicarEnSlack, crearAlertaSinCreditos, avisarSiSinCreditos: crearAlertaSinCreditos() };
