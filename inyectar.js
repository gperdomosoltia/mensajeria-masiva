require('dotenv').config();
const mongoose = require('mongoose');

// Importa solo tu modelo de campaña
const Campaign = require('./models/campaignModel'); 

async function inyectarCampana() {
    try {
        if (!process.env.MONGO_URI) throw new Error("Falta MONGO_URI");

        // await mongoose.connect(process.env.MONGO_URI);
        await mongoose.connect('mongodb://mongo:iZQmnJHFLElwECNqCYukoMmdkcjJaPRx@ballast.proxy.rlwy.net:32670');
        console.log('🟢 Conectado a MongoDB en Railway.');

        // const nuevaCampana = new Campaign({
        //     id: 10, // ID único
        //     name: "Campaña Mujer Raiz - PRUEBA 3",
        //     client_id: 1,
        //     message: "¡Hola {{name}}! \nTe escribe Uma, de Mujer Raíz y hoy queremos invitarte a un evento especial.\n\nLa Alcaldía de Baruta e Infinito Positivo presentan Mujer Raíz, un ecosistema para impulsar la formación, el desarrollo y la proyección empresarial de la mujer. Será un encuentro para conocer la visión, el alcance y las oportunidades de articulación con aliados estratégicos, empresas e instituciones.\n\n📍La presentación será el martes 24 de marzo en la Torre Gerais de Las Mercedes.\n\n⏰ Para que puedas asistir diseñamos para tu comodidad dos horarios: 10:00 a.m. y 4:00 p.m. \n\nSolo debes elegir el que mejor te convenga y confirma tu asistencia.\n\nSerá un placer contar con tu asistencia",
        //     media_url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663324533207/OWWzfGziwqNUEUFq.png",
        //     personalizado: true,
        //     status: "pending", // Lista para arrancar
        //     scheduled_at: new Date("2026-03-20T20:00:00.000Z"), // Forzado a Fecha Nativa
        //     messages_per_block: 20,
        //     min_delay_between_messages: 5,
        //     max_delay_between_messages: 15,
        //     min_delay_between_blocks: 60,
        //     max_delay_between_blocks: 120,
        //     total_sent: 0,
        //     total_failed: 0
        // });

        const nuevaCampana = new Campaign({
            id: 20,
            name: "Campaña Masiva Mujer Raiz",
            client_id: 1,
            message: "¡Hola {{name}}! \nTe escribe Uma, de Mujer Raíz y hoy queremos invitarte a un evento especial.\n\nLa Alcaldía de Baruta e Infinito Positivo presentan Mujer Raíz, un ecosistema para impulsar la formación, el desarrollo y la proyección empresarial de la mujer. Será un encuentro para conocer la visión, el alcance y las oportunidades de articulación con aliados estratégicos, empresas e instituciones.\n\n📍La presentación será el martes 24 de marzo en la Torre Gerais de Las Mercedes.\n\n⏰ Para que puedas asistir diseñamos para tu comodidad dos horarios: 10:00 a.m. y 4:00 p.m. \n\nSolo debes elegir el que mejor te convenga y confirma tu asistencia.\n\nSerá un placer contar con tu asistencia",
            media_url: "",
            personalizado: true,
            status: "pending",
            
            // ✨ LA MAGIA: Fecha nativa de JavaScript para que Mongoose no explote
            scheduled_at: new Date("2026-03-21T12:35:00.000Z"), 
            
            // Tiempos de seguridad (en segundos, tu función getRandomDelay los pasará a ms)
            messages_per_block: 5,
            min_delay_between_messages: 30,
            max_delay_between_messages: 60,
            min_delay_between_blocks: 300,
            max_delay_between_blocks: 600,
            
            // Mantenemos tu progreso de envío actual
            total_sent: 50,
            total_failed: 9
        });

        await nuevaCampana.save();
        console.log('✅ Campaña 11 insertada con formato de Fecha nativo perfecto.');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error inyectando datos:', error.message);
        process.exit(1);
    }
}

inyectarCampana();