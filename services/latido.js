// Latido entre los dos bots: cada uno le escribe al otro cada 30 min para comprobar que
// su WhatsApp de verdad recibe mensajes.
//
// El 23/10 (5891) y el 28/10 (5897) un bot se quedó "sordo": el proceso seguía vivo, el
// panel lo mostraba vinculado y no le llegaba ningún mensaje, sin un solo error en los
// logs. /estado no lo nota porque lee un estado guardado en memoria. Lo único que prueba
// que entran mensajes es que entre uno: por eso cada bot le manda un latido al otro y
// avisa por Slack si deja de recibir los del otro mientras el otro sí los envía.
//
// Solo avisa, no reinicia (decisión del equipo): una vez por problema, y otra cuando se
// arregla. Los latidos no pasan por OpenAI ni se guardan en el historial (index.js).
// Cada bot vigila solo lo suyo; el estado vive en Mongo para sobrevivir a un reinicio.

const mongoose = require('mongoose');
const { publicarEnSlack } = require('./alertaSinCreditos');
const { INSTANCIA_RESERVAS } = require('./instancia');

const COLECCION = 'latidos_bots';
const MARCA = '#latido-nexus';
const INTERVALO_MS = 30 * 60_000;
const MARGEN_MS = 5 * 60_000;
// Dos latidos seguidos sin llegar, con margen para la entrega.
const SIN_RECIBIR_MS = 2 * INTERVALO_MS + MARGEN_MS;
// getState y sendMessage se cuelgan sin error cuando la página de WhatsApp Web se traba.
const TIMEOUT_MS = 30_000;
// Un fallo suelto de estado o de envío puede ser un tropiezo: se avisa al segundo seguido.
const FALLOS_PARA_AVISAR = 2;

function nombreBot(instancia) {
    return instancia === INSTANCIA_RESERVAS ? 'reservas (5891)' : 'información general (5897)';
}

function servicioRailway(instancia) {
    return instancia === INSTANCIA_RESERVAS ? 'bot-reservas' : 'mensajeria-masiva';
}

function fechaHoraVenezuela(fecha) {
    return fecha.toLocaleString('es-VE', {
        timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true
    });
}

function textoLatido(instancia, fecha) {
    return `${MARCA} ${instancia} ${fecha.toISOString()} · mensaje automático de control entre los bots, no responder.`;
}

/** Instancia que mandó el latido, o null si el texto no es un latido. */
function instanciaDeLatido(texto) {
    const partes = String(texto ?? '').trim().split(/\s+/);
    return partes[0] === MARCA && partes[1] ? partes[1] : null;
}

function conTimeout(promesa, ms) {
    let timer;
    const limite = new Promise((_, rechazar) => {
        timer = setTimeout(() => rechazar(new Error(`sin respuesta en ${ms / 1000} s`)), ms);
    });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
}

/** Qué le pasa a este bot, o null si está bien. */
function diagnosticar({ fecha, estado, fallosEstado, fallosEnvio, recibido, otroEnviado, arranque }) {
    if (fallosEstado >= FALLOS_PARA_AVISAR) return { tipo: 'sin_conexion', detalle: estado };
    if (fallosEnvio >= FALLOS_PARA_AVISAR) return { tipo: 'no_envia' };
    // Lo recibido antes de arrancar no cuenta en contra: tras un reinicio se le da tiempo.
    const desde = Math.max(recibido ? recibido.getTime() : 0, arranque.getTime());
    // Si el otro tampoco está enviando, no hay forma de saber si este recibe.
    const otroEnvia = otroEnviado && fecha - otroEnviado <= INTERVALO_MS + MARGEN_MS;
    if (otroEnvia && fecha - desde > SIN_RECIBIR_MS) return { tipo: 'no_recibe' };
    return null;
}

function textoProblema(instancia, problema, { recibido, arranque }) {
    const bot = nombreBot(instancia);
    const reinicio = `Qué hacer: reiniciar el servicio \`${servicioRailway(instancia)}\` en Railway (no hace falta escanear el QR).`;
    if (problema.tipo === 'no_recibe') {
        const ultimo = recibido
            ? `El último mensaje de control del otro bot llegó el ${fechaHoraVenezuela(recibido)}`
            : `No llegó ningún mensaje de control del otro bot desde que arrancó (${fechaHoraVenezuela(arranque)})`;
        return [
            `🟠 El bot de ${bot} no está recibiendo mensajes de WhatsApp.`,
            `${ultimo}, y el otro bot los sigue enviando sin problema.`,
            'En el panel puede seguir figurando como vinculado: el proceso está vivo, pero no le llegan los mensajes de los clientes.',
            reinicio,
            'Lo que escriban los clientes mientras tanto no queda en el panel: revisarlo en el teléfono.',
        ].join('\n');
    }
    if (problema.tipo === 'no_envia') {
        return [
            `🟠 El bot de ${bot} no logra enviar mensajes de WhatsApp (el mensaje de control falló dos veces seguidas).`,
            reinicio,
        ].join('\n');
    }
    return [
        `🟠 El bot de ${bot} no responde: WhatsApp Web no contesta (estado: ${problema.detalle}).`,
        reinicio,
    ].join('\n');
}

