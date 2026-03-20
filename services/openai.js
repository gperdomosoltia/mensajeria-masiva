const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const {deleteFile} = require('../controller/function-calling');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getChatGPTResponse(prompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [{ role: 'user', content: prompt }]
  });
  return response.choices[0].message.content.trim();
}

// --- NUEVA FUNCIÓN PARA PARAFRASEAR CON GPT-5-MINI ---
async function paraphraseMessage(originalText) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-5-mini', // O gpt-4o-mini
            messages: [
                { 
                    role: "system", 
                    content: "Eres un experto en copywriting para WhatsApp. Tu tarea es reescribir el mensaje del usuario manteniendo la misma intención. IMPORTANTE: Si el mensaje contiene variables entre llaves dobles como {{name}} o {{empresa}}, DEBES MANTENERLAS EXACTAMENTE IGUALES en tu respuesta, no las traduzcas ni las elimines. Respuesta: Solo el texto reescrito." 
                },
                { 
                    role: 'user', 
                    content: `Mensaje original: "${originalText}"` 
                }
            ],
        });
        return response.choices[0].message.content.trim();
    } catch (e) {
        console.error("❌ Error al parafrasear:", e.message);
        return originalText;
    }
}

async function transcribeAudio(media) {
    const rawExt = media.mimetype.split('/')[1];
    const extension = rawExt.split(';')[0].trim();
  
    const tmpDir = path.join(__dirname, '../tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    const filename = `${Date.now()}.${extension}`;
    const filepath = path.join(tmpDir, filename);
  
    const buffer = Buffer.from(media.data, 'base64');
    fs.writeFileSync(filepath, buffer);

    try{
        const transcription = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: fs.createReadStream(filepath)
        });
  
        return { text: transcription.text.trim(), filepath };

    } catch(error){
        console.error('Error transcribiendo audio:', error);
        throw error;
    } finally {
        await deleteFile(filepath)
  }
}

module.exports = { getChatGPTResponse, transcribeAudio, paraphraseMessage,};