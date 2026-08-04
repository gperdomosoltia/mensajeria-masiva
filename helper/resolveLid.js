// WhatsApp migró los identificadores de usuario de `<telefono>@c.us` a `@lid`.
// Los `@lid` rompen `msg.getChat()` y, sobre todo, no sirven como clave en Mongo:
// las suscripciones e historial están guardados por `@c.us`, así que un `@lid`
// sin traducir arranca una conversación nueva y pierde el historial del cliente.
//
// Devuelve siempre un ID usable: el `@c.us` si se pudo traducir, o el original
// si no. Nunca lanza; el handler de mensajes no debe morir por esto.
async function resolveLidToPhone(client, rawUserId) {
    if (!rawUserId || !rawUserId.endsWith('@lid')) return rawUserId;

    if (typeof client?.getContactLidAndPhone !== 'function') {
        console.warn(`⚠️  getContactLidAndPhone no disponible; se usa el @lid tal cual: ${rawUserId}`);
        return rawUserId;
    }

    try {
        const [mapping] = await client.getContactLidAndPhone([rawUserId]);
        if (mapping?.pn) return mapping.pn;
        console.warn(`⚠️  WhatsApp no devolvió teléfono para ${rawUserId}; se usa el @lid tal cual.`);
    } catch (err) {
        console.error(`❌ Error traduciendo ${rawUserId} a teléfono:`, err);
    }

    return rawUserId;
}

module.exports = resolveLidToPhone;
