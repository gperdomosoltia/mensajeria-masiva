require('dotenv').config();
const mongoose = require('mongoose');
const { importContactsFromCSV } = require('./services/csv.service');

// =====================================================
// CONFIGURACIÓN DE LA IMPORTACIÓN
// =====================================================
// ID de la campaña a la que pertenecerán estos contactos.
// (Asegúrate de que esta campaña ya exista en tu base de datos)
const CAMPAIGN_ID = 25; 

// =====================================================
// DATA CSV: Registros con imágenes personalizadas
// =====================================================
const miCSV = `name,empresa,phone,media_url
Tibisay Velasquez,,4143121366,https://mujeraiz.com/wp-content/uploads/2026/03/1-1.png
Alexandra Castillo,,4142224055,https://mujeraiz.com/wp-content/uploads/2026/03/2-1.png
Maye parra,,4122333682,https://mujeraiz.com/wp-content/uploads/2026/03/3-1.png
Ana marcela,,19543970737,https://mujeraiz.com/wp-content/uploads/2026/03/4-1.png
Oriana Ortiz,,4247218293,https://mujeraiz.com/wp-content/uploads/2026/03/5-1.png
Vanessa de Freites,,4123157838,https://mujeraiz.com/wp-content/uploads/2026/03/6-1.png
Evelyn ,,4248854426,https://mujeraiz.com/wp-content/uploads/2026/03/7-1.png
Efrain Polanco,,4142651555,https://mujeraiz.com/wp-content/uploads/2026/03/8-1.png
Jorge de Sousa,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/9-1.png
Elisa añez,Granos pantera,4242720071,https://mujeraiz.com/wp-content/uploads/2026/03/10-1.png
Valery Santeliz,Embajada USA,4141359113, https://mujeraiz.com/wp-content/uploads/2026/03/11-1.png
Marjorie Marin,Embajada USA,4143986074, https://mujeraiz.com/wp-content/uploads/2026/03/12-1.png
Martha Gonzalez ,Embajada USA,4241134686, https://mujeraiz.com/wp-content/uploads/2026/03/13-1.png
Daniela Castro,,4126843486,https://mujeraiz.com/wp-content/uploads/2026/03/14-1.png
Maria de los angeles ,,4241304548,https://mujeraiz.com/wp-content/uploads/2026/03/15-1.png
Amansahara Rivero,,4242071743,https://mujeraiz.com/wp-content/uploads/2026/03/16-1.png
Margarita Oropeza,Jefe de Prensa,4142770802, https://mujeraiz.com/wp-content/uploads/2026/03/17-1.png
Guido Vitale,,4242612877,https://mujeraiz.com/wp-content/uploads/2026/03/18-1.png
Alesia Rodiguez,,4144872126,https://mujeraiz.com/wp-content/uploads/2026/03/19-1.png`;

// =====================================================
// EJECUCIÓN
// =====================================================
(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { family: 4 });
        console.log("✅ Conectado a MongoDB.");

        console.log(`⏳ Importando contactos para la campaña ID: ${CAMPAIGN_ID}...`);
        
        // Importar contactos del CSV vinculados a esta campaña
        const totalImportados = await importContactsFromCSV(CAMPAIGN_ID, miCSV);
        
        console.log(`✅ ¡Éxito! ${totalImportados} contactos importados para la campaña ID: ${CAMPAIGN_ID}`);
        console.log("\n🎉 Listo. Los contactos están guardados y listos para que la campaña los procese.");
        
    } catch (error) {
        console.error("❌ Error al importar contactos:", error.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
})();