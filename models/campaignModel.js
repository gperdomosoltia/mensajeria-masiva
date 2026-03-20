const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    id: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    client_id: { type: Number, ref: 'Client', required: true },
    
    // Configuración del Mensaje
    message: { type: String, required: true }, // Soporta variables ej: "Hola {{name}}"
    media_url: { type: String }, // Opcional: URL de imagen/video

    personalizado: { type: Boolean, default: false },
    
    // Configuración de Tiempo
    scheduled_at: { type: Date, default: Date.now }, // Cuándo debe empezar
    status: { 
        type: String, 
        enum: ['pending', 'processing', 'paused', 'completed', 'failed'], 
        default: 'pending' 
    },

    // Configuración de Lotes
    batch_ids: [{ type: Number }], // Array de IDs de lotes a procesar (Ej: [100, 101, 102])

    // Configuración de Ritmo (Throttling)
    messages_per_block: { type: Number, default: 20 }, // Ej: Enviar 20 mensajes...
    min_delay_between_messages: { type: Number, default: 5 }, 
    max_delay_between_messages: { type: Number, default: 15 },
    
    min_delay_between_blocks: { type: Number, default: 60 },
    max_delay_between_blocks: { type: Number, default: 120 },
    
    // Progreso
    total_sent: { type: Number, default: 0 },
    total_failed: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Campaign', campaignSchema);