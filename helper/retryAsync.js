// Reintenta `fn` cuando tira error, con una pausa fija entre intentos.
// Usado para llamadas puntuales a page.evaluate() (via whatsapp-web.js) que
// pueden chocar con una navegación interna de WhatsApp Web y morir con
// "Execution context was destroyed" incluso en una sesión ya estable: la
// librería reinyecta sola en 1-2s, así que alcanza con reintentar después de
// ese margen en vez de perder el mensaje.
async function retryAsync(fn, attempts = 3, delayMs = 1500, onRetry) {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (onRetry) onRetry(err, i);
            if (i < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastErr;
}

module.exports = retryAsync;
