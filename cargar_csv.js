require('dotenv').config();
const mongoose = require('mongoose');
const Campaign = require('./models/campaignModel');
const { importContactsFromCSV } = require('./services/csv.service');

// =====================================================
// CONFIGURACIÓN DE LA CAMPAÑA MASIVA
// =====================================================
const CAMPAIGN_ID = 20; // ID único de la campaña masiva

const CAMPAIGN_CONFIG = {
    id: CAMPAIGN_ID,
    name: "Campaña Masiva Mujer Raiz",
    client_id: 1,
    message: `¡Hola {{name}}! 
Te escribe Uma, de Mujer Raíz y hoy queremos invitarte a un evento especial.

La Alcaldía de Baruta e Infinito Positivo presentan Mujer Raíz, un ecosistema para impulsar la formación, el desarrollo y la proyección empresarial de la mujer.  Será un encuentro para conocer la visión, el alcance y las oportunidades de articulación con aliados estratégicos, empresas e instituciones.

📍La presentación será el martes 24 de marzo en la Torre Gerais de Las Mercedes.

⏰ Para que puedas asistir diseñamos para tu comodidad dos horarios: 10:00 a.m. y 4:00 p.m. 

Solo debes elegir el que mejor te convenga y confirma tu asistencia.

Será un placer contar con tu asistencia`,
    media_url: "",
    personalizado: true,
    status: "pending",
    batch_ids: [],
   scheduled_at: new Date("2026-03-20T23:45:00.000Z"),
    messages_per_block: 20,
    min_delay_between_messages: 5,
    max_delay_between_messages: 15,
    min_delay_between_blocks: 60,
    max_delay_between_blocks: 120,
};

