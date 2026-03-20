const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    id: { type: Number, unique: true, required: true }, // Tu ID personalizado (ej: 1)
    name: { type: String, required: true },
    contracted_messages: { type: Number, default: 0 }, // Límite de mensajes contratados
    // Relación virtual: Las campañas se buscarán usando el client_id
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);