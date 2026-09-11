const mongoose = require('mongoose');
const History = require('../models/historyModel');
const Subscription = require('../models/suscriptionModel');
const BotClient = require('../models/botClientModel'); // MANTENIDO
const BotPause = require('../models/botPauseModel');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function connectDB() {
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI no definida.');
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGO_URI, { family: 4 });
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error MongoDB:', error);
        process.exit(1);
    }
}

async function disconnectDB() {
    try { await mongoose.disconnect(); } catch (e) {}
}

// --- Funciones para BotClient (MANTENIDAS INTACTAS) ---

async function getBotClientConfig(masterIdentifier = process.env.DEFAULT_BOT_CLIENT_MASTER_ID) {
    if (!masterIdentifier) return null;
    try {
        return await BotClient.findOne({ bot_client_master: String(masterIdentifier).trim() });
    } catch (error) {
        return null;
    }
}

function isBotActive(botConfig) {
    return botConfig && botConfig.bot_status === true;
}

function isUserBlacklisted(userId, botConfig) {
    return botConfig && botConfig.black_list && botConfig.black_list.includes(userId);
}

function isUserWhitelisted(userId, botConfig) {
    return botConfig && botConfig.white_list && botConfig.white_list.includes(userId);
}

// --- Pausa temporal del bot por usuario ---
// Se activa al notificar a un agente humano: el bot calla mientras la persona
// atiende el chat y se reactiva solo al vencer el plazo.

const DEFAULT_PAUSE_HOURS = 2;

async function pauseBotForUser(userId, hours, reason) {
    const horas = Number(hours ?? process.env.BOT_PAUSE_HOURS ?? DEFAULT_PAUSE_HOURS);
    if (!userId || !Number.isFinite(horas) || horas <= 0) return null;
    const until = new Date(Date.now() + horas * 60 * 60 * 1000);
    try {
        return await BotPause.findOneAndUpdate(
            { user: String(userId) },
            { $set: { user: String(userId), until, reason: reason || 'notificacion_agente' } },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('❌ Error creando la pausa del bot:', error.message);
        return null;
    }
}

// Devuelve la pausa vigente o null. El TTL de Mongo borra el documento al vencer,
// pero puede tardar hasta un minuto: por eso se compara la fecha igual.
async function getBotPause(userId) {
    if (!userId) return null;
    try {
        const pause = await BotPause.findOne({ user: String(userId) });
        if (!pause || pause.until.getTime() <= Date.now()) return null;
        return pause;
    } catch (error) {
        return null;
    }
}

async function resumeBotForUser(userId) {
    if (!userId) return false;
    try {
        await BotPause.deleteOne({ user: String(userId) });
        return true;
    } catch (error) {
        return false;
    }
}

// --- Funciones para Subscription ---

async function findSubscription(userId) {
    try { return await Subscription.findOne({ user: userId }); } catch (e) { return null; }
}

async function createSubscription(userId, userName, conversationId) {
    try {
        return await Subscription.findOneAndUpdate(
            { user: userId },
            { $setOnInsert: { user: userId, name: userName || "Sin nombre", conversationId: conversationId } },
            { upsert: true, new: true }
        );
    } catch (error) { return null; }
}

async function updateSubscription(userId, dataToUpdate) {
    try {
        return await Subscription.findOneAndUpdate({ user: userId }, { $set: dataToUpdate }, { new: true });
    } catch (error) { return null; }
}

// --- Funciones para History ---

async function logHistory(data) {
    try {
        const historyEntry = new History(data);
        await historyEntry.save();
        return historyEntry;
    } catch (error) { return null; }
}

async function updateHistoryEntry(historyId, updateData) {
    try {
        return await History.findByIdAndUpdate(historyId, { $set: updateData }, { new: true });
    } catch (error) { return null; }
}

async function getCompleteHistory(userId) {
    try {
        return await History.find({ user: userId }).sort({ date: -1 }).limit(20);
    } catch (error) { return []; }
}

// 👇 NUEVA FUNCIÓN: Para guardar los mensajes en silencio con el teléfono real
async function saveSilentMessage(data) {
    try {
        const nuevoMensaje = new History({
            user: data.user,
            phone: data.phone,       // Guarda el número real
            name: data.name,         // Guarda el nombre del usuario
            message: data.message,
            type: data.type,
            status: data.status,     // Se guarda como 'ignored_by_bot'
            gcs_objectKey: data.gcs_objectKey, // I7: recuperable desde el historial (ej. comprobante de pago)
            read: false,
            date: new Date(),
            dateFormat: new Date().toLocaleDateString('es-ES')
        });

        await nuevoMensaje.save();
        return nuevoMensaje._id;
    } catch (error) {
        console.error("❌ Error guardando mensaje silencioso en Mongo:", error.message);
        return null;
    }
}

// 👇 SE EXPORTA LA NUEVA FUNCIÓN AL FINAL
module.exports = {
    connectDB,
    disconnectDB,
    getBotClientConfig,
    isBotActive,
    isUserBlacklisted,
    isUserWhitelisted,
    pauseBotForUser,
    getBotPause,
    resumeBotForUser,
    findSubscription,
    createSubscription,
    updateSubscription,
    logHistory,
    updateHistoryEntry,
    getCompleteHistory,
    saveSilentMessage 
};