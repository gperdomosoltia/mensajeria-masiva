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
//
// Cada número de WhatsApp (instancia) pausa por su lado: silenciar a alguien en
// reservas no lo silencia en información general. Por eso la unicidad es por
// usuario + instancia; las pausas anteriores a la separación no tienen instancia y
// cuentan como del número general.
const mongoose = require('mongoose');

const botPauseSchema = new mongoose.Schema({
    // Número sin sufijo JID, igual que en black_list. Sin índice propio: el compuesto de
    // abajo empieza por `user` y ya sirve para buscar. Declararlo acá además recrearía un
    // índice llamado `user_1`, el mismo nombre del único viejo que hay que borrar.
    user: {
        type: String,
        required: true
    },
    botInstanceId: {  // nexus_general / nexus_reservas; null = anterior a la separación
        type: String,
        default: null
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

botPauseSchema.index({ user: 1, botInstanceId: 1 }, { unique: true });

// TTL: MongoDB elimina el documento en cuanto `until` queda en el pasado. Las pausas
// indefinidas (`until: null`) quedan fuera del TTL y no se borran solas.
botPauseSchema.index({ until: 1 }, { expireAfterSeconds: 0 });

const BotPause = mongoose.model("bot_pauses", botPauseSchema);

/**
 * El índice único viejo era solo `user`: con él, la segunda instancia no puede pausar a
 * alguien que ya está pausado en la otra. Mongoose no borra índices que salen del
 * schema, así que se borra acá al arrancar. Si ya no existe, no pasa nada.
 */
async function migrarIndicesDePausa() {
    try {
        await BotPause.collection.dropIndex('user_1');
        console.log('🗂️ Índice único viejo de bot_pauses (user_1) eliminado.');
    } catch (error) {
        if (error?.codeName !== 'IndexNotFound' && error?.code !== 27) {
            console.error('❌ No se pudo eliminar el índice user_1 de bot_pauses:', error.message);
        }
    }
    try {
        await BotPause.createIndexes();
    } catch (error) {
        console.error('❌ No se pudieron crear los índices de bot_pauses:', error.message);
    }
}

module.exports = BotPause;
module.exports.migrarIndicesDePausa = migrarIndicesDePausa;
