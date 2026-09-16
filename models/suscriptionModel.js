const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    user: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    conversationId: {
        type: String,
        required: false
    },
    // Cédula o RIF normalizado (ej. "V-12345678", "J-12345678-9"). Es el identificador
    // con el que se van a cruzar los pagos, así que se guarda en una forma sola.
    cedula: {
        type: String,
        default: null
    },
    cedulaOrigen: {       // la dio el cliente por chat, o la escribió un asesor
        type: String,
        enum: ['cliente', 'asesor'],
        default: null
    },
    cedulaPor: {          // nombre del asesor que la escribió; null si la dio el cliente
        type: String,
        default: null
    },
    cedulaEn: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Para buscar por documento cuando llegue el cruce automático de pagos. Sparse: la
// mayoría de las suscripciones todavía no tiene cédula.
subscriptionSchema.index({ cedula: 1 }, { sparse: true });

const Subscription = mongoose.model("subscriptions", subscriptionSchema);
module.exports = Subscription;
