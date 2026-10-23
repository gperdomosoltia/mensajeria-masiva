const { MessageMedia } = require('whatsapp-web.js');

// Reimplementación de Message.prototype.downloadMedia() de whatsapp-web.js
// (src/structures/Message.js). Cambios respecto de la librería:
//
// 1. Usa `this.id._serialized ?? this.id.$1` en vez de `this.id._serialized` a
//    secas. WhatsApp Web >= 2.3000.1043xxx expone el id del mensaje como `$1`
//    para remitentes @lid (WhatsApp está migrando a identificadores que ocultan
//    el número real). La librería sigue leyendo `_serialized`, que queda
//    `undefined`; eso hace que `Msg.get(undefined)` falle adentro del navegador
//    y salga como un error minificado y críptico ("r: r"). Bug reportado
//    (https://github.com/wwebjs/whatsapp-web.js/issues/201856), con fix en un PR
//    sin publicar en npm (#201840).
//
// 2. (2026-10-23) Le pasa `mimetype` a downloadAndMaybeDecrypt. Las versiones
//    nuevas de WhatsApp Web toman el tipo de ese argumento y, si falta, usan
//    `application/octet-stream` y rechazan el archivo con InvalidMediaFileType
//    ("t: t" en los logs). Solo se nota con archivos que no están en la caché
//    del navegador, o sea casi todos los que manda un cliente. Issue #201908,
//    fix en el PR #201914 (sin publicar).
//
// 3. (2026-10-23) `downloadQpl` es un Proxy que acepta cualquier método, no
//    solo addAnnotations/addPoint: WhatsApp Web le llama métodos nuevos y el
//    objeto a medias también tiraba "t: t" (comentario del 22/10 en #201908).
//
// 4. (2026-10-23) Deja de esperar si el archivo pasa a REUPLOADING mientras se
//    descarga. Eso pasa cuando el archivo venció en el servidor: WhatsApp le
//    pide al teléfono del remitente que lo vuelva a subir y su downloadMedia
//    interno espera una respuesta que puede no llegar nunca. Hasta ahora solo
//    lo cortaba el protocolTimeout de puppeteer (3 min por intento, 9 min con
//    los reintentos), y el 23/10 dejó al bot de reservas sin recibir mensajes
//    hasta que se reinició. PR #201932 (sin publicar).
//
// 5. Los errores de adentro del navegador salen con nombre y mensaje, no como
//    el "t: t" minificado, para que el log diga qué falló.
//
// Mientras no haya release oficial, la función vive acá en vez de parchear
// node_modules (se perdería en cada `npm install` del build).
async function downloadMediaCompat(msg) {
    if (!msg.hasMedia) return undefined;

    const msgId = msg.id?._serialized ?? msg.id?.$1;
    if (!msgId) return undefined;

    const result = await msg.client.pupPage.evaluate(async (msgId) => {
        try {
            const waMsg =
                window.require('WAWebCollections').Msg.get(msgId) ||
                (
                    await window
                        .require('WAWebCollections')
                        .Msg.getMessagesById([msgId])
                )?.messages?.[0];

            // REUPLOADING mediaStage means the media is expired and the download button is spinning, cannot be downloaded now
            if (
                !waMsg ||
                !waMsg.mediaData ||
                waMsg.mediaData.mediaStage === 'REUPLOADING'
            ) {
                return null;
            }
            if (waMsg.mediaData.mediaStage != 'RESOLVED') {
                // try to resolve media, but stop waiting if it turns out to be expired
                const { mediaData } = waMsg;
                const puedeEscuchar = typeof mediaData.on === 'function';
                let onStageChange;
                const reuploading = new Promise((resolve) => {
                    onStageChange = () => {
                        if (mediaData.mediaStage === 'REUPLOADING') resolve();
                    };
                    if (puedeEscuchar) mediaData.on('change:mediaStage', onStageChange);
                });
                try {
                    await Promise.race([
                        waMsg.downloadMedia({
                            downloadEvenIfExpensive: true,
                            rmrReason: 1,
                        }),
                        reuploading,
                    ]);
                } finally {
                    if (puedeEscuchar) mediaData.off('change:mediaStage', onStageChange);
                }
            }

            if (
                waMsg.mediaData.mediaStage.includes('ERROR') ||
                waMsg.mediaData.mediaStage === 'FETCHING' ||
                waMsg.mediaData.mediaStage === 'REUPLOADING'
            ) {
                // media could not be downloaded
                return undefined;
            }

            try {
                const mockQpl = new Proxy({}, {
                    get(target, prop, receiver) {
                        if (prop === 'then') return undefined;
                        return () => receiver;
                    },
                });
                const decryptedMedia = await window
                    .require('WAWebDownloadManager')
                    .downloadManager.downloadAndMaybeDecrypt({
                        directPath: waMsg.directPath,
                        encFilehash: waMsg.encFilehash,
                        filehash: waMsg.filehash,
                        mediaKey: waMsg.mediaKey,
                        mediaKeyTimestamp: waMsg.mediaKeyTimestamp,
                        type: waMsg.type,
                        mimetype: waMsg.mimetype,
                        signal: new AbortController().signal,
                        downloadQpl: mockQpl,
                    });

                const data = await window.WWebJS.arrayBufferToBase64Async(decryptedMedia);

                return {
                    data,
                    mimetype: waMsg.mimetype,
                    filename: waMsg.filename,
                    filesize: waMsg.size,
                };
            } catch (e) {
                if (e.status && e.status === 404) return undefined;
                throw e;
            }
        } catch (e) {
            return { errorEnNavegador: `${e?.name || 'Error'}: ${e?.message || String(e)}` };
        }
    }, msgId);

    if (result?.errorEnNavegador) throw new Error(result.errorEnNavegador);
    if (!result) return undefined;
    return new MessageMedia(
        result.mimetype,
        result.data,
        result.filename,
        result.filesize,
    );
}

module.exports = downloadMediaCompat;
