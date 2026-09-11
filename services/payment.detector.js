// Clasificador barato de imágenes: decide si la foto que mandó el cliente es un
// comprobante de pago (captura de pago móvil, transferencia, Zelle, recibo). Mismo
// patrón que analyzeImage en controller/function-calling.js. Cualquier error se
// traga y devuelve false: el flujo normal del bot nunca se bloquea por esto.
const { OpenAI } = require('openai');

let openai = null;

function getOpenAIClient() {
    if (!openai) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

const INSTRUCCION = [
    'Mira la imagen y responde SOLO con JSON, sin texto alrededor.',
    'Formato: {"es_comprobante": true|false, "confianza": 0.0-1.0}.',
    'es_comprobante es true si la imagen es un comprobante de pago: captura de pago móvil,',
    'transferencia bancaria, Zelle, recibo, voucher de punto de venta o confirmación de',
    'una app de banco. Es false para fotos de personas, del gimnasio, de máquinas,',
    'capturas de conversaciones o cualquier otra cosa.'
].join(' ');

function parseDetectorOutput(raw) {
    try {
        const limpio = String(raw ?? '').replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(limpio);
        const confianza = typeof parsed.confianza === 'number' && Number.isFinite(parsed.confianza) ? parsed.confianza : 0;
        return { esComprobante: parsed.es_comprobante === true, confianza };
    } catch (e) {
        return { esComprobante: false, confianza: 0 };
    }
}

async function esComprobante(imagenBase64, mimetype) {
    // Number(valor_basura) da NaN, y `confianza >= NaN` siempre es false: una var de
    // entorno mal puesta apagaría la detección de comprobantes en silencio. Por eso
    // solo se usa el valor parseado si es un número finito y positivo.
    const minConfEnv = Number(process.env.PAGO_DETECTOR_MIN_CONF);
    const minConf = Number.isFinite(minConfEnv) && minConfEnv > 0 ? minConfEnv : 0.7;
    try {
        const client = getOpenAIClient();
        const response = await client.chat.completions.create({
            model: process.env.PAGO_DETECTOR_MODEL || 'gpt-5-mini',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: INSTRUCCION },
                    { type: 'image_url', image_url: { url: `data:${mimetype || 'image/jpeg'};base64,${imagenBase64}`, detail: 'low' } }
                ]
            }]
        }, { timeout: 8000, maxRetries: 1 }); // I4: no dejar el lock del usuario colgado por el timeout/reintentos default del SDK (600s, 2 retries)
        const out = parseDetectorOutput(response.choices?.[0]?.message?.content);
        console.log('[PAGO_DETECTOR]', out);
        return out.esComprobante && out.confianza >= minConf;
    } catch (e) {
        console.error('❌ [PAGO_DETECTOR] Falló la clasificación, se sigue el flujo normal:', e.message);
        return false;
    }
}

module.exports = { parseDetectorOutput, esComprobante };
