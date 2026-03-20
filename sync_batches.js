require('dotenv').config();
const mongoose = require('mongoose');
const Batch = require('./models/batchModel');
const Campaign = require('./models/campaignModel');

// --- CONFIGURACIÓN ---
const TARGET_CAMPAIGN_ID = 5; // ID de la campaña a la que asignaremos los lotes
const BATCH_SIZE = 100; // Cantidad de números por lote
const SOURCE_DB_URI = process.env.MONGO_URI_SOURCE || "mongodb+srv://gabrielsoler:zpzdpzfMOb7JidqE@seocontenidos.5birw.mongodb.net/seo-conf-2025-pruebas?retryWrites=true&w=majority&tls=true";

// Esquema temporal para leer la otra BD
const attendeeSourceSchema = new mongoose.Schema({
    phone: String,
    ticket: { publicUrl: String }
}, { strict: false });

// Helper de limpieza de números
function cleanPhoneNumber(rawPhone) {
    if (!rawPhone) return null;
    let digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    if (digits.startsWith('02')) return null; 
    if (digits.startsWith('5802')) return null;

    if (digits.startsWith('04')) digits = '58' + digits.substring(1);
    else if (digits.startsWith('4') && digits.length === 10) digits = '58' + digits;
    
    if (!digits.startsWith('584') && !digits.startsWith('57')) return null; 
    return digits;
}

(async () => {
    console.log("🚀 Iniciando extracción y creación de Batches...");

    try {
        // 1. Conexiones
        const dbTarget = await mongoose.connect(process.env.MONGO_URI, { family: 4 });
        console.log("✅ Conectado a DB Bot");
        
        const connSource = mongoose.createConnection(SOURCE_DB_URI, { family: 4 });
        const SourceAttendee = connSource.model('attendees', attendeeSourceSchema);
        console.log("✅ Conectado a DB Origen");

        // 2. Extraer Usuarios con Ticket
        console.log("🔍 Buscando asistentes con entrada...");
        const attendees = await SourceAttendee.find({
            "ticket.publicUrl": { $exists: true, $ne: null }
        });
        console.log(`📊 Total encontrados en origen: ${attendees.length}`);

        // 3. Limpieza y Deduplicación
        const uniquePhones = new Set();
        const validNumbers = [];

        attendees.forEach(person => {
            const phone = cleanPhoneNumber(person.phone);
            if (phone) {
                if (!uniquePhones.has(phone)) {
                    uniquePhones.add(phone);
                    // Estructura para el modelo Batch
                    validNumbers.push({ 
                        number: phone, 
                        sent: false, 
                        error: null 
                    });
                }
            }
        });

        console.log(`✨ Números únicos válidos a procesar: ${validNumbers.length}`);

        if (validNumbers.length === 0) {
            console.log("⚠️ No hay números nuevos para procesar.");
            process.exit(0);
        }

        // 4. Dividir en Lotes (Chunks)
        const chunks = [];
        for (let i = 0; i < validNumbers.length; i += BATCH_SIZE) {
            chunks.push(validNumbers.slice(i, i + BATCH_SIZE));
        }
        console.log(`📦 Se crearán ${chunks.length} lotes de máximo ${BATCH_SIZE} números.`);

        // 5. Guardar Batches y Actualizar Campaña
        // Obtener el último ID de lote global para no sobrescribir
        const lastBatch = await Batch.findOne().sort({ id: -1 });
        let nextBatchId = lastBatch ? lastBatch.id + 1 : 1;
        const newBatchIds = [];

        for (let i = 0; i < chunks.length; i++) {
            const currentId = nextBatchId++;
            
            await Batch.create({
                id: currentId,
                name: `Lote Importado SEO Conf - Parte ${i + 1}`,
                numbers: chunks[i],
                total_numbers: chunks[i].length,
                is_processed: false,
                campaign_id: TARGET_CAMPAIGN_ID
            });
            
            newBatchIds.push(currentId);
            process.stdout.write('.');
        }
        console.log("\n✅ Lotes creados en base de datos.");

        // 6. Vincular a la Campaña
        // Buscamos la campaña, si no existe la crea (upsert no es ideal aqui, mejor update)
        const campaign = await Campaign.findOne({ id: TARGET_CAMPAIGN_ID });
        if (campaign) {
            // Agregamos los nuevos IDs al array existente sin duplicar
            const updatedIds = [...new Set([...campaign.batch_ids, ...newBatchIds])];
            campaign.batch_ids = updatedIds;
            if (campaign.status === 'completed') campaign.status = 'pending'; // Reactivar si estaba terminada
            await campaign.save();
            console.log(`🔗 Campaña ${TARGET_CAMPAIGN_ID} actualizada con ${newBatchIds.length} nuevos lotes.`);
        } else {
            console.warn(`⚠️ La campaña ${TARGET_CAMPAIGN_ID} no existe. Crea el documento manual y asigna estos IDs de lote:`, newBatchIds);
        }

        console.log("🏁 Proceso finalizado con éxito.");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
})();