// =====================================================
// DATA CSV: 163 registros con imágenes personalizadas
// =====================================================
const miCSV = `name,empresa,phone,media_url
Milagros Zambrano,Jefe de Prensa,4143302312,https://mujeraiz.com/wp-content/uploads/2026/03/1.png
Raquel García,,4143206470,https://mujeraiz.com/wp-content/uploads/2026/03/2.png
Adriana Carrillo,,4242283549,https://mujeraiz.com/wp-content/uploads/2026/03/3.png
Ginette González,,4143153048,https://mujeraiz.com/wp-content/uploads/2026/03/4.png
Ana Virginia Escobar,Periodista,4242125656,https://mujeraiz.com/wp-content/uploads/2026/03/5.png
Gabriela Suniaga,,4244031462,https://mujeraiz.com/wp-content/uploads/2026/03/6.png
Lina Romero,,4242293904,https://mujeraiz.com/wp-content/uploads/2026/03/7.png
Blanca Vera,,4143381716,https://mujeraiz.com/wp-content/uploads/2026/03/8.png
Lohena Reverón,,4127138806,https://mujeraiz.com/wp-content/uploads/2026/03/9.png
Betania Pérez,,4129844204,https://mujeraiz.com/wp-content/uploads/2026/03/10.png
Yaya Andueza,,4142615387,https://mujeraiz.com/wp-content/uploads/2026/03/11.png
Ingrid Bravo Balabu,,4241913586,https://mujeraiz.com/wp-content/uploads/2026/03/12.png
Shirley Varnagy,Periodista,4143663515,https://mujeraiz.com/wp-content/uploads/2026/03/13.png
Alba Cecilia Mujica,,4142899148,https://mujeraiz.com/wp-content/uploads/2026/03/14.png
Eyla Adrián,,4143083710,https://mujeraiz.com/wp-content/uploads/2026/03/15.png
Maria Laura García,,4142387928,https://mujeraiz.com/wp-content/uploads/2026/03/16.png
Beatriz Rivero,Teresa Carreño,4122279709,https://mujeraiz.com/wp-content/uploads/2026/03/17.png
Yohana Paredes,,4143373620,https://mujeraiz.com/wp-content/uploads/2026/03/18.png
Vicenzo Cassella,,4143200442,https://mujeraiz.com/wp-content/uploads/2026/03/19.png
Endrina Yépez,Periodista,4142762845,https://mujeraiz.com/wp-content/uploads/2026/03/20.png
Gesaria Lapietra,Portadas,4143980238,https://mujeraiz.com/wp-content/uploads/2026/03/21.png
Nicoll Remesar,Periodista,4241720593,https://mujeraiz.com/wp-content/uploads/2026/03/22.png
Melisa Rauseo,Sábado en la Noche,4143665939,https://mujeraiz.com/wp-content/uploads/2026/03/23.png
Elisa Vega,Directora de Orquesta,4123914580,https://mujeraiz.com/wp-content/uploads/2026/03/24.png
Cristina Vollmer,,,https://mujeraiz.com/wp-content/uploads/2026/03/25.png
Jessica Uzcategui,Digitel,4128087010,https://mujeraiz.com/wp-content/uploads/2026/03/26.png
Magaly Vásquez,UCAB,4141518047,https://mujeraiz.com/wp-content/uploads/2026/03/27.png
Enmanuel Pineda,Embajador Francia,4143383395,https://mujeraiz.com/wp-content/uploads/2026/03/28.png
Susana Misticone,Dra,4166187586,https://mujeraiz.com/wp-content/uploads/2026/03/29.png
Maria Carolina Uzcategui,Consecomercio,4142295377,https://mujeraiz.com/wp-content/uploads/2026/03/30.png
Gipsy Pineda,Fedecamaras Táchira,4147007037,https://mujeraiz.com/wp-content/uploads/2026/03/31.png
Gianluca Rampolla,ONU,4123408646,https://mujeraiz.com/wp-content/uploads/2026/03/32.png
Fabiola Espinoza,Plumrose,4127234390,https://mujeraiz.com/wp-content/uploads/2026/03/33.png
Daniela Egui,Fundación Polar,4241760238,https://mujeraiz.com/wp-content/uploads/2026/03/34.png
Juan José Moreno,Pte. Salud Venmcham,4142472507,https://mujeraiz.com/wp-content/uploads/2026/03/35.png
Luisa Araujo,,4242064566,https://mujeraiz.com/wp-content/uploads/2026/03/36.png
Laumar González,Fondo Común,4142758975,https://mujeraiz.com/wp-content/uploads/2026/03/37.png
Felipe Capozzolo,Fedecamaras,4143342270,https://mujeraiz.com/wp-content/uploads/2026/03/38.png
Gabriela Velutinni,Fondo de Valores,4141719599,https://mujeraiz.com/wp-content/uploads/2026/03/39.png
Horacio Velutini,Fondo de Valores,17865370526,https://mujeraiz.com/wp-content/uploads/2026/03/40.png
Mayte Navarro,Periodista,4142332147,https://mujeraiz.com/wp-content/uploads/2026/03/41.png
Franzis Torrealba,Periodista,4145625240,https://mujeraiz.com/wp-content/uploads/2026/03/42.png
Ligia Velázquez,Ubi Pagos,4127250349,https://mujeraiz.com/wp-content/uploads/2026/03/43.png
Robert Veiga,Empresario,4142482453,https://mujeraiz.com/wp-content/uploads/2026/03/44.png
Ana Maria Ascanio,Toyota,4142220805,https://mujeraiz.com/wp-content/uploads/2026/03/45.png
Jorge Roig,Periodista,4122339000,https://mujeraiz.com/wp-content/uploads/2026/03/46.png
Maria Herrera,Banco Plaza,4146048298,https://mujeraiz.com/wp-content/uploads/2026/03/47.png
Angela Oraá,Periodista,4166307105,https://mujeraiz.com/wp-content/uploads/2026/03/48.png
Marianella Salazar,Periodista,4241249293,https://mujeraiz.com/wp-content/uploads/2026/03/49.png
Yuraima Mercado,Marketing,4142651995,https://mujeraiz.com/wp-content/uploads/2026/03/50.png
Tachy Molina,Hotel Eurobulding,4129090051,https://mujeraiz.com/wp-content/uploads/2026/03/51.png
Cielo Velandia,Asociación Venezolana de Mujeres,4140946717,https://mujeraiz.com/wp-content/uploads/2026/03/52.png
Eduardo Rodriguez,Periodista,4122063934,https://mujeraiz.com/wp-content/uploads/2026/03/53.png
Fabiana Rodriguez,Periodista,4142573217,https://mujeraiz.com/wp-content/uploads/2026/03/54.png
Argenis Carpio,Franquiciologos,4143226964,https://mujeraiz.com/wp-content/uploads/2026/03/55.png
Solmar Torres,keystone Revista,4143666966,https://mujeraiz.com/wp-content/uploads/2026/03/56.png
Tony Daza,Periodista,4141861321,https://mujeraiz.com/wp-content/uploads/2026/03/57.png
Maria Teresa Pérez,Revista Avior,4126086670,https://mujeraiz.com/wp-content/uploads/2026/03/58.png
Ricardo Gutiérrez,Ocean Drive,4143161216,https://mujeraiz.com/wp-content/uploads/2026/03/59.png
Vanessa Alves,Prensa,4142424244,https://mujeraiz.com/wp-content/uploads/2026/03/60.png
Shia Bertoni Periodista,Periodista,4123311314,https://mujeraiz.com/wp-content/uploads/2026/03/61.png
Leonardo Gómez,JW Marriott,4247898974,https://mujeraiz.com/wp-content/uploads/2026/03/62.png
Alexandra Braun,Periodista,4122171192,https://mujeraiz.com/wp-content/uploads/2026/03/63.png
Francisco Obando,Empresario,4123214722,https://mujeraiz.com/wp-content/uploads/2026/03/64.png
Juan Matos,Pomar,4123139276,https://mujeraiz.com/wp-content/uploads/2026/03/65.png
Adriana Cohen,Grupo Sambil,4143125890,https://mujeraiz.com/wp-content/uploads/2026/03/66.png
Adriana Sepulveda,Canguro,4126286456,https://mujeraiz.com/wp-content/uploads/2026/03/67.png
Adriana Goncalvez,Rendivalores,4242472183,https://mujeraiz.com/wp-content/uploads/2026/03/68.png
Aimara Lorenzo,Periodista,4149043666,https://mujeraiz.com/wp-content/uploads/2026/03/69.png
Aimara Morales,UCAB,4242702013,https://mujeraiz.com/wp-content/uploads/2026/03/70.png
Aixa Armas,Periodista,4143204878,https://mujeraiz.com/wp-content/uploads/2026/03/71.png
Andrea Alvarado,Alimentos la solidaridad,4122182367,https://mujeraiz.com/wp-content/uploads/2026/03/72.png
Andrea Martínez,Nozomic,4122852938,https://mujeraiz.com/wp-content/uploads/2026/03/73.png
Aslisbet Marcano,Pitazo,4141098311,https://mujeraiz.com/wp-content/uploads/2026/03/74.png
Atenas Bello,Trabajo y Persona,4241977312,https://mujeraiz.com/wp-content/uploads/2026/03/75.png
Aura Garcia,Vicepresidente RSE Bancamiga,4149828075,https://mujeraiz.com/wp-content/uploads/2026/03/76.png
Barbara Lugo,Pitazo,4129526397,https://mujeraiz.com/wp-content/uploads/2026/03/77.png
Carolina Fuenmayor,Periodista,4166202888,https://mujeraiz.com/wp-content/uploads/2026/03/78.png
Carolina Jaimes Branger,Periodista,4144589999,https://mujeraiz.com/wp-content/uploads/2026/03/79.png
Cielo Velandia,Fundes / AVM,4140946717,https://mujeraiz.com/wp-content/uploads/2026/03/80.png
Cipriana Ramos,Expresidenta Consecomercio,4143736421,https://mujeraiz.com/wp-content/uploads/2026/03/81.png
Sherezade Arias,Consejala Guatire,4242401508,https://mujeraiz.com/wp-content/uploads/2026/03/82.png
Dani Kammoin,Projet Glam,4242319908,https://mujeraiz.com/wp-content/uploads/2026/03/83.png
Daniela McCartney,TEDx Altamira,4143061765,https://mujeraiz.com/wp-content/uploads/2026/03/84.png
Douglimar Zambrano,Fandasitio,4242602970,https://mujeraiz.com/wp-content/uploads/2026/03/85.png
Dylan López,Pastas Capri,4242385368,https://mujeraiz.com/wp-content/uploads/2026/03/86.png
Eduardo Valero,Director Estudios Políticos UCV,4143709954,https://mujeraiz.com/wp-content/uploads/2026/03/87.png
Elena Lares,Directora RRHH Clinica Santiago Leon,4246591443,https://mujeraiz.com/wp-content/uploads/2026/03/88.png
Eleonor MacQuhae,TEDx Altamira,4242456018,https://mujeraiz.com/wp-content/uploads/2026/03/89.png
Herminia Fonseca,Embajada de EEUU,4123117535,https://mujeraiz.com/wp-content/uploads/2026/03/90.png
Jose Miguel Farias,Rendivalores,4249619630,https://mujeraiz.com/wp-content/uploads/2026/03/91.png
Maria Alejandra,Gte Sambil Chacao,4141314597,https://mujeraiz.com/wp-content/uploads/2026/03/92.png
Maria alejandra,Kingsley Gate,4242547173,https://mujeraiz.com/wp-content/uploads/2026/03/93.png
María Angelina Velazquez,Avencitel,4142313393,https://mujeraiz.com/wp-content/uploads/2026/03/94.png
Maria Consuelo,Senos Ayuda,4143095155,https://mujeraiz.com/wp-content/uploads/2026/03/95.png
Oldrich Henriquez,Director Lido,4242107412,https://mujeraiz.com/wp-content/uploads/2026/03/96.png
Sara Medina,Fundación KPMG,4169056944,https://mujeraiz.com/wp-content/uploads/2026/03/97.png
Tamara Laurens,Comunicaciones RSE Todo Tickets Banesco,4143241614,https://mujeraiz.com/wp-content/uploads/2026/03/98.png
Marta González,Embajada de EEUU,4241134686,https://mujeraiz.com/wp-content/uploads/2026/03/99.png
Nathalie Rojas,Directora CVA Las Mercecedes,4242293176,https://mujeraiz.com/wp-content/uploads/2026/03/100.png
Magdalena De Lucca,CEO Csybven,4241649386,https://mujeraiz.com/wp-content/uploads/2026/03/101.png
Victoria Nogeroles,BNC,423255290,https://mujeraiz.com/wp-content/uploads/2026/03/102.png
Carolina Roa,Revista P&M,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/103.png
Nayeli Villareal,,4149175572,https://mujeraiz.com/wp-content/uploads/2026/03/104.png
Carmela Longo,Periodista,4242294297,https://mujeraiz.com/wp-content/uploads/2026/03/105.png
Jennifer Cuns,Ruta de Lola,4142494389,https://mujeraiz.com/wp-content/uploads/2026/03/106.png
Geraldine Pérez,Unisantander,4120292497,https://mujeraiz.com/wp-content/uploads/2026/03/107.png
Patricia Blanco Gusti,ALIMEMNTOS MARY,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/108.png
Harold Francis,ALFONZO RIVAS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/109.png
Alexandra Salazar,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/110.png
Armando Loinaz,ARO PHARMA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/111.png
Isbeth Venegas,AVANTI,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/112.png
Daniel Godoy,BANESCO,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/113.png
Gabriel Madera,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/114.png
Juan Carlos Fonfrias,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/115.png
Leobaldo Guzman,BCO. DE VENEZUELA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/116.png
Edward Lucena,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/117.png
Belkis Urbina,BCO. PROVINCIAL,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/118.png
Kervin Rosales,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/119.png
Luisa Iribarren,BANCARIBE,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/120.png
Kayawarma Rodriguez,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/121.png
María Verónica Jaspe,BANPLUS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/122.png
Alberto Hernandez,COCA COLA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/123.png
María Alejandra Ortiz,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/124.png
Omaivic Miranda,COLGATE,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/125.png
Stephanie Kabbace,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/126.png
Rafael Sandia,DIABLITOS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/127.png
Rainell Grau,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/128.png
Valentina Castillo,DIADEO,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/129.png
Mariana Plaja,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/130.png
Grecia Acevedo,DIGITEL,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/131.png
Mario Pita,DIARTI PIEL,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/132.png
Ivan Latuph,DIARTI PIEL,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/133.png
William Paz-Castillo,FARMATODO,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/134.png
Verónica Gomez,FARMACIA SAAS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/135.png
Laura Decena,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/136.png
Ezequiel Alfaro,GRUPO MI MESA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/137.png
Henry Gomez,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/138.png
Ricardo Bentolila,ISOLA FOODS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/139.png
Angelo Cutolo,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/140.png
Ramón Esteves,LAB. LETI,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/141.png
Yarubay Anuel,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/142.png
Alva Melendez,MONDELEZ,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/143.png
Ailyn Valladares,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/144.png
Ysling Mendez,MONTSERRATINA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/145.png
Veronica Maduro,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/146.png
Grecia Toukoumidis,MOVISTAR,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/147.png
María Elisa Gonzalez,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/148.png
Gerardina Russo,MUNDO TOTAL,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/149.png
Fernando León,NESTLÉ,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/150.png
Ana Vilar,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/151.png
Raquel Terraboa,SEGUROS VENEZUELA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/152.png
Carolina Bermúdez,SIMPLE PLUS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/153.png
Carolina Perera,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/154.png
Maigualida Díaz,V-NET,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/155.png
Raul Sanz,REAL SEGUROS,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/156.png
Henry Morrison,RON CARUPANO,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/157.png
Cesar Atencio,ZOOM,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/158.png
Nieves Lorenzo,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/159.png
Eugenia Santander,RIDERY,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/160.png
Julio Lapreda,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/161.png
Juan Carlos Tovar,ZULIA,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/162.png
Antero Perez,,4222744760,https://mujeraiz.com/wp-content/uploads/2026/03/163.png`;

// =====================================================
// EJECUCIÓN
// =====================================================
(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { family: 4 });
        console.log("✅ Conectado a MongoDB.");

        // 1. Verificar si ya existe una campaña con ese ID
        const existente = await Campaign.findOne({ id: CAMPAIGN_CONFIG.id });

        if (existente) {
            console.log(`⚠️  Ya existe una campaña con id: ${CAMPAIGN_CONFIG.id} ("${existente.name}").`);
            console.log(`   Si deseas recrearla, elimínala primero o cambia el ID.`);
        } else {
            // 2. Crear el documento de campaña con el modelo real
            const nuevaCampana = await Campaign.create(CAMPAIGN_CONFIG);
            console.log(`✅ Campaña creada: "${nuevaCampana.name}" (id: ${nuevaCampana.id})`);
        }

        // 3. Importar contactos del CSV vinculados a esta campaña
        const totalImportados = await importContactsFromCSV(CAMPAIGN_CONFIG.id, miCSV);
        console.log(`✅ ${totalImportados} contactos importados para campaña id: ${CAMPAIGN_CONFIG.id}`);

        console.log("\n🎉 Listo. La campaña será detectada automáticamente por el sistema.");
    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
})();
