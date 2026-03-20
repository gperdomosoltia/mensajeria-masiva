const mongoose = require('mongoose');
const History = require('../models/historyModel');
const Subscription = require('../models/suscriptionModel');
const BotClient = require('../models/botClientModel'); // MANTENIDO
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

module.exports = {
    connectDB,
    disconnectDB,
    getBotClientConfig,
    isBotActive,
    isUserBlacklisted,
    isUserWhitelisted,
    findSubscription,
    createSubscription,
    updateSubscription,
    logHistory,
    updateHistoryEntry,
    getCompleteHistory
};