// Normalizar el destinatario a formato JID de WhatsApp Web: 5842xxxxxxx@c.us
function normalizeWhatsAppJid(input) {
  if (input == null) throw new Error("Falta el número destino (to).");

  let s = String(input).trim();

  // 1) Si viene como wa.me/XXXXXXXXX, extraer números
  const waMeMatch = s.match(/wa\.me\/(\d+)/i);
  if (waMeMatch) s = waMeMatch[1];

  // 2) Si ya tiene sufijo @x.y (ej. @c.us o cualquier otro), lo normalizamos a @c.us
  if (/@[a-z.]+$/i.test(s)) {
    // Asegura que el sufijo sea exactamente @c.us
    s = s.replace(/@.+$/i, "@c.us");
    // validar que tenga números antes del @
    const prefix = s.split("@")[0];
    if (!/^\d+$/.test(prefix)) {
      throw new Error("El número antes de @c.us debe contener solo dígitos.");
    }
    return s;
  }

  // 3) Quitar todo lo que no sea dígito (espacios, guiones, paréntesis, +, etc.)
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) throw new Error("Número destino inválido.");

  return `${digits}@c.us`;
}

module.exports = normalizeWhatsAppJid;