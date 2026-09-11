// Caso de validación de pago: se crea cuando un cliente manda un comprobante o pide
// los datos para pagar. La pausa real del bot vive en `bot_pauses` (con su TTL); este
// documento es la bitácora y la cola de trabajo del dashboard, y no se borra solo.
const mongoose = require('mongoose');

const paymentReviewSchema = new mongoose.Schema({
    user:          { type: String, required: true, index: true }, // número sin sufijo JID
    phone:         { type: String, required: true },              // JID completo (...@c.us)
    name:          { type: String, default: null },
    status:        { type: String, enum: ['pending', 'confirmed', 'expired'], default: 'pending' },
    motivo:        { type: String, enum: ['comprobante', 'datos_pago'], required: true },
    gcs_objectKey: { type: String, default: null },
    detectedAt:    { type: Date, default: Date.now },
    pauseUntil:    { type: Date, required: true },
    nextNotifyAt:  { type: Date, default: null },
    notifyCount:   { type: Number, default: 0 },
    confirmedAt:   { type: Date, default: null },
    confirmedBy:   { type: String, default: null },
    sentMessage:   { type: String, default: null }
}, { timestamps: true });

paymentReviewSchema.index({ status: 1, nextNotifyAt: 1 });
paymentReviewSchema.index({ status: 1, detectedAt: -1 });

module.exports = mongoose.model('payment_reviews', paymentReviewSchema);