function textoArreglado(instancia) {
    return `🟢 El bot de ${nombreBot(instancia)} vuelve a funcionar con normalidad.`;
}

function crearLatido({
    instancia,
    otraInstancia,
    numeroOtro,
    enviar,
    consultarEstado,
    activo = () => true,
    coleccion = () => mongoose.connection.collection(COLECCION),
    avisar = publicarEnSlack,
    ahora = () => new Date(),
    arranque = ahora(),
    timeoutMs = TIMEOUT_MS,
}) {
    let fallosEstado = 0;
    let fallosEnvio = 0;
    let enCurso = false;
    let iniciado = false;

    /** true si el texto es un latido (el llamador no debe seguir procesándolo). Nunca lanza. */
    async function registrarRecibido(texto) {
        const origen = instanciaDeLatido(texto);
        if (!origen) return false;
        if (origen === instancia) return true;
        try {
            await coleccion().updateOne({ _id: instancia }, { $set: { recibido: ahora(), recibidoDe: origen } }, { upsert: true });
            console.log(`💓 Latido recibido de ${origen}.`);
        } catch (error) {
            console.error('❌ No se pudo anotar el latido recibido:', error.message);
        }
        return true;
    }

    async function ciclo() {
        const fecha = ahora();

        let estado;
        try {
            estado = await conTimeout(Promise.resolve(consultarEstado()), timeoutMs);
        } catch (error) {
            estado = `sin respuesta (${error.message})`;
        }
        fallosEstado = estado === 'CONNECTED' ? 0 : fallosEstado + 1;

        let enviado = false;
        try {
            await conTimeout(Promise.resolve(enviar(numeroOtro, textoLatido(instancia, fecha))), timeoutMs);
            enviado = true;
        } catch (error) {
            console.error(`❌ No se pudo enviar el latido a ${numeroOtro}:`, error.message);
        }
        fallosEnvio = enviado ? 0 : fallosEnvio + 1;

        const col = coleccion();
        if (enviado) await col.updateOne({ _id: instancia }, { $set: { enviadoOk: fecha } }, { upsert: true });
        const [mio, otro] = await Promise.all([col.findOne({ _id: instancia }), col.findOne({ _id: otraInstancia })]);
        const recibido = mio?.recibido ? new Date(mio.recibido) : null;

        const problema = diagnosticar({
            fecha, estado, fallosEstado, fallosEnvio, recibido, arranque,
            otroEnviado: otro?.enviadoOk ? new Date(otro.enviadoOk) : null,
        });
        const previo = mio?.problema ?? null;

        if (problema && problema.tipo !== previo) {
            console.error(`🚨 Latido: problema "${problema.tipo}" en ${instancia} (estado de WhatsApp: ${estado}).`);
            // Si Slack no lo recibe, no se anota: el próximo ciclo lo vuelve a intentar.
            if (await avisar(textoProblema(instancia, problema, { recibido, arranque }))) {
                await col.updateOne({ _id: instancia }, { $set: { problema: problema.tipo, problemaDesde: fecha } }, { upsert: true });
            }
            return;
        }

        if (!problema && previo) {
            // Un bot sordo recién reiniciado todavía no demostró nada: espera a que llegue un latido.
            const desde = mio.problemaDesde ? new Date(mio.problemaDesde) : fecha;
            if (previo === 'no_recibe' && !(recibido && recibido > desde)) return;
            if (await avisar(textoArreglado(instancia))) {
                await col.updateOne({ _id: instancia }, { $set: { problema: null, problemaDesde: null } }, { upsert: true });
            }
        }
    }

    async function cicloSeguro() {
        if (enCurso || !activo()) return;
        enCurso = true;
        try {
            await ciclo();
        } catch (error) {
            console.error('❌ Error en el ciclo del latido:', error.message);
        } finally {
            enCurso = false;
        }
    }

    /** Se llama en cada 'ready'; solo arma los timers la primera vez. */
    function iniciar() {
        if (iniciado) return;
        iniciado = true;
        setTimeout(cicloSeguro, 2 * 60_000);
        setInterval(cicloSeguro, INTERVALO_MS);
        console.log(`💓 Latido iniciado: cada ${INTERVALO_MS / 60_000} min a ${numeroOtro}.`);
    }

    return { registrarRecibido, ciclo, iniciar };
}

module.exports = { MARCA, INTERVALO_MS, textoLatido, instanciaDeLatido, diagnosticar, textoProblema, crearLatido };
