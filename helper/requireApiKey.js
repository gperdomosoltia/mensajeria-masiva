// Autenticación mínima para los endpoints HTTP del bot. Sin esto, cualquiera que
// conozca el dominio público de Railway puede mandar WhatsApp desde el número del
// negocio. Si BOT_API_KEY no está configurada el middleware deja pasar (para no
// tumbar producción en el despliegue intermedio) pero avisa en cada request.
const crypto = require('crypto');

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a ?? ''), 'utf8');
    const bufB = Buffer.from(String(b ?? ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function requireApiKey(req, res, next) {
    const expected = process.env.BOT_API_KEY;
    if (!expected) {
        console.warn('⚠️  BOT_API_KEY sin configurar: endpoint aceptado sin autenticar.');
        return next();
    }
    if (!safeEqual(req.header('x-api-key'), expected)) {
        return res.status(401).json({ success: false, error: 'no_autorizado' });
    }
    return next();
}

module.exports = { requireApiKey, safeEqual };
