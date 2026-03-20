const mongoose = require('mongoose');

const personalizadoSchema = new mongoose.Schema({
    id: { type: Number }, // Puede ser autogenerado o el Nº del CSV
    name: { type: String, default: "" }, // Nombre de la persona (o vacío)
    empresa: { type: String, default: "" }, // Nombre de la empresa
    phone: { type: String, required: true }, // Número saneado (58412...)
    process: { type: Boolean, default: false }, // Si ya se envió
    sent_at: { type: Date },
    error: { type: String },
    id_campaign: { type: Number, ref: 'Campaign', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Personalizado', personalizadoSchema);