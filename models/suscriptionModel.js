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
    }
}, {
    timestamps: true
});

const Subscription = mongoose.model("subscriptions", subscriptionSchema);
module.exports = Subscription;
