const Campaign = require('../models/campaignModel');
const Batch = require('../models/batchModel');
const Personalizado = require('../models/personalizadoModel');
const { paraphraseMessage } = require('./openai'); 

// --- Helpers ---
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getRandomDelay = (baseSeconds, maxSeconds) => {
    const min = (baseSeconds || 5) * 1000;
    const max = (maxSeconds || 15) * 1000;
    return Math.floor(Math.random() * (max - min + 1) + min);
};

function replaceVariables(template, contact) {
    let text = template;
    text = text.replace(/\{\{name\}\}/gi, contact.name || ""); 
    text = text.replace(/\{\{empresa\}\}/gi, contact.empresa || "");
    text = text.replace(/Hola\s+,/gi, 'Hola,');
    text = text.replace(/[^\S\n]{2,}/g, ' ');
    return text.trim();
}

function isWorkingHours() {
    const veTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/Caracas" });
    const veDate = new Date(veTimeStr);
    const day = veDate.getDay();
    const hour = veDate.getHours();
    console.log('=======================')
    console.log('day')
    console.log(day)
    console.log('hour')
    console.log(hour)
    console.log('=======================')

    // if (day === 0 /*|| day === 6*/) return false;
    if (hour < 8 || hour >= 22) return false;
    return true;
}

// --- Helper Robusto para obtener ID ---
async function getWhatsAppId(clientWp, number) {
    const rawNumber = number.replace(/[^0-9]/g, '');
    
    try {
        // Intentamos la forma oficial (que da error WidFactory a veces)
        const numberDetails = await clientWp.getNumberId(rawNumber);
        if (numberDetails) return numberDetails._serialized;
    } catch (e) {
        // Si falla (por WidFactory u otro), ignoramos y probamos manual
        // console.warn("⚠️ getNumberId falló, usando ID manual:", e.message);
    }

    // Fallback manual (para no detener el bot)
    // Esto asume que el número es válido y tiene WhatsApp
    return `${rawNumber}@c.us`;
}

// --- Lógica Principal ---

