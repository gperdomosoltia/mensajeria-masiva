require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const mongoController = require('./controller/mongo.controller.js');
const { transcribeAudio } = require('./services/openai.js');
const queue = require('./helper/queue.js');
const puppeteer = require('puppeteer');
const morgan = require('morgan');
const normalizeWhatsAppJid = require("./helper/normalizePhoneNumber.js");
const resolveLidToPhone = require("./helper/resolveLid.js");
const { uploadImage } = require("./services/gcs.service.js"); 
const { createNotifier } = require('./controller/notify.service');
const { setNotifier } = require('./controller/notifier.registry.js');
const { processActiveCampaigns } = require('./services/marketing.service.js');
const mongoose = require('mongoose');
const Campaign = require('./models/campaignModel');

// whatsapp-web.js registra un listener 'framenavigated' (src/Client.js) que
// llama `await this.inject()` sin try/catch en cada navegación de la página.
// El login de WhatsApp dispara varias navegaciones seguidas, y si una segunda
// navegación llega mientras la primera todavía está sondeando la página,
// pupPage.evaluate() tira "Execution context was destroyed" como rejection
// no capturada -> tumba TODO el proceso, incluso con sesión y versión de WA
// Web sanas. La librería reintenta inject() solo en la próxima navegación, así
// que basta con tragar el error aquí para que el proceso sobreviva a la
// carrera en vez de crashear el contenedor entero cada vez que alguien parea.
process.on('unhandledRejection', (reason) => {
    console.error('⚠️  Unhandled rejection (ignorada, ver comentario arriba):', reason);
});

// --- Configuración Básica ---
const PORT = process.env.PORT || 3000;
const PUBLIC_IMAGE_DIR = path.join(__dirname, 'public_images');
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const CACHE_DIR = path.join(__dirname, '.wwebjs_cache');
const CLIENT_ID = 'chrome-cft-3';


if (!fs.existsSync(PUBLIC_IMAGE_DIR)) fs.mkdirSync(PUBLIC_IMAGE_DIR, { recursive: true });

// --- Limpiar SingletonLock de Chromium (evita error en redeploys) ---
const sessionBasePath = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(sessionBasePath)) {
    const findAndRemoveLocks = (dir) => {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    findAndRemoveLocks(fullPath);
                } else if (entry.name === 'SingletonLock' || entry.name === 'SingletonCookie' || entry.name === 'SingletonSocket') {
                    fs.unlinkSync(fullPath);
                    console.log(`🔓 Lock eliminado: ${fullPath}`);
                }
            }
        } catch (e) {
            // Ignorar errores de permisos
        }
    };
    findAndRemoveLocks(sessionBasePath);
}

// --- Servidor Express ---
const app = express();
app.use(express.json());
app.use(morgan('dev'));
app.use('/media', express.static(PUBLIC_IMAGE_DIR));

let currentQR = null;

// --- Rutas Web (QR) ---
app.get('/', async (req, res) => {
    if (!currentQR) {
        return res.send('<h2>Esperando generación de QR... recarga en 5s</h2><script>setTimeout(()=>location.reload(), 5000)</script>');
    }
    const qrDataURL = await qrcode.toDataURL(currentQR);
    res.send(`<div style="text-align:center;"><h2>Escanea con WhatsApp</h2><img src="${qrDataURL}" /><p>Bot Activo</p></div>`);
});

app.listen(PORT, () => console.log(`🌐 Server en puerto ${PORT}`));

