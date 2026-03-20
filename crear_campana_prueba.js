require('dotenv').config();
const mongoose = require('mongoose');

// Aquí definimos un esquema básico temporal para inyectar el dato.
// (Si prefieres, puedes importar directamente tu modelo original con: const Campaign = require('./ruta/a/tu/modelo/Campaign');)
const campaignSchema = new mongoose.Schema({
    name: String,
    message: String,
    recipients: [String],
    status: { type: String, default: 'pending' }, // 'pending' o 'active' según lo que espere tu marketing.service.js
    createdAt: { type: Date, default: Date.now }
}, { strict: false }); // strict: false permite inyectar campos extra si tu modelo original los requiere

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);

async function crearCampanaPrueba() {
    try {
        // Conectamos a MongoDB usando la variable que configuraste en tu .env
        if (!process.env.MONGO_URI) {
            throw new Error('No se encontró MONGO_URI en el archivo .env');
        }
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB exitosamente.');

        // Creamos el documento de la campaña
        const nuevaCampana = new Campaign({
            name: 'Campaña de Prueba Local - 01',
            message: '¡Hola! Este es un mensaje de prueba automatizado desde el sistema masivo. 🚀',
            // Asegúrate de usar el formato de números que procese tu bot (con código de país, ej: Venezuela 58...)
            recipients: ['584243522069', '584243522069','584243522069'], 
            status: 'pending'
        });

        const resultado = await nuevaCampana.save();
        console.log('✅ Campaña inyectada en la base de datos con éxito:');
        console.log(resultado);

    } catch (error) {
        console.error('❌ Ocurrió un error:', error.message);
    } finally {
        // Cerramos la conexión para que el script termine correctamente
        await mongoose.connection.close();
        console.log('🔌 Conexión a MongoDB cerrada.');
    }
}

crearCampanaPrueba();