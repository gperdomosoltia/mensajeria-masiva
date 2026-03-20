const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Crea una conversación nueva y devuelve su id.
 */
async function createConversation({ channel = 'whatsapp', user_id, user_name }) {
  if (!user_id) throw new Error('user_id requerido');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const conv = await openai.conversations.create({
    metadata: { channel, user_id, user_name: user_name || undefined }
  });

  return conv.id;
}

/**
 * Agregra Un mensaje o imagen a la conversación existente 
*/
async function appendItem (conversation_id, role = "user", ObjMessage) {
  try {
    const {
      messageType,
      message,
      caption,
      mimetype,
    } = ObjMessage || {};

    if (!conversation_id) {
      return { ok: false, error: 'conversation_id requerido' };
    }

    // construir contenido del único item
    const normalizedRole = role === 'user' ? 'user' : 'assistant';
    const content = buildContentForItem(normalizedRole, messageType, message, mimetype, caption);
    if (content.length === 0) {
      return { ok: false, error: 'Contenido vacío (sin texto ni imagen válida)' };
    }

    // Crear Item
    const created = await openai.conversations.items.create(conversation_id, {
      items: [{
        type: 'message',
        role: normalizedRole,
        content
      }]
    });

    const first = Array.isArray(created?.data) ? created.data[0] : null;

    return {
      ok: true,
      conversation_id,
      item_id: first?.id || null,
      role: first?.role || normalizedRole
    };
  } catch (err) {
    console.error('appendItem error:', err?.response?.data || err?.message || err);
  }
};

function buildContentForItem( role, messageType, message, mimetype, caption) {
  const content = [];
  const safeText = (message ?? '').toString().trim();

  if (messageType == "text") {
    content.push({
      // user -> input_text | assistant -> output_text
      type: role === 'user' ? 'input_text' : 'output_text',
      text: safeText
    });
  }
  if (messageType == "image") {
    const src = normalizeImageSource(message, mimetype);
    content.push({ type: 'input_image', image_url: src });
    if(caption){
      content.push({ type: 'input_text', text: caption });
    }
  }
  return content;
}

module.exports = { 
  createConversation,
  appendItem
};