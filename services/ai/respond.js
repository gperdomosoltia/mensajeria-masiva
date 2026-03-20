const { fetch } = require('undici');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- helpers ----------
function collectFunctionCalls(res) {
  const calls = [];
  for (const item of res.output ?? []) if (item?.type === 'function_call') calls.push(item);
  return calls;
}
function ensureWhatsAppJid(raw) {
  if (!raw) return raw;
  return raw.endsWith('@c.us') ? raw : `${raw}@c.us`;
}

// ---------- tools (schemas + ejecutores) ----------
function buildToolSchemas() {
  return [
    {
      type: 'function',
      name: 'notificar_humano',
      description: 'Notifica a un agente humano',
      parameters: {
        type: 'object',
        properties: {
          descripcion: { type: 'string' },
          tipo_notificacion: { type: 'string' },
          nombre_cliente: { type: 'string' },
          apellido_cliente: { type: 'string' },
          email_curso: { type: 'string' },
          source: { type: 'string' },
          telefono: { type: 'string' }
        },
        required: ['descripcion', 'tipo'],
        additionalProperties: true
      }
    }
  ];
}

async function exec_notificar_humano({ channel, rawUserId, argsJSON }) {
    const url = process.env.NOTIFICAR_HUMANO_URL;
    if (!url) return JSON.stringify({ status: 'error', mensaje: 'URL de notificar_humano no configurada' });

    let a = {};
    try { a = argsJSON ? JSON.parse(argsJSON) : {}; } catch { a = {}; }

    const payload = {
      descripcion: a.descripcion || a.detalle || 'Solicitud de contacto humano',
      tipo_notificacion: a.tipo_notificacion || 'INTERES EN CONTRATAR SERVICIO',
      nombre_cliente: a.nombre_cliente || a.nombre || '',
      apellido_cliente: a.apellido_cliente || a.apellido || '',
      email_curso: a.email_curso || a.email || '',
      source: channel || 'whatsapp',
      telefono: a.telefono || (channel === 'whatsapp' ? ensureWhatsAppJid(rawUserId) : undefined)
    };
  
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: Number(process.env.CALLBACK_TIMEOUT_MS || 8000)
    });
  
    const text = await resp.text();
    if (!resp.ok) return JSON.stringify({ status: 'error', http_status: resp.status, body: text });
    try { return JSON.stringify(JSON.parse(text)); } catch { return JSON.stringify({ status: 'success', data: text }); }
}

function normalizeImageSource(content, mimetype) {
  if (!content) return null;
  if (typeof content === 'string' && content.startsWith('data:')) return content;
  if (typeof content === 'string' && /^https?:\/\//i.test(content)) return content;
  if (typeof content === 'string' && mimetype) return `data:${mimetype};base64,${content}`;
  if (typeof content === 'object' && content.base64 && content.mimetype)
    return `data:${content.mimetype};base64,${content.base64}`;
  return null;
}

function mapBatchToTurn(queuedParts = []) {
  const blocks = [];
  for (const p of queuedParts) {
    if (!p) continue;
    if (p.type === 'text') {
      const txt = (p.content ?? '').toString().trim();
      if (txt) blocks.push({ type: 'input_text', text: txt });
    } else if (p.type === 'image') {
      if (p.caption) {
        const cap = p.caption.toString().trim();
        if (cap) blocks.push({ type: 'input_text', text: cap });
      }
      const src = normalizeImageSource(p.content, p.mimetype);
      if (src) blocks.push({ type: 'input_image', image_url: src });
    }
  }
  return blocks.length ? [{ role: 'user', content: blocks }] : [];
}

async function respondWithConversation({
  channel = 'whatsapp',
  user_id,
  rawUserId,
  conversation_id,
  messages,
  promptId = process.env.PROMPT_ID
}) {
  if (!conversation_id) throw new Error('conversation_id requerido');
  const tools = buildToolSchemas(); // Ahora solo contiene 'notificar_humano'

  const input = mapBatchToTurn(messages);
  if (!input.length) throw new Error('EMPTY_INPUT');

  let hops = 0;
  let inputList = input.slice();

  while (true) {
    const resp = await openai.responses.create({
      conversation: conversation_id,
      input: inputList,
      prompt: promptId ? { id: promptId } : undefined,
      tools,
      store: true,
      metadata: { source: channel, userId: user_id }
    });

    const calls = collectFunctionCalls(resp);
    if (!calls.length) {
      return {
        ok: true,
        text: resp.output_text ?? '',
        responseId: resp.id,
        conversationId: resp?.conversation?.id || conversation_id,
        usage: resp.usage ?? null
      };
    }

    const outputs = [];
    for (const call of calls) {
      const { name, call_id, arguments: argsJSON } = call;
      let out = '';
      try {
        // --- CORRECCIÓN 4: Se elimina la lógica para llamar a exec_get_tasa_bcv ---
        if (name === 'notificar_humano') out = await exec_notificar_humano({ channel, rawUserId, argsJSON });
        else out = JSON.stringify({ error: `Tool ${name} no implementada` });
      } catch (e) {
        out = JSON.stringify({ error: String(e?.message || e) });
      }
      outputs.push({ type: 'function_call_output', call_id, output: out });
    }

    inputList = outputs;
    hops++;
    const maxHops = Number(process.env.TOOL_HOPS_MAX || 5);
    if (hops >= maxHops) inputList.push({ role: 'user', content: 'Por favor entrega una respuesta final breve sin más herramientas.' });
    if (hops > maxHops + 1) return { ok: false, error: 'TOOL_LOOP_EXCEEDED', conversationId: conversation_id };
  }
}

module.exports = { respondWithConversation };