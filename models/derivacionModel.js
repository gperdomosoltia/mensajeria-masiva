// Pase de un cliente de un número de WhatsApp de Nexus al otro.
//
// El bot general la crea cuando alguien quiere reservar (tool `derivar_a_reservas`) y
// el de reservas cuando alguien pregunta algo de información general
// (`derivar_a_informacion_general`). El cliente escribe después al otro número; la
// instancia destino busca aquí lo que ya contó y se lo pasa al modelo en el primer
// turno, para no hacerle repetir nada. La lógica vive en services/derivaciones.js.
const mongoose = require('mongoose');

const derivacionSchema = new mongoose.Schema({
    telefono: { type: String, required: true },   // 58XXXXXXXXXX, siempre el número real
    origen: { type: String, required: true },     // botInstanceId que la creó
    destino: { type: String, required: true },    // botInstanceId que la tiene que usar
    estado: {
        type: String,
        enum: ['pendiente', 'entregada', 'vencida'],
        default: 'pendiente'
    },
    contexto: { type: mongoose.Schema.Types.Mixed, default: {} },
    nombreCliente: { type: String, default: null },
    cedulaRegistrada: { type: Boolean, default: false },
    entregadaAt: { type: Date, default: null },
    expiraAt: { type: Date, required: true }
}, {
    timestamps: true
});

derivacionSchema.index({ telefono: 1, destino: 1, estado: 1, createdAt: -1 });

const Derivacion = mongoose.model('derivaciones', derivacionSchema);
module.exports = Derivacion;
