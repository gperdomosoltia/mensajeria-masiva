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
    // Conversación de OpenAI del número general. Se queda con este nombre porque es el
    // que ya tienen todas las suscripciones anteriores a la separación por instancia.
    conversationId: {
        type: String,
        required: false
    },
    // Conversaciones de OpenAI de las demás instancias, por botInstanceId
    // ({ nexus_reservas: "conv_…" }). Cada número tiene su propio hilo con el modelo;
    // la cédula y el resto de la suscripción sí se comparten.
    conversaciones: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined
    },
    // Nombre y apellido con los que la persona pidió su primera reserva. Hace falta al
    // reservar para un invitado: la reserva siempre lleva los datos de quien escribe.
    titularReserva: {
        nombre: { type: String, default: null },
        apellido: { type: String, default: null }
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