// --- Cliente WhatsApp ---
const client = new Client({
    // clientId nuevo (2026-09-07, tercera vez): cada vez que la sesión guardada
    // en el volumen queda inválida (logout desde el teléfono, perfil viejo
    // incompatible), whatsapp-web.js se cuelga tratando de restaurarla -
    // "Execution context was destroyed" o, si tarda más, "Runtime.callFunctionOn
    // timed out" al llegar al protocolTimeout de puppeteer - y nunca llega a
    // emitir 'qr'. El handler de 'disconnected'/LOGOUT ya borra la sesión sola
    // de aquí en adelante (ver abajo); este bump es solo para saltar la que ya
    // quedó corrupta en el volumen antes de tener ese fix. Requiere re-escanear
    // el QR una vez.
    authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
    // Fija la versión de WhatsApp Web: la versión "live" rompe la inyección de
    // whatsapp-web.js ("Execution context was destroyed"). Actualizar el número
    // si WhatsApp vuelve a romper la inyección o el pareo por QR empieza a fallar
    // (2026-09-07: la anterior, 2.3000.1040426045, quedó ~6.5M builds vieja y
    // causaba "Couldn't link device" al escanear).
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1046953833-alpha.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu'
        ],
    }
});

// Borra la carpeta de sesión de LocalAuth y sale para que Railway
// (restartPolicy ON_FAILURE) levante un contenedor nuevo. Se usa tanto en
// LOGOUT (sesión invalidada por el teléfono) como en el watchdog de abajo
// (sesión que nunca logra estabilizar sola es tan sospechosa como una
// invalidada — no tiene sentido reintentar la misma carpeta para siempre).
function wipeSessionAndExit(motivo) {
    const sessionDir = path.join(AUTH_DIR, `session-${CLIENT_ID}`);
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🗑️ Sesión eliminada (${motivo}): ${sessionDir}`);
    } catch (e) {
        console.error('❌ No se pudo borrar la sesión:', e);
    }
    console.log('♻️ Saliendo para reinicio limpio del contenedor...');
    process.exit(1);
}

// --- Inicialización ---
(async () => {
    await mongoController.connectDB();
    console.log("📡 Conectando a WhatsApp...");
    client.initialize();
})();

// Watchdog: como ahora tragamos las unhandledRejection de whatsapp-web.js (ver
// arriba) para no crashear en la carrera de framenavigated, un inject() que
// falle en firme (auth timeout, contexto muerto sin más navegaciones que lo
// reintenten) ya no tumba el proceso — se queda colgado en silencio para
// siempre, y Railway nunca lo reinicia porque nunca sale con error. Si no
// llega ni 'qr' ni 'ready' en READY_TIMEOUT_MS desde el arranque (o desde el
// último 'qr', que sí se reemite mientras la sesión sigue viva esperando
// escaneo), asumimos que la sesión guardada (si la hay) está en mal estado
// -tal como una invalidada por LOGOUT- y la borramos antes de reiniciar, para
// no quedar reintentando la misma sesión rota cada 90s para siempre.
const READY_TIMEOUT_MS = 90000;
let watchdog = setTimeout(() => {
    wipeSessionAndExit(`sin 'qr' ni 'ready' en ${READY_TIMEOUT_MS / 1000}s`);
}, READY_TIMEOUT_MS);

client.on('qr', qr => {
    currentQR = qr;
    console.log('🔍 QR Recibido. Escanéalo en el navegador.');
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
        wipeSessionAndExit(`sin nuevo 'qr' ni 'ready' en ${READY_TIMEOUT_MS / 1000}s`);
    }, READY_TIMEOUT_MS);
});

client.on('ready', () => {
    clearTimeout(watchdog);
    currentQR = null;
    console.log('✅ WhatsApp Conectado y Listo.');
    // Aquí eliminamos initCronJobs()
    setInterval(async () => {
        try {
            await processActiveCampaigns(client);
        } catch (e) {
            console.error("Error en ciclo de marketing:", e);
        }
    }, 60000); // 60000 ms = 10 minutos
    
    console.log('📢 Sistema de Marketing Automático iniciado.');
});

client.on('disconnected', (reason) => {
    console.log('🔌 Desconectado:', reason);
    if (reason === 'LOGOUT') {
        // LOGOUT significa que el teléfono desvinculó el dispositivo: la sesión
        // guardada en el volumen queda inválida. No reintentamos
        // client.initialize() aquí: el puppeteer/page de la sesión vieja queda a
        // medio destruir y la reinyección revienta con "Execution context was
        // destroyed". wipeSessionAndExit borra la sesión y sale limpio para que
        // Railway (restartPolicy ON_FAILURE) levante un contenedor nuevo con
        // browser fresco y QR nuevo de una.
        wipeSessionAndExit('LOGOUT');
    }
});

// --- Helper para enviar mensajes ---
async function enviarMensajeWhatsapp(rawUserId, message) {
    if (!rawUserId || !message) return;
    try {
        await client.sendMessage(rawUserId, message);
        return true;
    } catch (err) {
        console.error(`❌ Error enviando mensaje:`, err);
        return false;
    }
}

// --- Notificador de Agentes de Ventas ---
const handleAgentNotification = createNotifier({
    client,
    mongoose,
    pauseBotForUser: mongoController.pauseBotForUser,
    MessageMedia,
    enviarMensajeWhatsapp,
    fetch
});

// Lo dejamos disponible para services/ai/respond.js, que dispara la tool
// `notificar_humano` desde este mismo proceso.
setNotifier(handleAgentNotification);

// --- Manejador de Mensajes ---
const processingUsers = new Set();
const startTimestamp = Math.floor(Date.now() / 1000);

client.on('message', async msg => {
    if (msg.author) return; 
    if (msg.timestamp && msg.timestamp < startTimestamp) return;
    if (msg.from === 'status@broadcast') return;
    // Los canales (@newsletter) no son conversaciones: getChat() revienta con ellos.
    if (msg.from.endsWith('@newsletter')) return;
    console.log("Entrando a mensajes: ", msg.from);

    const allowedTypes = ['chat', 'ptt', 'audio', 'image', 'location'];
    if (!allowedTypes.includes(msg.type)) return;

    // WhatsApp ahora entrega los remitentes como `@lid`. Hay que traducirlos a
    // `@c.us` antes de usarlos: son la clave de suscripciones, historial y blacklist.
    const rawUserId = await resolveLidToPhone(client, msg.from);
    const userId = rawUserId.split('@')[0];
    
    if (processingUsers.has(rawUserId)) return;

    try {
        processingUsers.add(rawUserId);

        // --- LÓGICA BOT CLIENT ---
        const botConfig = await mongoController.getBotClientConfig();
        
        // Si no hay config o el bot está apagado globalmente
        if (!botConfig || !mongoController.isBotActive(botConfig)) return;
        
        // Verificación de Blacklist
        if (mongoController.isUserBlacklisted(userId, botConfig)) {
            if (rawUserId !== process.env.AGENTE) {
                console.log(`🚫 Usuario ${userId} en lista negra.`);
                return;
            }
        }

        // Pausa temporal: ya se notificó a un agente de ventas y el humano está
        // atendiendo este chat. Se registra el mensaje pero el bot no responde
        // hasta que venza la pausa (BOT_PAUSE_HOURS).
        const pausa = await mongoController.getBotPause(userId);
        if (pausa) {
            console.log(`⏸️ Bot en pausa para ${userId} hasta ${pausa.until.toISOString()} (atiende un humano).`);
            await mongoController.saveSilentMessage({
                user: userId,
                phone: rawUserId,
                message: msg.body || `[${msg.type}]`,
                type: msg.type,
                status: 'paused_for_human'
            });
            return;
        }

        const contact = await msg.getContact();
        const userName = contact.pushname || "Usuario";

        // `chat` solo alimenta el indicador "escribiendo…" (helper/queue.js), que ya
        // valida que exista. Si getChat() falla, se responde igual sin indicador.
        let chat = null;
        try {
            chat = await msg.getChat();
        } catch (err) {
            console.warn(`⚠️  No se pudo obtener el chat de ${userId}; se responde sin indicador de escritura.`);
        }

        // 1. Procesar contenido
        let messagePart = null;

        if (msg.type === 'ptt' || msg.type === 'audio') {
            const media = await msg.downloadMedia();
            const transcription = await transcribeAudio(media);
            messagePart = { type: 'text', content: transcription.text, caption: null, originalMessageType: msg.type };
        } else if (msg.type === 'image') {
            const media = await msg.downloadMedia();
            const imageBuffer = Buffer.from(media.data, 'base64');
            const dataUrl = await uploadImage(imageBuffer, media.filename || 'image.jpg', media.mimetype);
            const dataImg = `data:${media.mimetype};base64,${media.data}`;
            
            messagePart = {
                type: 'image',
                gcs_objectKey: dataUrl,
                content: dataImg,
                caption: msg.caption || null,
                originalMessageType: 'image'
            };
        } else if (msg.type === 'location') {
            messagePart = { type: 'location', content: { latitude: msg.location.latitude, longitude: msg.location.longitude }, caption: null, originalMessageType: 'location' };
        } else {
            messagePart = { type: 'text', content: msg.body, caption: null, originalMessageType: msg.type };
        }

        // Ignorar comandos que empiezan con !
        if (messagePart.type === 'text' && messagePart.content.startsWith('!')) return;

        // 2. Enviar a la Cola (Queue) -> OpenAI
        // =================================================================
        // 🟢 BOT ENCENDIDO: La IA vuelve a responder
        // =================================================================
        queue.addMessageToQueue(chat, userId, userName, rawUserId, messagePart, async (to, reply, historyId, result) => {
            if (reply && reply.trim() !== '') {
                await enviarMensajeWhatsapp(to, reply);
                await mongoController.updateHistoryEntry(historyId, { 
                    response: reply, 
                    status: "responded",
                    promptTokens: result?.usage?.input_tokens,
                    completionTokens: result?.usage?.output_tokens,
                    totalTokens: result?.usage?.total_tokens
                });
            }
        });

    } catch (err) {
        console.error(`❌ Error procesando mensaje de ${userId}:`, err);
    } finally {
        processingUsers.delete(rawUserId);
    }
});

// --- Endpoints API ---

app.post('/enviar', async (req, res) => {
    const { to, message } = req.body;
    if(!to || !message) return res.status(400).json({ success: false, error: "Falta 'to' o 'message'" });
    const jid = normalizeWhatsAppJid(to);
    const result = await enviarMensajeWhatsapp(jid, message);
    res.json({ success: Boolean(result), to: jid});
});

app.post('/notificar_agente', async (req, res) => {
    const success = await handleAgentNotification(req.body);
    if (success && success.result) {
        res.json({ success: true, destinatarios: success.destinatarios, pausedUntil: success.pausedUntil });
    } else {
        res.status(400).json({ success: false, error: success?.error });
    }
});

// Reactivar el bot para un usuario antes de que venza la pausa automática.
app.post('/bot/reanudar', async (req, res) => {
    const { user } = req.body;
    if (!user) return res.status(400).json({ success: false, error: "Falta 'user'" });
    const ok = await mongoController.resumeBotForUser(String(user).split('@')[0]);
    res.json({ success: ok });
});

// Endpoint para Pausar manualmente
app.post('/campaign/pause', async (req, res) => {
    const { id } = req.body;
    try {
        await Campaign.updateOne({ id: id }, { status: 'paused' });
        res.json({ success: true, message: `Campaña ${id} PAUSADA.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para Reanudar manualmente
app.post('/campaign/resume', async (req, res) => {
    const { id } = req.body;
    try {
        await Campaign.updateOne({ id: id }, { status: 'pending' });
        res.json({ success: true, message: `Campaña ${id} REANUDADA.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Manejo de cierre
async function cerrarConexiones() {
    try { await client.destroy(); } catch (e) {}
    try { await mongoController.disconnectDB(); } catch (e) {}
    process.exit(0);
}
process.on('SIGINT', cerrarConexiones);
process.on('SIGTERM', cerrarConexiones);
