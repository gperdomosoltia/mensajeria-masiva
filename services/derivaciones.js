// Derivaciones entre el número general y el de reservas (ver models/derivacionModel.js).
//
// Está aparte de Mongo para poder probar las reglas: una sola derivación pendiente por
// teléfono y destino, vencimiento a las DERIVACION_TTL_HORAS, y el texto exacto del
// bloque que recibe el modelo.

const { INSTANCIA_GENERAL, INSTANCIA_RESERVAS } = require('./instancia');

const TTL_HORAS_DEFAULT = 72;

const NOMBRE_INSTANCIA = {
    [INSTANCIA_GENERAL]: 'información general',
    [INSTANCIA_RESERVAS]: 'reservas de clases'
};

function ttlHoras() {
    const horas = Number(process.env.DERIVACION_TTL_HORAS);
    return Number.isFinite(horas) && horas > 0 ? horas : TTL_HORAS_DEFAULT;
}

function texto(valor) {
    if (valor === undefined || valor === null) return '';
    return String(valor).replace(/\s+/g, ' ').trim();
}

/** "Pilates, jueves, 18:30 (Training Bike)" a partir de una solicitud de la tool. */
function describirSolicitud(s = {}) {
    const clase = [texto(s.clase), texto(s.modalidad) && `(${texto(s.modalidad)})`].filter(Boolean).join(' ');
    return [clase, texto(s.fecha), texto(s.hora)].filter(Boolean).join(', ');
}

/**
 * Bloque que se antepone al primer turno en la instancia destino. El prompt de cada
 * bot sabe leerlo y tiene prohibido mostrarlo.
 */
function formatearContexto(derivacion) {
    const c = derivacion?.contexto || {};
    const lineas = ['[CONTEXTO_DERIVACION]', `Viene de: ${NOMBRE_INSTANCIA[derivacion.origen] || derivacion.origen}`];
    if (derivacion.nombreCliente) lineas.push(`Nombre: ${derivacion.nombreCliente}`);
    if (derivacion.destino === INSTANCIA_RESERVAS) {
        lineas.push(`Cédula registrada: ${derivacion.cedulaRegistrada ? 'sí' : 'no'}`);
        if (texto(c.motivo)) lineas.push(`Motivo: ${texto(c.motivo)}`);
        const solicitudes = (Array.isArray(c.solicitudes) ? c.solicitudes : []).map(describirSolicitud).filter(Boolean);
        const invitados = Number(c.cantidad_invitados);
        const pidio = solicitudes.join('; ');
        const extra = Number.isFinite(invitados) && invitados > 0
            ? `va con ${invitados} invitado${invitados === 1 ? '' : 's'}`
            : '';
        if (pidio || extra) lineas.push(`Pidió: ${[pidio, extra].filter(Boolean).join('; ')}`);
    } else if (texto(c.tema)) {
        lineas.push(`Tema: ${texto(c.tema)}`);
    }
    if (texto(c.resumen)) lineas.push(`Resumen: ${texto(c.resumen)}`);
    lineas.push('[/CONTEXTO_DERIVACION]');
    return lineas.join('\n');
}

function crearDerivaciones({ Derivacion }) {
    /**
     * Registra el pase. Las pendientes anteriores del mismo teléfono y destino se
     * vencen: la última conversación manda sobre las viejas.
     */
    async function crear({ telefono, origen, destino, contexto, nombreCliente = null, cedulaRegistrada = false, ahora = new Date() }) {
        if (!telefono || !destino) return null;
        await Derivacion.updateMany(
            { telefono, destino, estado: 'pendiente' },
            { $set: { estado: 'vencida' } }
        );
        return Derivacion.create({
            telefono,
            origen,
            destino,
            estado: 'pendiente',
            contexto: contexto || {},
            nombreCliente: texto(nombreCliente) || null,
            cedulaRegistrada: cedulaRegistrada === true,
            expiraAt: new Date(ahora.getTime() + ttlHoras() * 3_600_000)
        });
    }

    /** La última derivación pendiente y vigente hacia esta instancia, o null. */
    async function buscarPendiente({ telefono, destino, ahora = new Date() }) {
        if (!telefono || !destino) return null;
        return Derivacion.findOne({ telefono, destino, estado: 'pendiente', expiraAt: { $gt: ahora } })
            .sort({ createdAt: -1 });
    }

    /**
     * Se marca después de que el modelo respondió: si la llamada a OpenAI falla, el
     * contexto sigue disponible para el próximo mensaje.
     */
    async function marcarEntregada(id, ahora = new Date()) {
        if (!id) return;
        await Derivacion.updateOne({ _id: id, estado: 'pendiente' }, { $set: { estado: 'entregada', entregadaAt: ahora } });
    }

    return { crear, buscarPendiente, marcarEntregada };
}

module.exports = { crearDerivaciones, formatearContexto, describirSolicitud, ttlHoras };
