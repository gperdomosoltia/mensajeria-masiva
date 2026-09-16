// Captura de los mensajes que un asesor escribe a mano desde el WhatsApp del negocio.
//
// `client.on('message')` solo entrega los entrantes, así que lo que responde una persona
// desde el teléfono o WhatsApp Web nunca llegaba al historial: en el dashboard el turno
// del asesor quedaba como un hueco y parecía que nadie había contestado. El evento que sí
// los entrega es `message_create`, pero ese también dispara con los mensajes del propio
// bot, porque para WhatsApp los dos son `fromMe`.
//
// De ahí el registro de envíos propios: el bot anota lo que manda y la captura descarta
// esas coincidencias. Se anota por partida doble porque WhatsApp a veces emite
// `message_create` ANTES de que `sendMessage` resuelva:
//   - el texto se anota justo ANTES de enviar, así que siempre está a tiempo;
//   - el id se anota al resolver, y cubre los envíos sin texto (medios de campaña).

const TTL_MS = 60_000;
const MAX_ENTRADAS = 500;

const MARCADORES = {
    image: '[imagen]',
    video: '[video]',
    ptt: '[nota de voz]',
    audio: '[audio]',
    document: '[documento]',
    sticker: '[sticker]',
    location: '[ubicación]'
};

function crearRegistroDeEnviosPropios({ ahora = () => Date.now(), ttlMs = TTL_MS } = {}) {
    const ids = new Map();      // id serializado -> instante en que se anotó
    const textos = new Map();   // "chat|texto"    -> instante en que se anotó

    // Los dos mapas se podan por antigüedad y por tamaño: este proceso vive semanas y no
    // debe acumular ids de mensajes para siempre.
    function podar(mapa) {
        const limite = ahora() - ttlMs;
        for (const [clave, momento] of mapa) {
            if (momento <= limite) mapa.delete(clave);
        }
        while (mapa.size > MAX_ENTRADAS) {
            const primera = mapa.keys().next();
            if (primera.done) break;
            mapa.delete(primera.value);
        }
    }

    const claveTexto = (chat, texto) => `${chat}|${String(texto ?? '').trim()}`;

    function vigente(mapa, clave) {
        const momento = mapa.get(clave);
        if (momento === undefined) return false;
        if (momento <= ahora() - ttlMs) { mapa.delete(clave); return false; }
        return true;
    }

    return {
        anotarId(id) {
            if (!id) return;
            ids.set(String(id), ahora());
            podar(ids);
        },
        anotarTexto(chat, texto) {
            const limpio = String(texto ?? '').trim();
            if (!chat || !limpio) return;
            textos.set(claveTexto(chat, limpio), ahora());
            podar(textos);
        },
        /**
         * ¿Este mensaje saliente lo mandó el bot? El texto se consume al acertar, para que
         * un segundo mensaje idéntico —esta vez del asesor— sí se capture.
         */
        esPropio(id, chat, texto) {
            if (id && vigente(ids, String(id))) return true;
            const clave = claveTexto(chat, texto);
            if (vigente(textos, clave)) { textos.delete(clave); return true; }
            return false;
        }
    };
}

/** Texto a mostrar en el historial; los adjuntos van con marcador y su pie de foto. */
function textoVisible(msg) {
    const cuerpo = String(msg?.body ?? '').trim();
    const marcador = MARCADORES[msg?.type];
    if (marcador) return cuerpo ? `${marcador} ${cuerpo}` : marcador;
    return cuerpo;
}

function crearCapturaDeAsesor({ registro, destinatariosVentas, guardarMensajeAsesor }) {
    /**
     * @returns {Promise<{guardado: boolean, motivo?: string}>}
     */
    return async function capturarMensajeSaliente(msg) {
        if (!msg || msg.fromMe !== true) return { guardado: false, motivo: 'no_es_saliente' };

        const destino = String(msg.to ?? '');
        // Solo chats individuales: un grupo, un canal o un estado no son una conversación
        // con un cliente.
        if (!destino.endsWith('@c.us')) return { guardado: false, motivo: 'no_es_chat_individual' };

        const agentes = new Set((typeof destinatariosVentas === 'function' ? destinatariosVentas() : []) || []);
        if (agentes.has(destino)) return { guardado: false, motivo: 'es_un_agente' };

        const texto = textoVisible(msg);
        if (!texto) return { guardado: false, motivo: 'sin_contenido' };

        if (registro && registro.esPropio(msg.id?._serialized, destino, msg.body)) {
            return { guardado: false, motivo: 'lo_mando_el_bot' };
        }

        try {
            await guardarMensajeAsesor({
                user: destino.split('@')[0],
                phone: destino,
                text: texto,
                type: msg.type || 'chat'
            });
        } catch (error) {
            console.error('❌ No se pudo guardar el mensaje del asesor:', error.message);
            return { guardado: false, motivo: 'error_al_guardar' };
        }
        return { guardado: true };
    };
}

module.exports = { crearRegistroDeEnviosPropios, crearCapturaDeAsesor, textoVisible };