async function processActiveCampaigns(clientWp) {
    if (!isWorkingHours()) return;

    
    console.log("📢 Buscando campañas pendientes...");
    const ahora = new Date();

    const campaign2 = await Campaign.findOne({
        status: 'pending',
        $or: [
            // Opcion 1: Si la fecha está guardada correctamente como un Date de Mongo
            { scheduled_at: { $lte: ahora } },
            
            // Opcion 2: Si la fecha se guardó como un objeto con la propiedad "$date" (Tu caso actual)
            { "scheduled_at.$date": { $lte: ahora.toISOString() } }
        ]
    }).sort({ createdAt: 1 });
    
    const campaign = await Campaign.findOne({
        status: 'pending', 
        scheduled_at: { $lte: new Date() }
    }).sort({ scheduled_at: 1 });

    if (!campaign) {
        console.log("💤 Nada pendiente.");
        return;
    }

    console.log(`🚀 Iniciando campaña: ${campaign.name} (ID: ${campaign.id})`);
    
    campaign.status = 'processing';
    await campaign.save();

    const checkStopAndSave = async () => {
        const freshCampaign = await Campaign.findById(campaign._id, 'status');
        if (freshCampaign.status === 'paused') {
            console.log(`⏸️ Campaña PAUSADA manualmente.`);
            return true;
        }
        if (!isWorkingHours()) {
            console.log(`zzz Horario laboral finalizado. Guardando...`);
            campaign.status = 'pending';
            await campaign.save();
            return true;
        }
        return false;
    };

    // =========================================================
    // CASO 1: CAMPAÑA PERSONALIZADA
    // =========================================================
    if (campaign.personalizado) {
        const pendientes = await Personalizado.find({ id_campaign: campaign.id, process: false });

        if (pendientes.length === 0) {
            campaign.status = 'completed';
            await campaign.save();
            return;
        }

        console.log(`📝 Procesando ${pendientes.length} contactos personalizados.`);
        let templateVariant = await paraphraseMessage(campaign.message);
        let messagesInCurrentBlock = 0;
        
        console.log('================================')
        console.log('================================')
        console.log('templateVariant')
        console.log(templateVariant)
        console.log('================================')
        console.log('messagesInCurrentBlock')
        console.log(messagesInCurrentBlock)
        console.log('================================')
        console.log('campaign.messages_per_block')
        console.log(campaign.messages_per_block)
        console.log('================================')
        console.log('================================')

        for (const contact of pendientes) {
            if (await checkStopAndSave()) return;

            if (messagesInCurrentBlock >= campaign.messages_per_block) {
                const delay = getRandomDelay(campaign.min_delay_between_blocks, campaign.max_delay_between_blocks);
                console.log(`⏸️ Fin de bloque. Esperando ${Math.round(delay/1000)}s...`);
                await wait(delay);
                
                if (await checkStopAndSave()) return;
                templateVariant = await paraphraseMessage(campaign.message);
                messagesInCurrentBlock = 0;
            }

            if (messagesInCurrentBlock > 0) {
                const delay = getRandomDelay(campaign.min_delay_between_messages, campaign.max_delay_between_messages);
                await wait(delay);
            }

            const finalMessage = replaceVariables(templateVariant, contact);

            try {
                // USAMOS LA NUEVA FUNCIÓN ROBUSTA
                const jid = await getWhatsAppId(clientWp, contact.phone);

                // Prioridad: imagen del contacto > imagen de la campaña
                const mediaUrl = (contact.media_url && contact.media_url.trim()) || campaign.media_url;

                if (mediaUrl) {
                     const { MessageMedia } = require('whatsapp-web.js');
                     const media = await MessageMedia.fromUrl(mediaUrl);
                     let options = { caption: finalMessage };
                     if (mediaUrl.toLowerCase().endsWith('.pdf')) options.sendMediaAsDocument = true;
                     
                     await clientWp.sendMessage(jid, media, options);
                } else {
                     await clientWp.sendMessage(jid, finalMessage);
                }

                contact.process = true;
                contact.sent_at = new Date();
                contact.error = null;
                campaign.total_sent++;
                console.log(`✅ Enviado a ${contact.phone}`);

            } catch (err) {
                // Capturamos el error pero NO detenemos la campaña
                console.error(`❌ Falló envío a ${contact.phone}:`, err.message);
                contact.error = err.message; // Guardamos el error en el contacto
                campaign.total_failed++;
            }

            await contact.save();
            await campaign.save();
            messagesInCurrentBlock++;
        }
        
        const restantes = await Personalizado.countDocuments({ id_campaign: campaign.id, process: false });
        if (restantes === 0) {
            campaign.status = 'completed';
            await campaign.save();
        }

    } 
    // =========================================================
    // CASO 2: CAMPAÑA POR LOTES
    // =========================================================
    else {
        let currentMessageVariant = campaign.message;

        for (const batchId of campaign.batch_ids) {
            const batch = await Batch.findOne({ id: batchId, is_processed: false });
            if (!batch) continue;

            if (await checkStopAndSave()) return;

            console.log(`📂 Procesando Lote ID: ${batchId}`);
            currentMessageVariant = await paraphraseMessage(campaign.message);
            let messagesInCurrentBlock = 0;

            for (let i = 0; i < batch.numbers.length; i++) {
                const target = batch.numbers[i];
                if (target.sent) continue;

                if (await checkStopAndSave()) return;

                if (messagesInCurrentBlock >= campaign.messages_per_block) {
                    const delay = getRandomDelay(campaign.min_delay_between_blocks, campaign.max_delay_between_blocks);
                    console.log(`⏸️ Fin de bloque. Esperando ${Math.round(delay/1000)}s...`);
                    await wait(delay);
                    
                    if (await checkStopAndSave()) return;
                    currentMessageVariant = await paraphraseMessage(campaign.message);
                    messagesInCurrentBlock = 0; 
                }

                if (messagesInCurrentBlock > 0) {
                    const delay = getRandomDelay(campaign.min_delay_between_messages, campaign.max_delay_between_messages);
                    await wait(delay);
                }

                try {
                    // USAMOS LA NUEVA FUNCIÓN ROBUSTA
                    const jid = await getWhatsAppId(clientWp, target.number);
                    
                    if (campaign.media_url) {
                         const { MessageMedia } = require('whatsapp-web.js');
                         const media = await MessageMedia.fromUrl(campaign.media_url);
                         let options = { caption: currentMessageVariant };
                         if (campaign.media_url.toLowerCase().endsWith('.pdf')) options.sendMediaAsDocument = true;
                         
                         await clientWp.sendMessage(jid, media, options);
                    } else {
                         await clientWp.sendMessage(jid, currentMessageVariant);
                    }

                    target.sent = true;
                    campaign.total_sent++;
                    console.log(`✅ Enviado a ${target.number}`);

                } catch (error) {
                    console.error(`❌ Error envío:`, error.message);
                    target.error = error.message;
                    campaign.total_failed++;
                }

                messagesInCurrentBlock++;
                batch.markModified('numbers');
                await batch.save();
                await campaign.save();
            }

            const pendientes = batch.numbers.filter(n => !n.sent).length;
            if (pendientes === 0) {
                batch.is_processed = true;
                await batch.save();
            }
        }

        const lotesPendientes = await Batch.countDocuments({ id: { $in: campaign.batch_ids }, is_processed: false });
        if (lotesPendientes === 0) {
            campaign.status = 'completed';
            await campaign.save();
            console.log(`🏁 Campaña Finalizada.`);
        }
    }
}

module.exports = { processActiveCampaigns };
