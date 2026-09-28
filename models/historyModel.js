// bot-assitant/models/historyModel.js

const mongoose = require('mongoose');
const { botInstanceId } = require('../services/instancia');

const historySchema = new mongoose.Schema({
    user: {
        type: String,
        required: true,
        index: true
    },
    // Número de WhatsApp por el que entró el turno (nexus_general / nexus_reservas). El
    // dashboard arma una bandeja por instancia con esto. Va por default para que ningún
    // sitio que guarda historial pueda olvidarlo.
    botInstanceId: {
        type: String,
        default: () => botInstanceId()
    },
    // 👇 NUEVO CAMPO: Para guardar el teléfono real
    phone: {
        type: String,
        required: false 
    },
    // 👇 NUEVO CAMPO: Para guardar el nombre de perfil de WhatsApp
    name: {
        type: String,
        required: false
    },
    message: {
        // Opcional: un mensaje que el asesor escribe a mano desde el WhatsApp del negocio
        // se guarda como turno sin entrada del cliente, solo con `response`.
        type: String,
        required: false
    },
    gcs_objectKey: {
        type: String,
        default: null
    },
    response: {
        type: String,
        required: false
    },
    responseBy: {
        type: String,
        enum: ['bot', 'agent'],
        required: function() { return !!this.response; }
    },
    type: { 
        type: String,
        required: false
    },
    caption: {
        type: String,
        required: false
    },
    promptTokens: {
        type: Number,
        required: false
    },
    completionTokens: {
        type: Number,
        required: false
    },
    totalTokens: {
        type: Number,
        required: false
    },
    status: {
        type: String,
        required: false
    },
    read: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        required: false
    },
    dateFormat: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});

historySchema.set('toJSON', { virtuals: true });
historySchema.set('toObject', { virtuals: true });

const History = mongoose.model("histories", historySchema);
module.exports = History;