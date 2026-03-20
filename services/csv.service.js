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
    }

    // 4. Validación final (Aceptamos 58 para Venezuela)
    if (!digits.startsWith('584') && !digits.startsWith('57')) return null; 

    return digits;
}

/**
 * Procesa el CSV con formato: Nombre, Empresa, Teléfono
 */
async function importContactsFromCSV(campaignId, csvContent) {
    const lines = csvContent.split(/\r?\n/);
    let count = 0;
    const phonesSeen = new Set(); 

    console.log(`📂 Importando CSV para campaña ${campaignId}...`);

    // Iteramos desde i=0 si no hay cabecera, o i=1 si la hay. 
    // Como tu data tiene cabecera "name,empresa...", empezamos en 1.
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = splitCSVLine(line);
        
        // MAPEO DE COLUMNAS NUEVO:
        // Col 0: Nombre
        // Col 1: Empresa
        // Col 2: Teléfono
        
        let persona = columns[0] ? columns[0].trim() : "";
        let empresa = columns[1] ? columns[1].trim() : "";
        const rawPhone = columns[2]; // El teléfono está en la 3ra columna (índice 2)

        // Limpieza de saltos de línea raros en nombres (ej: "Maria...\n")
        persona = persona.replace(/[\r\n]+/g, " ").trim();

        // Validar teléfono
        const cleanPhone = cleanPhoneNumber(rawPhone);

        if (cleanPhone && !phonesSeen.has(cleanPhone)) {
            phonesSeen.add(cleanPhone);

            await Personalizado.create({
                id: i, 
                name: persona, // Puede estar vacío
                empresa: empresa,
                phone: cleanPhone,
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