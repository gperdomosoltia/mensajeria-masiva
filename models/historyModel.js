// bot-assitant/models/historyModel.js

const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    user: {
        type: String,
        required: true,
        index: true
    },
    message: {
        type: String,
        required: true
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
    type: { // ✅ CORREGIDO: El campo ahora se llama 'type'
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