// Avisos al cliente cuando el equipo resuelve una reserva desde el dashboard.
//
// Los textos son fijos (docs/cambios/CAMBIOS-RESERVAS.md, punto 6): el modelo no participa,
// así que ni inventa un estado ni se le escapa un motivo interno. `motivo` solo cambia
// el texto si es "sin_cupo"; la nota interna del asesor nunca llega hasta acá.
// Ninguno empieza con "No" ni habla de "humano", igual que el prompt.

const ZONA = 'America/Caracas';
const RECEPCION = '0424 274 5897';

const TIPOS = new Set(['confirmada', 'rechazada', 'cancelacion_aprobada', 'cancelacion_rechazada', 'cancelada_por_equipo']);

/** 2026-10-02T22:30:00Z → "jueves 2/10, 6:30 p. m." en hora de Caracas. */
function formatearFecha(inicio) {
    const fecha = new Date(inicio);
    if (Number.isNaN(fecha.getTime())) return '';
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat('es-VE', {
            timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        }).formatToParts(fecha).map(p => [p.type, p.value])
    );
    const hora24 = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' }).format(fecha));
    const sufijo = hora24 < 12 ? 'a. m.' : 'p. m.';
    return `${partes.weekday} ${partes.day}/${partes.month}, ${partes.hour}:${partes.minute} ${sufijo}`;
}

function nombreClase(clase, modalidad) {
    const c = String(clase || '').trim() || 'tu clase';
    const m = String(modalidad || '').trim();
    return m && m.toLowerCase() !== c.toLowerCase() ? `${c} ${m}` : c;
}

/**
 * @returns {{ok: true, texto: string} | {ok: false, error: string}}
 */
function textoDelAviso({ tipo, motivo, clase, modalidad, inicio, participante } = {}) {
    if (!TIPOS.has(tipo)) return { ok: false, error: 'tipo_invalido' };
    const nombre = `*${nombreClase(clase, modalidad)}*`;
    const fecha = formatearFecha(inicio);
    if (!fecha) return { ok: false, error: 'inicio_invalido' };
    const invitado = participante?.tipo === 'invitado'
        ? [participante.nombre, participante.apellido].map(s => String(s || '').trim()).filter(Boolean).join(' ')
        : '';

    switch (tipo) {
        case 'confirmada':
            return {
                ok: true,
                texto: invitado
                    ? `¡Listo! El cupo de ${invitado} para ${nombre} el ${fecha} quedó confirmado. Si al final no pueden venir, avísanos por aquí hasta una hora antes.`
                    : `¡Listo! Tu cupo para ${nombre} el ${fecha} quedó confirmado. Te esperamos en Nexus. Si no puedes venir, avísanos por aquí hasta una hora antes para liberar el cupo.`
            };
        case 'rechazada': {
            const para = invitado ? ` de ${invitado}` : '';
            return {
                ok: true,
                texto: motivo === 'sin_cupo'
                    ? `Te escribimos por tu solicitud${para} para ${nombre} el ${fecha}: la clase se llenó y esta vez no pudimos darte el cupo. Si quieres, te ayudo a buscar otro horario.`
                    : `Te escribimos por tu solicitud${para} para ${nombre} el ${fecha}: esta vez no pudimos asignarte ese cupo. Si quieres, te ayudo a buscar otro horario, y si prefieres hablarlo con el equipo, recepción atiende las 24 horas en el ${RECEPCION}.`
            };
        }
        case 'cancelacion_aprobada':
            return {
                ok: true,
                texto: `Listo, cancelamos ${invitado ? `la reserva de ${invitado}` : 'tu reserva'} de ${nombre} del ${fecha} y el cupo quedó libre. Gracias por avisarnos. Cuando quieras, te ayudo a reservar otra clase.`
            };
        case 'cancelacion_rechazada':
            return {
                ok: true,
                texto: `Te escribimos por la cancelación de ${nombre} del ${fecha}: ${invitado ? `la reserva de ${invitado}` : 'tu reserva'} sigue activa. Si tienes alguna duda, recepción te atiende en el ${RECEPCION}.`
            };
        case 'cancelada_por_equipo':
            return {
                ok: true,
                texto: `Te escribimos para avisarte que ${invitado ? `la reserva de ${invitado}` : 'tu reserva'} de ${nombre} del ${fecha} quedó cancelada. Si quieres, te ayudo a buscar otro horario.`
            };
        default:
            return { ok: false, error: 'tipo_invalido' };
    }
}

module.exports = { textoDelAviso, formatearFecha };
