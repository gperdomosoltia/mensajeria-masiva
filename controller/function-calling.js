const fs = require('fs');
const { OpenAI } = require('openai');
const mongoose = require('mongoose');
require('dotenv').config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function fechaActual(){
  const fecha = new Date();
  const dias =["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const diaSemana = dias[fecha.getDay()];
  //console.log("día de la semana: ", diaSemana);
  const fechaString = fecha.toLocaleDateString('en-GB');
  //console.log("fecha formato DD/MM/YYY: ", fechaString)
  const resp =  `${diaSemana} ${fechaString}`;
  console.log("fecha final: ", resp)
  return resp
}

async function analyzeImage(message, imagen_base64) {
    try{
        const response = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: message },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${imagen_base64}`,
                                detail: "low" //high: alta calidad, low: baja calidad
                            }
                        }
                    ]
                },
            ],
        });
        console.log("analisis de imagen: ", response.choices[0].message.content)
        return response.choices[0].message.content
    }catch(e){
        console.error("Error en analyzeImage: ", e)
    }
}

async function deleteFile(filePath) {
    try {
        await fs.promises.unlink(filePath);
        console.log(`🗑️ Archivo eliminado: ${filePath}`);
    } catch (e) {
        console.error(`❌ Error eliminando archivo ${filePath}:`, e);
    }
}

const BotClient = require('../models/botClientModel');
/**
 * Conecta a MongoDB si no está conectado y agrega un número a la blacklist.
 * @param {string} newEntry - Número a agregar a la blacklist.
 * @returns {Promise<object>} Documento actualizado.
 */
async function addToBlackList(newEntry) {
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
            console.log('✅ Conectado a MongoDB');
        }
        const updatedDocument = await BotClient.findOneAndUpdate(
            {},
            { $addToSet: { black_list: newEntry } }, // Usa $addToSet para evitar duplicados
            { new: true }
        );
        return updatedDocument;
    } catch (error) {
        console.error('Error actualizando black_list:', error);
        throw error;
    }
}

module.exports = {
    fechaActual,
    analyzeImage,
    addToBlackList,
    deleteFile,
};