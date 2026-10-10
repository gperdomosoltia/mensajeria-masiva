// Tools del bot de reservas contra la API de clases del dashboard.
//
// Las reglas (cupo, anticipación, duplicados, ventana de cancelación, semana
// publicada) viven en el dashboard (server/classBotApi.ts). Acá solo se traduce: se
// completa el teléfono y la cédula desde el chat, se entiende cómo escribe la gente el
// nombre de una clase o una hora, y se le devuelve al modelo un resultado que el prompt
// sabe leer. Ninguna de estas tools pausa el bot.

const { normalizarCedula } = require('./identity');

const TIMEOUT_MS_DEFAULT = 8000;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function normalizarTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Lo que el modelo escribe cuando no tiene el dato (el esquema de la tool exige nombre y
// apellido, así que a veces rellena) y el "Usuario" que pone index.js si el contacto no
// tiene nombre. Ninguno es un nombre: se trata como si faltara.
const NOMBRES_DE_RELLENO = new Set([
    'cliente', 'el cliente', 'la cliente', 'usuario', 'usuaria', 'sin nombre', 'nombre', 'apellido',
    'titular', 'invitado', 'invitada', 'desconocido', 'desconocida', 'n a', 'na', 'no aplica', 'x'
]);

// Devuelve el primer valor que sea un nombre de verdad, o '' si ninguno lo es.
function primerNombreReal(...valores) {
    for (const valor of valores) {
        const texto = String(valor ?? '').trim();
        const normalizado = normalizarTexto(texto);
        if (normalizado && !NOMBRES_DE_RELLENO.has(normalizado)) return texto;
    }
    return '';
}

// Cómo llama la gente a cada clase → cómo está cargada en el dashboard. El filtro de
// la API es exacto, así que "spinning" o "crossfit" no encontrarían nada sin esto.
const ALIAS_CLASES = [
    { alias: ['training bike', 'trainingbike'], clase: 'Bike', modalidad: 'Training Bike' },
    { alias: ['xtreme bike', 'extreme bike', 'xtreme', 'extreme'], clase: 'Bike', modalidad: 'Xtreme Bike' },
    { alias: ['cycling', 'ciclismo', 'spinning', 'spin'], clase: 'Bike', modalidad: 'Cycling' },
    { alias: ['bike', 'bici', 'bicicleta', 'bicicletas', 'cycle'], clase: 'Bike' },
    { alias: ['pilates', 'pilates reformer', 'reformer'], clase: 'Pilates' },
    { alias: ['crossfun', 'cross fun', 'crossfit', 'cross fit', 'cross'], clase: 'Crossfun' },
    { alias: ['funcionales', 'funcional', 'functional'], clase: 'Funcionales' },
    { alias: ['gluteos', 'gluteo', 'gluteos y piernas'], clase: 'Glúteos' },
    { alias: ['abdominales', 'abdominal', 'abs', 'abdomen'], clase: 'Abdominales' },
    { alias: ['boxeo', 'box', 'boxing'], clase: 'Boxeo' },
    { alias: ['stretching', 'stretch', 'estiramiento', 'estiramientos', 'elongacion'], clase: 'Stretching' },
    { alias: ['fitcombat', 'fit combat'], clase: 'Fitcombat' },
    { alias: ['yoga'], clase: 'Yoga' },
    { alias: ['baile', 'bailoterapia', 'dance', 'danza', 'zumba'], clase: 'Baile' }
];

/** "spinning" → { clase: 'Bike', modalidad: 'Cycling' }; algo desconocido → { texto }. */
function resolverClase(clase, modalidad) {
    const q = normalizarTexto(clase);
    const m = normalizarTexto(modalidad);
    let objetivo = null;
    for (const entrada of ALIAS_CLASES) {
        if (entrada.alias.includes(q)) { objetivo = { clase: entrada.clase, modalidad: entrada.modalidad || null }; break; }
    }
    // La modalidad explícita manda ("bike" + "xtreme").
    if (m) {
        const porModalidad = ALIAS_CLASES.find(e => e.modalidad && e.alias.includes(m));
        if (porModalidad) objetivo = { clase: porModalidad.clase, modalidad: porModalidad.modalidad };
        else if (objetivo) objetivo = { ...objetivo, modalidad: modalidad };
    }
    if (objetivo) return objetivo;
    return q ? { texto: q } : null;
}

function coincideClase(sesion, objetivo) {
    if (!objetivo) return true;
    const nombre = normalizarTexto(sesion.clase);
    const modalidad = normalizarTexto(sesion.modalidad);
    if (objetivo.texto) {
        return nombre.includes(objetivo.texto) || objetivo.texto.includes(nombre)
            || (modalidad && (modalidad.includes(objetivo.texto) || objetivo.texto.includes(modalidad)));
    }
    if (nombre !== normalizarTexto(objetivo.clase)) return false;
    // La modalidad es opcional en el dashboard: una sesión de Bike sin modalidad vale
    // para quien pide Cycling, Training Bike o Xtreme Bike.
    return !objetivo.modalidad || !modalidad || modalidad === normalizarTexto(objetivo.modalidad);
}

/**
 * "6:30 pm", "6pm", "18:30", "18h", "7 a. m." → "HH:mm". Sin am/pm se toma tal cual,
 * como hora de 24 h. Lo que no se entiende devuelve null y no filtra.
 */
function normalizarHora(valor) {
    // normalizarTexto convierte ":" y "." en espacios; sin espacios, "6:30 p. m." queda "630pm".
    const s = normalizarTexto(valor).replace(/\s/g, '');
    if (!s) return null;
    const m = s.match(/^(\d{1,2})(?:h?(\d{2}))?h?(am|pm)?$/);
    if (!m) return null;
    let hora = Number(m[1]);
    const minutos = m[2] ? Number(m[2]) : 0;
    const sufijo = m[3] || '';
    if (sufijo === 'pm' && hora < 12) hora += 12;
    if (sufijo === 'am' && hora === 12) hora = 0;
    if (hora > 23 || minutos > 59) return null;
    return `${String(hora).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function nombresDeClases(sesiones) {
    const nombres = [];
    for (const s of sesiones) {
        const nombre = s.modalidad ? `${s.clase} (${s.modalidad})` : s.clase;
        if (!nombres.includes(nombre)) nombres.push(nombre);
    }
    return nombres;
}

function crearClienteClases({ fetch, baseUrl = process.env.DASHBOARD_BASE_URL, secret = process.env.CLASES_BOT_SECRET, timeoutMs } = {}) {
    const timeout = Number(timeoutMs || process.env.CLASES_TIMEOUT_MS || TIMEOUT_MS_DEFAULT);

    /** Nunca lanza: devuelve { ok, status, data } y los fallos de red como ok:false. */
    async function llamar(metodo, ruta, { query, body } = {}) {
        if (!baseUrl || !secret) {
            console.error('❌ [CLASES] Falta DASHBOARD_BASE_URL o CLASES_BOT_SECRET.');
            return { ok: false, status: 0, data: null };
        }
        const url = new URL(ruta, baseUrl);
        for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url.toString(), {
                method: metodo,
                headers: { 'content-type': 'application/json', 'x-clases-bot-secret': secret },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) console.error(`❌ [CLASES] ${metodo} ${ruta} respondió ${res.status}:`, data);
            return { ok: res.ok, status: res.status, data };
        } catch (error) {
            console.error(`❌ [CLASES] ${metodo} ${ruta} falló:`, error?.message || error);
            return { ok: false, status: 0, data: null };
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        sesiones: (fecha) => llamar('GET', '/api/clases/sesiones', { query: { fecha } }),
        reservar: (body) => llamar('POST', '/api/clases/reservas', { body }),
        reservas: (telefono) => llamar('GET', '/api/clases/reservas', { query: { telefono } }),
        solicitarCancelacion: (id, telefono) => llamar('POST', `/api/clases/reservas/${encodeURIComponent(id)}/solicitar-cancelacion`, { body: { telefono } })
    };
}

const ERROR_TECNICO = { resultado: 'error' };

const PAUSA_RESERVA_FUERA_DE_PLAZO_HORAS = 0.5;

function horasDeAnticipacion(minutos) {
    const m = Number(minutos);
    if (!Number.isFinite(m) || m <= 0) return null;
    return m % 60 === 0 ? `${m / 60} h` : `${m} min`;
}

/**
 * El dashboard no deja solicitar dentro de la anticipación mínima, pero en recepción sí
 * pueden reservar a mano si queda cupo. Por eso, en vez de cerrar la puerta, el bot le
 * pasa el caso al asesor con todos los datos y la conversación queda pausada para que
 * la siga una persona. Sin cupo no hay nada que hacer y se responde como siempre.
 */
function debeDerivarseAlAsesor(resultado) {
    if (resultado?.resultado !== 'fuera_de_ventana') return false;
    const cupos = resultado.sesion?.cuposDisponibles;
    return typeof cupos !== 'number' || cupos > 0;
}

function avisoReservaFueraDePlazo({ resultado, titular, participante, telefono, rawUserId }) {
    const sesion = resultado.sesion || {};
    const clase = sesion.modalidad ? `${sesion.clase} (${sesion.modalidad})` : (sesion.clase || '');
    const quien = `${participante.nombre} ${participante.apellido}`.trim();
    const para = participante.tipo === 'invitado'
        ? `${quien} (cédula ${participante.cedula}), invitado de ${titular.nombre} ${titular.apellido}`.trim()
        : `${quien} (cédula ${participante.cedula})`;
    const plazo = horasDeAnticipacion(resultado.anticipacionMinutos);
    const cupos = typeof sesion.cuposDisponibles === 'number' ? ` Quedan ${sesion.cuposDisponibles} cupos.` : '';
    return {
        tipo_notificacion: 'RESERVA',
        descripcion: `Quiere un cupo para ${para}. La clase empieza en menos de ${plazo || 'el plazo mínimo'} de anticipación, así que el bot no puede solicitarla.${cupos} Si se puede, regístrala a mano en la agenda y escríbele por WhatsApp. La conversación quedó pausada.`,
        nombre_cliente: titular.nombre,
        apellido_cliente: titular.apellido,
        servicio: clase,
        fecha: sesion.fecha || '',
        hora: sesion.hora || '',
        telefono: rawUserId || telefono,
        skip_pause: false,
        // La clase es para dentro de poco: si el asesor no la toma en media hora, el bot
        // vuelve a atender en vez de dejar a la persona sin respuesta.
        pause_hours: PAUSA_RESERVA_FUERA_DE_PLAZO_HORAS
    };
}

// Con solo `puedeReservarAhora: false` el modelo cerraba la puerta ("ya no la puedo
// pedir") aunque el prompt dijera que ofreciera el asesor. La instrucción va pegada a la
// sesión, que es lo que el modelo lee al decidir.
const SI_LA_QUIERE_IGUAL = 'Empieza antes de la anticipación mínima, así que tú no puedes solicitarla, pero tiene cupo: '
    + 'ofrécele pasarle la solicitud a un asesor, que revisa si puede reservarla a mano. Si acepta, pide los datos '
    + 'como siempre y llama a reservar_cupo_clase con este sessionId; el sistema avisa al asesor.';

function conOpcionDeAsesor(sesion) {
    if (sesion.motivoBloqueo !== 'fuera_de_ventana') return sesion;
    if (typeof sesion.cuposDisponibles === 'number' && sesion.cuposDisponibles <= 0) return sesion;
    return { ...sesion, siLaQuiereIgual: SI_LA_QUIERE_IGUAL };
}

function crearToolsDeClases({ cliente, findSubscription, updateSubscription, notificarAsesor }) {
    async function consultarHorarios(args = {}) {
        const fecha = String(args.fecha || '').trim();
        if (!FECHA.test(fecha)) {
            return { status: 'error', mensaje: 'La fecha tiene que ir como YYYY-MM-DD. Calcúlala con la fecha actual que te da el sistema y vuelve a llamar.' };
        }
        const r = await cliente.sesiones(fecha);
        if (!r.ok || !r.data) return { status: 'error', mensaje: 'No se pudo consultar el horario ahora.' };

        const todas = Array.isArray(r.data.sesiones) ? r.data.sesiones : [];
        const respuesta = { fecha, semanaPublicada: r.data.semanaPublicada === true };
        if (!respuesta.semanaPublicada) return { ...respuesta, sesiones: [] };

        const objetivo = resolverClase(args.clase, args.modalidad);
        const deLaClase = todas.filter(s => coincideClase(s, objetivo)).map(conOpcionDeAsesor);
        const hora = normalizarHora(args.hora);
        const aEsaHora = hora ? deLaClase.filter(s => s.hora === hora) : deLaClase;

        if (aEsaHora.length) return { ...respuesta, sesiones: aEsaHora };
        if (hora && deLaClase.length) {
            return { ...respuesta, sesiones: deLaClase, nota: `No hay sesión a las ${hora}; estas son las de esa clase en esa fecha.` };
        }
        return {
            ...respuesta,
            sesiones: [],
            nota: todas.length ? 'No hay sesiones de esa clase en esa fecha.' : 'No quedan sesiones publicadas para esa fecha.',
            clasesDelDia: nombresDeClases(todas)
        };
    }

    /**
     * La titular siempre es quien escribe. Su cédula sale de la suscripción (la que ya
     * registró cualquiera de los dos bots) y su nombre de esta llamada o de la última
     * reserva que hizo.
     */
    async function reservarCupo(args = {}, { telefono, rawUserId, userName }) {
        const sessionId = String(args.sessionId || '').trim();
        if (!OBJECT_ID.test(sessionId)) return { resultado: 'sesion_no_disponible' };

        const esInvitado = args.participante === 'invitado';
        const subscription = await findSubscription(rawUserId);
        const cedulaTitular = subscription?.cedula || null;
        if (!cedulaTitular) return { resultado: 'falta_cedula', falta: 'titular' };

        const guardado = subscription?.titularReserva || {};
        const titular = {
            nombre: primerNombreReal(args.titular_nombre, esInvitado ? null : args.nombre, guardado.nombre, userName),
            apellido: primerNombreReal(args.titular_apellido, esInvitado ? null : args.apellido, guardado.apellido)
        };
        if (!titular.nombre || !titular.apellido) {
            return { resultado: 'falta_datos_titular', mensaje: 'Pide nombre y apellido de quien escribe y vuelve a llamar con titular_nombre y titular_apellido.' };
        }
        if (titular.nombre !== guardado.nombre || titular.apellido !== guardado.apellido) {
            await updateSubscription(rawUserId, { titularReserva: titular });
        }

        let participante;
        if (esInvitado) {
            const crudo = String(args.cedula || '').trim();
            if (!crudo) return { resultado: 'falta_cedula', falta: 'participante' };
            const normalizada = normalizarCedula(crudo);
            participante = {
                tipo: 'invitado',
                nombre: primerNombreReal(args.nombre),
                apellido: primerNombreReal(args.apellido),
                cedula: normalizada.ok ? normalizada.valor : crudo
            };
            if (!participante.nombre || !participante.apellido) {
                return { resultado: 'falta_datos_invitado', mensaje: 'Falta el nombre o el apellido del invitado.' };
            }
        } else {
            participante = { tipo: 'titular', ...titular, cedula: cedulaTitular };
        }

        const r = await cliente.reservar({
            sessionId,
            telefono,
            conversationUserId: telefono,
            titular: { ...titular, cedula: cedulaTitular },
            participante,
            aceptaListaEspera: args.aceptaListaEspera === true
        });
        if (!r.ok || !r.data?.resultado) return ERROR_TECNICO;
        if (debeDerivarseAlAsesor(r.data) && typeof notificarAsesor === 'function') {
            const aviso = await notificarAsesor(avisoReservaFueraDePlazo({ resultado: r.data, titular, participante, telefono, rawUserId }));
            if (!aviso?.result) return ERROR_TECNICO;
            return {
                resultado: 'derivada_a_asesor',
                mensaje: 'La clase está dentro del plazo mínimo, pero queda cupo: un asesor revisa si puede reservarla a mano y le escribe por este chat.'
            };
        }
        return r.data;
    }

    async function misReservas({ telefono }) {
        const r = await cliente.reservas(telefono);
        if (!r.ok || !r.data) return { status: 'error', mensaje: 'No se pudieron consultar las reservas ahora.' };
        return { reservas: Array.isArray(r.data.reservas) ? r.data.reservas : [] };
    }

    async function solicitarCancelacion(args = {}, { telefono }) {
        const id = String(args.reservationId || '').trim();
        // El dashboard responde 500 con un id mal formado; para el modelo es "no existe".
        if (!OBJECT_ID.test(id)) return { resultado: 'no_encontrada' };
        const r = await cliente.solicitarCancelacion(id, telefono);
        if (!r.ok || !r.data?.resultado) return ERROR_TECNICO;
        return r.data;
    }

    return { consultarHorarios, reservarCupo, misReservas, solicitarCancelacion };
}

module.exports = {
    crearClienteClases,
    crearToolsDeClases,
    resolverClase,
    coincideClase,
    normalizarHora,
    normalizarTexto
};
