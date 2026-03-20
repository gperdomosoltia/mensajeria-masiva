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
const { uploadImage } = require("./services/gcs.service.js"); 
const { createNotifier } = require('./controller/notify.service');
const { addToBlackList } = require('./controller/function-calling.js');
const { processActiveCampaigns } = require('./services/marketing.service.js');
const mongoose = require('mongoose');


// --- Configuración Básica ---
const PORT = process.env.PORT || 3000;
const PUBLIC_IMAGE_DIR = path.join(__dirname, 'public_images');
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const CACHE_DIR = path.join(__dirname, '.wwebjs_cache');


if (!fs.existsSync(PUBLIC_IMAGE_DIR)) fs.mkdirSync(PUBLIC_IMAGE_DIR, { recursive: true });

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
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Crucial para evitar errores de memoria en Docker
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ],
    }
});

// --- Inicialización ---
(async () => {
    await mongoController.connectDB();
    console.log("📡 Conectando a WhatsApp...");
    client.initialize();
})();

client.on('qr', qr => {
    currentQR = qr;
    console.log('🔍 QR Recibido. Escanéalo en el navegador.');
});

client.on('ready', () => {
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

client.on('disconnected', async (reason) => {
    console.log('🔌 Desconectado:', reason);
    if (reason === 'LOGOUT') {
        try { await client.destroy(); } catch (e) {}
        console.log('♻️ Reiniciando cliente...');
        client.initialize();
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

// --- Notificador de Agentes (Mantenido) ---
const handleAgentNotification = createNotifier({
    client,
    mongoose,
    addToBlackList,
    MessageMedia,
    enviarMensajeWhatsapp,
    fetch
});

// --- Manejador de Mensajes ---
const processingUsers = new Set();
const startTimestamp = Math.floor(Date.now() / 1000);

client.on('message', async msg => {
    if (msg.author) return; 
    if (msg.timestamp && msg.timestamp < startTimestamp) return;
    if (msg.from === 'status@broadcast') return;
    console.log("Entrando a mensajes: ", msg.from);

    const allowedTypes = ['chat', 'ptt', 'audio', 'image', 'location'];
    if (!allowedTypes.includes(msg.type)) return;

    const rawUserId = msg.from;
    const userId = rawUserId.split('@')[0];
    
    if (processingUsers.has(rawUserId)) return;

    try {
        processingUsers.add(rawUserId);

        // --- LÓGICA BOT CLIENT (Mantenida) ---
        const botConfig = await mongoController.getBotClientConfig();
        
        // Si no hay config o el bot está apagado globalmente
        if (!botConfig || !mongoController.isBotActive(botConfig)) return;
        
        // Verificación de Blacklist
        if (mongoController.isUserBlacklisted(userId, botConfig)) {
            // Si es el agente probando, lo dejamos pasar, si no, retornamos
            if (rawUserId !== process.env.AGENTE) {
                console.log(`🚫 Usuario ${userId} en lista negra.`);
                return;
            }
        }

        const userName = (await msg.getContact()).pushname || "Usuario";
        const chat = await msg.getChat();

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
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
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