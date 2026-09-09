const { MessageMedia } = require('whatsapp-web.js');

// Reimplementación de Message.prototype.downloadMedia() de whatsapp-web.js
// (src/structures/Message.js), con un solo cambio: usa `this.id._serialized
// ?? this.id.$1` en vez de `this.id._serialized` a secas.
//
// WhatsApp Web >= 2.3000.1043xxx expone el id del mensaje como `$1` en vez de
// `_serialized` para mensajes cuyo remitente llega como @lid (WhatsApp está
// migrando a identificadores que ocultan el número real). La librería sigue
// leyendo `_serialized`, que queda `undefined`; eso hace que `Msg.get(undefined)`
// falle adentro del navegador y salga como un error minificado y críptico
// ("r: r"). Es un bug conocido y ya reportado
// (https://github.com/wwebjs/whatsapp-web.js/issues/201856), con fix en un PR
// todavía sin mergear ni publicado en npm (#201840) — mientras no haya release
// oficial, evitamos la ruta rota reimplementando la función acá en vez de
// parchear node_modules (se perdería en cada `npm install` del build).
async function downloadMediaCompat(msg) {
    if (!msg.hasMedia) return undefined;

    const msgId = msg.id?._serialized ?? msg.id?.$1;
    if (!msgId) return undefined;

    const result = await msg.client.pupPage.evaluate(async (msgId) => {
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
            // try to resolve media
            await waMsg.downloadMedia({
                downloadEvenIfExpensive: true,
                rmrReason: 1,
            });
        }

        if (
            waMsg.mediaData.mediaStage.includes('ERROR') ||
            waMsg.mediaData.mediaStage === 'FETCHING'
        ) {
            // media could not be downloaded
            return undefined;
        }

        try {
            const mockQpl = {
                addAnnotations: function () {
                    return this;
                },
                addPoint: function () {
                    return this;
                },
            };
            const decryptedMedia = await window
                .require('WAWebDownloadManager')
                .downloadManager.downloadAndMaybeDecrypt({
                    directPath: waMsg.directPath,
                    encFilehash: waMsg.encFilehash,
                    filehash: waMsg.filehash,
                    mediaKey: waMsg.mediaKey,
                    mediaKeyTimestamp: waMsg.mediaKeyTimestamp,
                    type: waMsg.type,
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
    }, msgId);

    if (!result) return undefined;
    return new MessageMedia(
        result.mimetype,
        result.data,
        result.filename,
        result.filesize,
    );
}

module.exports = downloadMediaCompat;
