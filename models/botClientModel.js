// models/BotClient.js
const mongoose = require('mongoose');

const assistantSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true
    },
    id: { // ID del asistente de OpenAI
        type: String,
        required: true
    },
    description: { // Descripción opcional del propósito del asistente
        type: String
    }
}, {_id: false}); // _id: false para subdocumentos si no necesitas IDs individuales para ellos

const railwayCompartidoSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    compartidos: [{
        type: String
    }]
}, {_id: false});

const botClientSchema = new mongoose.Schema({
    bot_client_master: { // Identificador único del cliente/configuración del bot
        type: String,
        required: true
    },
    bot_status: { // Estado general del bot para esta configuración
        type: Boolean,
        default: true
    },
    black_list: { // Lista de usuarios bloqueados
        type: [String],
        default: []
    },
    white_list: { // Lista de usuarios con acceso privilegiado o exclusivo
        type: [String],
        default: []
    },
    asistente_principal: {
        type: assistantSchema,
        required: false
    },
    asistente_secundarios: {
        type: [assistantSchema],
        default: []
    },
    nombre_api_key_owner: { // Nombre descriptivo del dueño o propósito de la API key
        type: String,
        required: false
    },
    openai_api_key_env_name: { // Nombre de la variable de entorno que contiene la API Key de OpenAI
        type: String,
        required: false // Es mejor no guardar la API key directamente en la BD
    },
    railway_services_ids: { // IDs de servicios de Railway
        type: [String],
        default: []
    },
    railway_shared_projects: { // Proyectos compartidos en Railway
        type: [railwayCompartidoSchema],
        default: []
    },
    dashboard_link: {
        type: String,
        required: false
    },
    backend_link: {
        type: String,
        required: false
    },
    railway_token_env_name: { // Nombre de la variable de entorno para el token de Railway
        type: String,
        required: false
    },
    additional_config: { // Un objeto para configuraciones diversas y flexibles
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true // Añade createdAt y updatedAt automáticamente
});

const BotClient = mongoose.model("bot_clients", botClientSchema);
module.exports = BotClient;
