const mongoose = require('mongoose');

const numberSchema = new mongoose.Schema({
    number: { type: String, required: true },
    sent: { type: Boolean, default: false },
    error: { type: String, default: null } // Para guardar si falló (ej: no tiene WS)
}, { _id: false }); // _id false para ahorrar espacio en subdocumentos

const batchSchema = new mongoose.Schema({
    id: { type: Number, required: true }, // ID del lote (ej: 100)
    name: { type: String }, // Ej: "Base Datos Caracas Parte 1"
    numbers: [numberSchema], // Array de números
    is_processed: { type: Boolean, default: false }, // True si TODOS los números de este doc se enviaron
    total_numbers: { type: Number, default: 0 },
    campaign_id: { type: Number, ref: 'Campaign' } // Opcional, para vincularlo directo
}, { timestamps: true });

// Índice para búsquedas rápidas
batchSchema.index({ id: 1 });

module.exports = mongoose.model('Batch', batchSchema);