// Pausa del bot para un usuario concreto: mientras exista este documento, el bot
// registra los mensajes de ese número pero no le responde.
//
// La crea `services/botPause.js`, que es el único sitio que decide cuándo se pone
// y cuándo se levanta. Dos clases:
//   - automática: `until` con fecha. La pone el aviso de reserva o el caso de pago
//     y se levanta sola al vencer; el índice TTL borra el documento.
//   - manual: la activa un asesor desde el dashboard, normalmente sin `until`
//     (indefinida). Mongo ignora los documentos cuyo campo TTL no es una fecha, así
//     que una pausa sin `until` no se autoborra: solo la levanta el botón Reanudar.
const mongoose = require('mongoose');

const botPauseSchema = new mongoose.Schema({
    user: {           // número sin sufijo JID, igual que en black_list
        type: String,
        required: true,
        unique: true,
        index: true
    },
    until: {          // instante en el que el bot vuelve a responder; null = indefinida
        type: Date,
        default: null
    },
    reason: {
        type: String,
        default: 'notificacion_agente'
    },
    manual: {         // true = la puso una persona; manda sobre las automáticas
        type: Boolean,
        default: false
    },
    pausedBy: {       // email del asesor que la activó, para poder rendir cuentas
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// TTL: MongoDB elimina el documento en cuanto `until` queda en el pasado. Las pausas
// indefinidas (`until: null`) quedan fuera del TTL y no se borran solas.
botPauseSchema.index({ until: 1 }, { expireAfterSeconds: 0 });

const BotPause = mongoose.model("bot_pauses", botPauseSchema);
module.exports = BotPause;
