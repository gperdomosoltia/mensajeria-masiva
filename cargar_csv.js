require('dotenv').config();
const mongoose = require('mongoose');
const { importContactsFromCSV } = require('./services/csv.service');

// Tu data completa
const miCSV = `name,empresa,phone
Gabriel Soler, SoltiaLabs, 414-7398594
Mileydy Parra, Laberinto del sabor, 424-3522069`;

// const miCSV = `name,empresa,phone
// Maximiliano Vásquez,La Nación,414-7113676
// Diego Barragan ,Apple House,414-7529131
// Rafael Palma,Ingeniero,412-9680087
// Leopoldo Méndez,Súper Fresco,414-5681928
// Juan Guerrero,Fiesta Brava,4147376120
// Gustavo Anzola,Aguamiel,414-4179455
// Freddy Zambrano,Gimnasio 360,414-7353812
// Laura Ballen,Empresaria,414-0758485
// Carlos Romero,Inkanto Lingere,424-7436335
// José Ramón Vivas ,Vecino de la Cuadra,424-7139214
// Diego Rosales,Soguero Brasa,414-7109194
// Jackson Barragan ,Golos,414-3752141
// Johnny Salazar,FM Center,414-7365309
// Dr Leonardo Contreras,Urológico 2000,412-7901560
// Crisbell Varela ,Trapiche Cacao,414-7542669
// Grisalida Colmenares,Empresario,584247305447
// Chiquinquirá Garrido,Empresario,584120752453
// Jhoyfersson Torres ,Empresario,584120618405
// Daniel Vilchez,Empresario,584247057633
// Luis Boada,Empresario,584124277366
// Génesis Zambrano,Empresario,584245918225
// "Maria Isabel Zuanare
// ",Empresario,584247699989
// "Brandon Lobo
// ",Empresario,4247505981
// Luis Quintero,Empresario,584247699989
// "Wilhney Bautista
// ",Empresario,584247641623
// Carlos Leal,Empresario,4247834060
// Dayana García,Empresario,584247323406
// "Franyerlin Lara
// ",Empresario,584247699683
// William Pérez,Empresario,584126916438
// Elizabeth Ruales,Empresario,584120606570
// Valenttino Casanova,Empresario,584247549448
// Valentina Márquez,Empresario,584247549448
//  Grissel Virguez,Empresario,584247549448
// Heber Contreras,Empresario,584147400090
// "Viana Aparicio
// ",Empresario,584247271327
// Dennys Ruiz,Empresario,584247299321
// ,Nombre completo,Teléfono
// ,360 Glamping,+58 414-7459092
// Bermal Carrascal,360 Glamping,+58 414-7459092
// ,ADN Software,+58 414-7552662
// ,AS DE PIZZA,+58 424-7166839
// Adonay Alexander Bautista Chacon,,+58 416-6764397
// ,Akron Gomas Venezuela,+58 424-7162663
// Alberto Pestana,,+58 424-2868829
// Alejandra García,,+58 412-9003890
// Alejandro ,Helados mmm,+52 56 1123 2722
// ,Alkko-Tek,+58 424-7389547
// ,Andina de Valores,+58 424-7835907
// Arturo Burgos,,+58 412-4658188
// Jose Monasterio,Bancamiga,+58 424-2579258
// ,Banco Sofitasa,+58 424-1728438
// ,CCSC,+58 414-7091277
// ,Cable Norte,+58 424-7492498
// ,Cacaos Los Andes,+58 414-7203965
// ,Castillo la Fantasía,+58 424-7786612
// ,Centro Clínico San Cristóbal,+58 414-7091277
// ,Centro Comercial Multiplazas,+58 424-7525260
// ,Centro estético Laser,+58 424-4978026
// ,Chupifru,+58 414-9770215
// ,Club de Montaña Aguamiel,+58 424-5425444
// ,Colegio Arturo Uslar Pietri,+58 424-7738457
// ,Concafe,+58 414-6967095
// ,Concesionario Toro Sc,+58 416-6770226
// ,Corpus Christi,+58 414-7148385
// ,Cotatur,+58 424-7815431
// ,Diseinca,+58 412-1653893
// ,Distribuidora Hermanos Aldana,+58 412-7894620
// ,Doradito Kids,+58 424-7758537
// Dra Catherine Valverde,,+58 412-3779000
// Edglays Rojas,,+58 424-7662206
// ,Emvesa,+58 412-2170255
// ,Estancia la Bravera,+58 414-1402267
// ,Expresos Los LLanos CA,+58 414-7148385
// ,Farfalla,+58 424-7699683
// Daniel Sanchez,Firullino Panaderia,+58 426-5755490
// ,GWM Venezuela,+58 412-3252306
// Gabriela Parra,,+58 414-9788881
// ,Gerplap,+57 324 6823510
// ,Gin Resto Bar,+58 414-7075008
// Gloria Sandia,,+58 424-7308431
// ,Grupo Chargon,+58 424-7387743
// ,Grupo Empresarial Ontiveros,+58 414-1793063
// ,Grupo Principal,+58 414-7400090
// ,HMB Solar,+58 412-3039330
// Harold, Pepsico,+58 414-7373644
// ,Hoycobre.com,+58 412-3783847
// ,IEGV,+58 412-0600711
// ,"Ingeniería & Tecnología J.Ramirez, F.P,",+58 414-7267042
// ,Jac Concesionario Escalante,+58 414-7692797
// ,Jairo Remax Planet,+58 424-7599183
// ,Jardín Metropolitano el Mirador,+58 414-7047636
// Javier Sanchez,,+58 414-0828176
// ,Juventino Araque,+58 414-7436662
// ,Kiwa Kafe,+58 424-7525260
// ,Laboratorio Alfa,+58 414-7183660
// ,Laboratorios Roche C.A,+58 414-6289583
// ,Lacor,+58 414-7130343
// Laurent Navas,,+58 412-4585539
// ,Le Bran,+58 424-7235354
// Leandro Lievano,,+58 414-3763020
// ,Loteria del Táchira,+58 414-1415049
// Mafer Viera Key,,+58 414-4287423
// ,Mi doc en Casa,+58 424-7774767
// ,Moonplast,+57 310 5646354
// Nathali,Chargon,+58 424-7405703
// Nerio Pernia,,+58 424-7521530
// ,Nutricionista Nohelia Guerrero,+58 414-3769536
// ,Olga Rodriguez,+58 414-9768699
// ,Orange Market,+58 424-2561120
// ,Pintu Andes,+58 414-7219274
// ,Puro Queso,+58 424-7387743
// ,Refri Servicios Venezuela,+58 412-1703548
// ,Rincon Tachirense,+58 414-7116071
// ,Risca Tachira,+58 424-7702615
// ,SIRCA UNET,+58 414-7530060
// ,Servifarma,+58 414-9789344
// ,Sisevenca,+58 424-7655747
// ,Super Autos SC,+58 424-7795602
// ,Super Market Distribuciones,+58 412-2349747
// ,Supermercado La Popular,+58 424-7331460
// ,Súper Fresco,+58 424-8700694
// ,Tama eurobilding,
// ,ToriCorp,+58 424-7443734
// ,Toto y pepino,+58 414-3791185
// ,Trendy Clothes,+58 424-7040270
// ,UB Roi,+58 424-7089486
// ,UElectrónica,+58 424-7423700
// ,Uhmmm Heladería,+58 412-2878898
// ,Unet Formación Permanente,+58 414-7530060
// Valentina Giardinella,,+58 414-0517901
// Vanesa Arteaga,,+58 424-4135665
// ,Vida y energía,+58 424-7396123
// ,Visual Models,+58 424-7779676
// ,Wisp Táchira,+58 414-6218484
// Yofre Etnoel ,Toyo Navarro,+58 414-1656838
// ,ZZ Ingenieros,+58 414-7186416`;

(async () => {
    await mongoose.connect(process.env.MONGO_URI, { family: 4 });
    
    // Importar al ID de campaña 2 (o la que tú decidas)
    await importContactsFromCSV(2, miCSV); 
    
    console.log("Listo.");
    process.exit();
})();