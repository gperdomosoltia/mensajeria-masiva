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
    media_url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663324533207/OWWzfGziwqNUEUFq.png",
    personalizado: true,
    status: "pending",
    batch_ids: [],
    scheduled_at: new Date("2026-03-20T18:00:00.000Z"), // AJUSTAR: hora de envío (UTC). 18:00 UTC = 2:00pm Venezuela
    messages_per_block: 20,
    min_delay_between_messages: 5,
    max_delay_between_messages: 15,
    min_delay_between_blocks: 60,
    max_delay_between_blocks: 120,
};

// =====================================================
// DATA CSV: 163 registros del Excel
// =====================================================
const miCSV = `name,empresa,phone
Margarita Oropeza,Jefe de Prensa,4142770802
Milagros Zambrano,Jefe de Prensa,4143302312
Raquel García,,4143206470
Adriana Carrillo,,4242283549
Ginette González,,4143153048
Ana Virginia Escobar,Periodista,4242125656
Gabriela Suniaga,,4244031462
Lina Romero,,4242293904
Blanca Vera,,4143381716
Lohena Reverón,,4127138806
Betania Pérez,,4129844204
Yaya Andueza,,4142615387
Ingrid Bravo Balabu,,4241913586
Shirley Varnagy,Periodista,4143663515
Alba Cecilia Mujica,,4142899148
Eyla Adrián,,4143083710
Maria Laura García,,4142387928
Beatriz Rivero,Teresa Carreño,4122279709
Yohana Paredes,,4143373620
Vicenzo Cassella,,4143200442
Endrina Yépez,Periodista,4142762845
Gesaria Lapietra,Portadas,4143980238
Nicoll Remesar,Periodista,4241720593
Melisa Rauseo,Sábado en la Noche,4143665939
Elisa Vega,Directora de Orquesta,4123914580
Jessica Uzcategui,Digitel,4128087010
Magaly Vásquez,UCAB,4141518047
Enmanuel Pineda,Embajador Francia,4143383395
Susana Misticone,Dra,4166187586
Maria Carolina Uzcategui,Consecomercio,4142295377
Gipsy Pineda,Fedecamaras Táchira,4147007037
Gianluca Rampolla,ONU,4123408646
Fabiola Espinoza,Plumrose,4127234390
Daniela Egui,Fundación Polar,4241760238
Juan José Moreno,Pte. Salud Venmcham,4142472507
Luisa Araujo,,4242064566
Laumar González,Fondo Común,4142758975
Felipe Capozzolo,Fedecamaras,4143342270
Gabriela Velutinni,Fondo de Valores,4141719599
Horacio Velutini,Fondo de Valores,17865370526
Mayte Navarro,Periodista,4142332147
Franzis Torrealba,Periodista,4145625240
Ligia Velázquez,Ubi Pagos,4127250349
Robert Veiga,Empresario,4142482453
Ana Maria Ascanio,Toyota,4142220805
Jorge Roig,Periodista,4122339000
Maria Herrera,Banco Plaza,4146048298
Angela Oraá,Periodista,4166307105
Marianella Salazar,Periodista,4241249293
Yuraima Mercado,Marketing,4142651995
Tachy Molina,Hotel Eurobulding,4129090051
Cielo Velandia,Asociación Venezolana de Mujeres,4140946717
Eduardo Rodriguez,Periodista,4122063934
Fabiana Rodriguez,Periodista,4142573217
Argenis Carpio,Franquiciologos,4143226964
Solmar Torres,keystone Revista,4143666966
Tony Daza,Periodista,4141861321
Maria Teresa Pérez,Revista Avior,4126086670
Ricardo Gutiérrez,Ocean Drive,4143161216
Vanessa Alves,Prensa,4142424244
Shia Bertoni Periodista,Periodista,4123311314
Leonardo Gómez,JW Marriott,4247898974
Alexandra Braun,Periodista,4122171192
Francisco Obando,Empresario,4123214722
Juan Matos,Pomar,4123139276
Adriana Cohen,Grupo Sambil,4143125890
Adriana Sepulveda,Canguro,4126286456
Adriana Goncalvez,Rendivalores,4242472183
Aimara Lorenzo,Periodista,4149043666
Aimara Morales,UCAB,4242702013
Aixa Armas,Periodista,4143204878
Andrea Alvarado,Alimentos la solidaridad,4122182367
Andrea Martínez,Nozomic,4122852938
Aslisbet Marcano,Pitazo,4141098311
Atenas Bello,Trabajo y Persona,4241977312
Aura Garcia,Vicepresidente RSE Bancamiga,4149828075
Barbara Lugo,Pitazo,4129526397
Carolina Fuenmayor,Periodista,4166202888
Carolina Jaimes Branger,Periodista,4144589999
Cielo Velandia,Fundes / AVM,4140946717
Cipriana Ramos,Expresidenta Consecomercio,4143736421
Sherezade Arias,Consejala Guatire,4242401508
Dani Kammoin,Projet Glam,4242319908
Daniela McCartney,TEDx Altamira,4143061765
Douglimar Zambrano,Fandasitio,4242602970
Dylan López,Pastas Capri,4242385368
Eduardo Valero,Director Estudios Políticos UCV,4143709954
Elena Lares,Directora RRHH Clinica Santiago Leon,4246591443
Eleonor MacQuhae,TEDx Altamira,4242456018
Herminia Fonseca,Embajada de EEUU,4123117535
Jose Miguel Farias,Rendivalores,4249619630
Maria Alejandra,Gte Sambil Chacao,4141314597
Maria alejandra,Kingsley Gate,4242547173
María Angelina Velazquez,Avencitel,4142313393
Maria Consuelo,Senos Ayuda,4143095155
Oldrich Henriquez,Director Lido,4242107412
Sara Medina,Fundación KPMG,4169056944
Tamara Laurens,Comunicaciones RSE Todo Tickets Banesco,4143241614
Marta González,Embajada de EEUU,4241134686
Nathalie Rojas,Directora CVA Las Mercecedes,4242293176
Magdalena De Lucca,CEO Csybven,4241649386
Victoria Nogeroles,BNC,423255290
Carolina Roa,Revista P&M,4222744760
Nayeli Villareal,,4149175572
Carmela Longo,Periodista,4242294297
Jennifer Cuns,Ruta de Lola,4142494389
Geraldine Pérez,Unisantander,4120292497
Patricia Blanco Gusti,ALIMEMNTOS MARY,4222744760
Harold Francis,ALFONZO RIVAS,4222744760
Alexandra Salazar,,4222744760
Armando Loinaz,ARO PHARMA,4222744760
Isbeth Venegas,AVANTI,4222744760
Daniel Godoy,BANESCO,4222744760
Gabriel Madera,,4222744760
Juan Carlos Fonfrias,,4222744760
Leobaldo Guzman,BCO. DE VENEZUELA,4222744760
Edward Lucena,,4222744760
Belkis Urbina,BCO. PROVINCIAL,4222744760
Kervin Rosales,,4222744760
Luisa Iribarren,BANCARIBE,4222744760
Kayawarma Rodriguez,,4222744760
María Verónica Jaspe,BANPLUS,4222744760
Alberto Hernandez,COCA COLA,4222744760
María Alejandra Ortiz,,4222744760
Omaivic Miranda,COLGATE,4222744760
Stephanie Kabbace,,4222744760
Rafael Sandia,DIABLITOS,4222744760
Rainell Grau,,4222744760
Valentina Castillo,DIADEO,4222744760
Mariana Plaja,,4222744760
Grecia Acevedo,DIGITEL,4222744760
Mario Pita,DIARTI PIEL,4222744760
Ivan Latuph,DIARTI PIEL,4222744760
William Paz-Castillo,FARMATODO,4222744760
Verónica Gomez,FARMACIA SAAS,4222744760
Laura Decena,,4222744760
Ezequiel Alfaro,GRUPO MI MESA,4222744760
Henry Gomez,,4222744760
Ricardo Bentolila,ISOLA FOODS,4222744760
Angelo Cutolo,,4222744760
Ramón Esteves,LAB. LETI,4222744760
Yarubay Anuel,,4222744760
Alva Melendez,MONDELEZ,4222744760
Ailyn Valladares,,4222744760
Ysling Mendez,MONTSERRATINA,4222744760
Veronica Maduro,,4222744760
Grecia Toukoumidis,MOVISTAR,4222744760
María Elisa Gonzalez,,4222744760
Gerardina Russo,MUNDO TOTAL,4222744760
Fernando León,NESTLÉ,4222744760
Ana Vilar,,4222744760
Raquel Terraboa,SEGUROS VENEZUELA,4222744760
Carolina Bermúdez,SIMPLE PLUS,4222744760
Carolina Perera,,4222744760
Maigualida Díaz,V-NET,4222744760
Raul Sanz,REAL SEGUROS,4222744760
Henry Morrison,RON CARUPANO,4222744760
Cesar Atencio,ZOOM,4222744760
Nieves Lorenzo,,4222744760
Eugenia Santander,RIDERY,4222744760
Julio Lapreda,,4222744760
Juan Carlos Tovar,ZULIA,4222744760
Antero Perez,,4222744760`;

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
