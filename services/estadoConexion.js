// Estado de la sesión de WhatsApp de este proceso, para que el dashboard sepa si el
// número quedó desvinculado (alguien tiene que escanear el QR) sin leer los logs.
//
// Un bot desvinculado no puede avisar por su propio WhatsApp, así que no avisa: solo
// lo expone en GET /estado y el dashboard es quien vigila y muestra el aviso.

const ESTADOS = new Set(['iniciando', 'esperando_qr', 'conectado']);

function crearEstadoConexion(ahora = () => new Date()) {
    let estado = 'iniciando';
    let desde = ahora();

    return {
        /** Solo cambia `desde` cuando cambia el estado: un QR que se renueva no reinicia la cuenta. */
        marcar(nuevo) {
            if (!ESTADOS.has(nuevo)) throw new Error(`Estado de conexión desconocido: ${nuevo}`);
            if (nuevo === estado) return;
            estado = nuevo;
            desde = ahora();
        },
        leer() {
            return { estado, desde: desde.toISOString() };
        }
    };
}

/**
 * Página pública del QR de este servicio. Railway la expone en RAILWAY_PUBLIC_DOMAIN;
 * sin dominio público no hay dónde escanear y se devuelve null.
 */
function enlaceVinculacion(dominio = process.env.RAILWAY_PUBLIC_DOMAIN) {
    const valor = String(dominio ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return valor ? `https://${valor}/` : null;
}

module.exports = { crearEstadoConexion, enlaceVinculacion };
