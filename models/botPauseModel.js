// Pausa temporal del bot para un usuario concreto.
// Se crea cuando se notifica a un agente humano: el bot deja de responderle a ese
// número hasta que expira `until`, para que la persona atienda el chat sin
// interferencia. El índice TTL borra el documento solo al vencer la pausa.
const mongoose = require('mongoose');

const botPauseSchema = new mongoose.Schema({
    user: {           // número sin sufijo JID, igual que en black_list
        type: String,
        required: true,
        unique: true,
        index: true
    },
    until: {          // instante en el que el bot vuelve a responder
        type: Date,
        required: true
    },
    reason: {
        type: String,
        default: 'notificacion_agente'
    }
}, {
    timestamps: true
});

// TTL: MongoDB elimina el documento en cuanto `until` queda en el pasado.
botPauseSchema.index({ until: 1 }, { expireAfterSeconds: 0 });

const BotPause = mongoose.model("bot_pauses", botPauseSchema);
module.exports = BotPause;
