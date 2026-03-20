require('dotenv').config();
const mongoose = require('mongoose');
const Personalizado = require('./models/personalizadoModel');

(async () => {
    // 1. Conexión
    if (!process.env.MONGO_URI) {
        console.error("❌ Falta MONGO_URI en .env");
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, { family: 4 });
    console.log("✅ Conectado a MongoDB");

    // 2. Buscar todos los contactos de esa campaña (ID 4)
    // Los ordenamos por fecha de creación para mantener el orden de llegada
    const CAMPAIGN_ID = 4; 
    const contactos = await Personalizado.find({ id_campaign: CAMPAIGN_ID }).sort({ createdAt: 1 });

    console.log(`🔄 Encontrados ${contactos.length} contactos en campaña ${CAMPAIGN_ID}. Re-numerando...`);

    // 3. Re-asignar IDs secuenciales
    let contador = 1;
    for (const contact of contactos) {
        // Solo actualizamos si el ID no es el correcto (optimización)
        if (contact.id !== contador) {
            contact.id = contador;
            await contact.save();
        }
        contador++;
        
        // Mostrar progreso cada 20 registros
        if (contador % 20 === 0) process.stdout.write(`.`);
    }

    console.log(`\n✨ ¡Listo! IDs actualizados del 1 al ${contador - 1}.`);
    process.exit();
})();