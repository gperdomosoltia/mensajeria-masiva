// Qué número de WhatsApp atiende este proceso.
//
// Nexus corre dos servicios del mismo código: el de información general y el de
// reservas de clases, cada uno con su número. BOT_INSTANCE_ID los separa en todo lo que
// comparten en Mongo (historial, pausas, conversaciones de OpenAI) y decide qué tools
// ve el modelo. Los ids son los mismos que usa el dashboard para sus bandejas.

const INSTANCIA_GENERAL = 'nexus_general';
const INSTANCIA_RESERVAS = 'nexus_reservas';

// Números que se le dan al cliente para pasar de un bot al otro. El de reservas termina
// en 5891 y el de información general (el mismo de recepción) en 5897: se parecen a
// propósito poco, así que conviene revisar el último dígito al tocarlos.
const NUMERO_RESERVAS_DEFAULT = '584242745891';
const NUMERO_INFORMACION_GENERAL_DEFAULT = '584242745897';

function botInstanceId() {
    const valor = String(process.env.BOT_INSTANCE_ID || '').trim();
    return valor || INSTANCIA_GENERAL;
}

function esReservas() {
    return botInstanceId() === INSTANCIA_RESERVAS;
}

/**
 * Filtro de Mongo para lo que pertenece a esta instancia. Lo anterior a la separación
 * no tiene `botInstanceId` y es del número general, igual que en el dashboard
 * (server/_core/inbox.ts): por eso la general también toma los documentos sin él.
 */
function filtroInstancia(id = botInstanceId()) {
    if (id === INSTANCIA_GENERAL) return { botInstanceId: { $in: [INSTANCIA_GENERAL, null] } };
    return { botInstanceId: id };
}

/** Pasa cualquier forma de número venezolano a 58XXXXXXXXXX. */
function aInternacional(valor) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    if (!digitos) return '';
    if (digitos.startsWith('58')) return digitos;
    if (digitos.startsWith('0')) return `58${digitos.slice(1)}`;
    return `58${digitos}`;
}

/** 584242745891 → "0424 274 5891", que es como se lo dicta el bot al cliente. */
function formatoLocal(internacional) {
    const d = aInternacional(internacional);
    const local = `0${d.slice(2)}`;
    if (local.length !== 11) return local;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

function numeroReservas() {
    return aInternacional(process.env.NUMERO_RESERVAS || NUMERO_RESERVAS_DEFAULT);
}

function numeroInformacionGeneral() {
    return aInternacional(process.env.NUMERO_INFORMACION_GENERAL || NUMERO_INFORMACION_GENERAL_DEFAULT);
}

module.exports = {
    INSTANCIA_GENERAL,
    INSTANCIA_RESERVAS,
    botInstanceId,
    esReservas,
    filtroInstancia,
    aInternacional,
    formatoLocal,
    numeroReservas,
    numeroInformacionGeneral
};
