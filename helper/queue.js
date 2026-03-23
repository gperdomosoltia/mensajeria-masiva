// helper/queue.js
const mongoController = require('../controller/mongo.controller.js');
// --- ¡CAMBIO CLAVE! ---
// Importamos directamente los servicios de IA que antes estaban en el microservicio.
const { createConversation } = require('../services/ai/conversations');
const { respondWithConversation } = require('../services/ai/respond');

const userMessageQueues = new Map();
const QUEUE_TIMEOUT_MS = 5000; // 5 segundos

function getTextualRepresentationForHistory(queuedParts) {
    if (!queuedParts || queuedParts.length === 0) return "[COLA VACÍA]";
    return queuedParts.map(part => {
        if (part.type === 'text') return part.content;
        if (part.type === 'image') {
            const captionText = part.caption ? `\nCaption: "${part.caption}"` : '';
            return `[IMAGEN EN: ${part.content}]${captionText}`;
        }
        if (part.type === 'location') {
            const { latitude, longitude } = part.content || {};
            return `[UBICACIÓN] Lat: ${latitude}, Lng: ${longitude}`;
        }
        return "[MENSAJE NO SOPORTADO]";
    }).join('\n').trim();
}

async function processUserQueueInternal(userId, userName, onQueueProcessedCallback) {
    if (!userMessageQueues.has(userId)) return;

    const userData = userMessageQueues.get(userId);
    const { chat, rawUserId, historyEntryId, queuedParts } = userData;
    userMessageQueues.delete(userId);

    await mongoController.updateHistoryEntry(historyEntryId, { status: 'processing_with_response_api' });

    try {
        if (chat && typeof chat.sendStateTyping === 'function') {
            await chat.sendStateTyping();
        }

        // 1) Buscar suscripción y conversationId
        let subscription = await mongoController.findSubscription(rawUserId);
        let conversationId = subscription?.conversationId ?? null;

        // 2) Si NO hay conversationId, crearla directamente
        if (!conversationId) {
          console.log(`🔄 No se encontró conversationId para ${rawUserId}. Creando una nueva...`);
          conversationId = await createConversation({ channel: 'whatsapp', user_id: rawUserId, user_name: userName });
          
          if (subscription) {
            await mongoController.updateSubscription(rawUserId, { conversationId });
          } else {
            await mongoController.createSubscription(rawUserId, userName, conversationId);
          }
        }

        // 3) Obtener la respuesta de la IA llamando a la función directamente
        const result = await respondWithConversation({
            channel: 'whatsapp',
            user_id: rawUserId,
            rawUserId: rawUserId,
            user_name: userName,
            conversation_id: conversationId,
            messages: queuedParts
        });

        console.log(`✅ Respuesta obtenida para ${userId}:`, {
            ok: result?.ok, response_id: result?.responseId, conversation_id: result?.conversationId
        });

        const replyText = (result?.ok && result?.text) ? result.text.trim() : "Lo siento, no pude procesar tu solicitud en este momento.";

        if (onQueueProcessedCallback) {
            await onQueueProcessedCallback(rawUserId, replyText, historyEntryId, result);
        }
        
    } catch (error) {
        console.error(`❌ Error procesando la cola para ${userId}:`, error);
        await mongoController.updateHistoryEntry(historyEntryId, { status: 'webhook_failed' });
        if (onQueueProcessedCallback) {
            await onQueueProcessedCallback(rawUserId, null, historyEntryId, error);
        }
    }
}

async function addMessageToQueue(chat, userId, userName, rawUserId, messagePartData, onQueueProcessedCallback) {
    // ... (Esta función no necesita cambios en su lógica interna)
    if (!messagePartData ||
        (messagePartData.type === 'text' && (!messagePartData.content || messagePartData.content.trim() === "")) ||
        (messagePartData.type === 'image' && !messagePartData.content)
    ) return;

    if (!rawUserId) return;

    let userData;

    if (!userMessageQueues.has(userId)) {
        const now = new Date();
        const initialLogData = {
            user: userId,
            message: messagePartData.content,
            gcs_objectKey: messagePartData?.gcs_objectKey,
            type: messagePartData.originalMessageType,
            caption: messagePartData.caption,
            status: 'queued_initial',
            date: now,
            dateFormat: now.toLocaleDateString('es-VE')
        };

        const newHistoryEntry = await mongoController.logHistory(initialLogData);
        if (!newHistoryEntry) {
            console.error("Error: No se pudo crear la entrada en el historial.");
            return;
        }
        
        userData = {
            chat,
            rawUserId,
            historyEntryId: newHistoryEntry._id,
            timerId: null,
            queuedParts: [messagePartData]
        };
        userMessageQueues.set(userId, userData);
    } else {
        userData = userMessageQueues.get(userId);
        userData.queuedParts.push(messagePartData);
        if (userData.timerId) clearTimeout(userData.timerId);
    }

    userData.timerId = setTimeout(() => {
        processUserQueueInternal(userId, userName, onQueueProcessedCallback);
    }, QUEUE_TIMEOUT_MS);
}

module.exports = { addMessageToQueue };