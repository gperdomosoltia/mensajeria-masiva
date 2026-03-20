const Personalizado = require('../models/personalizadoModel');

/**
 * Parsea una línea de CSV respetando comillas y saltos de línea dentro de ellas.
 */
function splitCSVLine(text) {
    const re_value = /(?!\s*$)\s*(?:'([^']*)'|"([^"]*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    const a = [];
    text.replace(re_value, function(m0, m1, m2, m3) {
        if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
        else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
        else if (m3 !== undefined) a.push(m3);
        return '';
    });
    if (/,\s*$/.test(text)) a.push('');
    return a;
}

/**
 * Limpia un número telefónico.
 */
function cleanPhoneNumber(rawPhone) {
    if (!rawPhone) return null;
    
    // 1. Dejar solo dígitos
    let digits = rawPhone.replace(/\D/g, '');

    // 2. Filtros básicos
    if (digits.length < 10) return null; 
    if (digits.startsWith('02')) return null; // Fijo local
    if (digits.startsWith('5802')) return null; // Fijo nacional

    // 3. Normalizar a 584...
    if (digits.startsWith('04')) {
        digits = '58' + digits.substring(1); 
    } else if (digits.startsWith('4') && digits.length === 10) {
        digits = '58' + digits; 
    } else if (digits.startsWith('57')) {
         // Dejar números de Colombia (ej: 573...) si deseas permitirlos
         return digits;
    } else if (digits.startsWith('1') && digits.length === 11) {
         // Números de USA/Canadá (ej: 17865370526)
         return digits;
    }

    // 4. Validación final (Aceptamos 58 para Venezuela, 57 para Colombia, 1 para USA)
    if (!digits.startsWith('584') && !digits.startsWith('57') && !digits.startsWith('1')) return null; 

    return digits;
}

/**
 * Procesa el CSV con formato: name, empresa, phone[, media_url]
 * La columna media_url es opcional.
 */
async function importContactsFromCSV(campaignId, csvContent) {
    const lines = csvContent.split(/\r?\n/);
    let count = 0;

    console.log(`📂 Importando CSV para campaña ${campaignId}...`);

    // Detectar si el CSV tiene columna media_url (4 columnas en el header)
    const header = lines[0].toLowerCase().trim();
    const hasMediaUrl = header.includes('media_url');
    if (hasMediaUrl) {
        console.log(`📎 Detectada columna media_url en el CSV.`);
    }

    // Iteramos desde i=1 (saltamos cabecera)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = splitCSVLine(line);
        
        // MAPEO DE COLUMNAS:
        // Col 0: Nombre
        // Col 1: Empresa
        // Col 2: Teléfono
        // Col 3: media_url (opcional)
        
        let persona = columns[0] ? columns[0].trim() : "";
        let empresa = columns[1] ? columns[1].trim() : "";
        const rawPhone = columns[2];
        const mediaUrl = columns[3] ? columns[3].trim() : "";

        // Limpieza de saltos de línea raros en nombres (ej: "Maria...\n")
        persona = persona.replace(/[\r\n]+/g, " ").trim();

        // Validar teléfono
        const cleanPhone = cleanPhoneNumber(rawPhone);

        if (cleanPhone) {
            await Personalizado.create({
                id: i, 
                name: persona,
                empresa: empresa,
                phone: cleanPhone,
                media_url: mediaUrl,
                process: false,
                id_campaign: campaignId
            });
            count++;
        }
    }
    console.log(`✅ Importación finalizada. ${count} contactos creados.`);
    return count;
}

module.exports = { importContactsFromCSV };
