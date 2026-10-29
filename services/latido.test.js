const test = require('node:test');
const assert = require('node:assert');
const { MARCA, INTERVALO_MS, textoLatido, instanciaDeLatido, diagnosticar, crearLatido } = require('./latido');

const MIN = 60_000;

// Mongo falsa compartida por los dos bots, como la real.
function mongoFalsa() {
  const docs = new Map();
  return {
    docs,
    coleccion: () => ({
      async findOne({ _id }) { return docs.has(_id) ? { ...docs.get(_id) } : null; },
      async updateOne({ _id }, { $set }) { docs.set(_id, { ...(docs.get(_id) || { _id }), ...$set }); },
    }),
  };
}

function armar({ mongo = mongoFalsa(), reloj, estado = async () => 'CONNECTED', enviar = async () => true } = {}) {
  const avisos = [];
  const enviados = [];
  const arranque = new Date(reloj.ahora);
  const comun = { coleccion: mongo.coleccion, ahora: () => new Date(reloj.ahora), avisar: async (t) => { avisos.push(t); return true; } };
  const general = crearLatido({
    ...comun, instancia: 'nexus_general', otraInstancia: 'nexus_reservas', numeroOtro: '584242745891',
    arranque, timeoutMs: 20, consultarEstado: estado, enviar: async (n, t) => { enviados.push([n, t]); return enviar(n, t); },
  });
  const reservas = crearLatido({
    ...comun, instancia: 'nexus_reservas', otraInstancia: 'nexus_general', numeroOtro: '584242745897',
    arranque, consultarEstado: async () => 'CONNECTED', enviar: async () => true,
  });
  return { mongo, general, reservas, avisos, enviados };
}

test('el texto del latido lleva la marca y quién lo manda', () => {
  const texto = textoLatido('nexus_reservas', new Date('2026-10-29T13:00:00Z'));
  assert.ok(texto.startsWith(`${MARCA} nexus_reservas `));
  assert.equal(instanciaDeLatido(texto), 'nexus_reservas');
  assert.equal(instanciaDeLatido('Hola, quiero info'), null);
  assert.equal(instanciaDeLatido(undefined), null);
});

test('diagnosticar: sordo cuando el otro sigue enviando y acá no llega nada en dos latidos', () => {
  const fecha = new Date('2026-10-29T13:00:00Z');
  const base = { fecha, estado: 'CONNECTED', fallosEstado: 0, fallosEnvio: 0, arranque: new Date(fecha - 5 * 60 * MIN) };
  const otroEnviado = new Date(fecha - 10 * MIN);
  assert.equal(diagnosticar({ ...base, recibido: new Date(fecha - 40 * MIN), otroEnviado }), null);
  assert.equal(diagnosticar({ ...base, recibido: new Date(fecha - 70 * MIN), otroEnviado }).tipo, 'no_recibe');
  // Si el otro tampoco está enviando, no se puede culpar a este.
  assert.equal(diagnosticar({ ...base, recibido: new Date(fecha - 70 * MIN), otroEnviado: new Date(fecha - 90 * MIN) }), null);
  // Recién arrancado no hay de qué sospechar todavía.
  assert.equal(diagnosticar({ ...base, arranque: new Date(fecha - 10 * MIN), recibido: null, otroEnviado }), null);
});

test('diagnosticar: hacen falta dos fallos seguidos de estado o de envío', () => {
  const base = { fecha: new Date(), estado: 'CONNECTED', fallosEstado: 0, fallosEnvio: 0, arranque: new Date(), recibido: null, otroEnviado: null };
  assert.equal(diagnosticar({ ...base, estado: 'TIMEOUT', fallosEstado: 1 }), null);
  assert.equal(diagnosticar({ ...base, estado: 'TIMEOUT', fallosEstado: 2 }).tipo, 'sin_conexion');
  assert.equal(diagnosticar({ ...base, fallosEnvio: 2 }).tipo, 'no_envia');
});

test('registrarRecibido solo toma latidos del otro bot', async () => {
  const reloj = { ahora: Date.parse('2026-10-29T13:00:00Z') };
  const { mongo, general } = armar({ reloj });
  assert.equal(await general.registrarRecibido('Hola'), false);
  assert.equal(await general.registrarRecibido(textoLatido('nexus_general', new Date())), true); // eco propio: se descarta sin anotar
  assert.equal(mongo.docs.get('nexus_general'), undefined);
  assert.equal(await general.registrarRecibido(textoLatido('nexus_reservas', new Date())), true);
  assert.equal(mongo.docs.get('nexus_general').recibido.toISOString(), '2026-10-29T13:00:00.000Z');
});

test('un bot sordo avisa una vez y avisa de nuevo cuando vuelve a recibir', async () => {
  const reloj = { ahora: Date.parse('2026-10-28T22:00:00Z') };
  const { general, reservas, avisos, enviados } = armar({ reloj });

  // El general sigue mandando sus latidos y a reservas le llegan todos.
  const rondaDeReservas = async () => {
    await reservas.ciclo();
    await reservas.registrarRecibido(textoLatido('nexus_general', new Date(reloj.ahora)));
  };

  // Funciona normal: cada latido de reservas llega al general.
  for (let i = 0; i < 3; i++) {
    await rondaDeReservas();
    await general.registrarRecibido(textoLatido('nexus_reservas', new Date(reloj.ahora)));
    await general.ciclo();
    reloj.ahora += INTERVALO_MS;
  }
  assert.equal(avisos.length, 0);
  assert.equal(enviados[0][0], '584242745891');

  // El general se queda sordo: reservas sigue enviando, pero nada llega.
  for (let i = 0; i < 4; i++) {
    await rondaDeReservas();
    await general.ciclo();
    reloj.ahora += INTERVALO_MS;
  }
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /información general \(5897\) no está recibiendo/);
  assert.match(avisos[0], /mensajeria-masiva/);

  // Se reinicia y vuelve a recibir: aviso de que se arregló, uno solo.
  await rondaDeReservas();
  await general.registrarRecibido(textoLatido('nexus_reservas', new Date(reloj.ahora)));
  await general.ciclo();
  await general.ciclo();
  assert.equal(avisos.length, 2);
  assert.match(avisos[1], /^🟢 .*información general \(5897\)/);
});

test('el aviso de arreglado de un bot sordo espera a que de verdad llegue un latido', async () => {
  const reloj = { ahora: Date.parse('2026-10-28T22:00:00Z') };
  const mongo = mongoFalsa();
  mongo.docs.set('nexus_general', { _id: 'nexus_general', problema: 'no_recibe', problemaDesde: new Date('2026-10-28T21:00:00Z'), recibido: new Date('2026-10-28T20:00:00Z') });
  // Proceso recién reiniciado: todavía no hay sospecha, pero tampoco prueba de que recibe.
  const { general, avisos } = armar({ mongo, reloj });
  await general.ciclo();
  assert.equal(avisos.length, 0);
  await general.registrarRecibido(textoLatido('nexus_reservas', new Date(reloj.ahora)));
  await general.ciclo();
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /^🟢/);
});

test('WhatsApp Web que no contesta avisa después de dos ciclos', async () => {
  const reloj = { ahora: Date.parse('2026-10-28T22:00:00Z') };
  const colgado = () => new Promise(() => {});
  const { general, avisos } = armar({ reloj, estado: async () => 'TIMEOUT', enviar: colgado });
  await general.ciclo();
  assert.equal(avisos.length, 0);
  await general.ciclo();
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /no responde/);
});

test('si Slack falla, el problema no queda anotado y se reintenta en el próximo ciclo', async () => {
  const reloj = { ahora: Date.parse('2026-10-28T22:00:00Z') };
  const mongo = mongoFalsa();
  let slackOk = false;
  const intentos = [];
  const general = crearLatido({
    instancia: 'nexus_general', otraInstancia: 'nexus_reservas', numeroOtro: '584242745891',
    coleccion: mongo.coleccion, ahora: () => new Date(reloj.ahora), arranque: new Date(reloj.ahora),
    consultarEstado: async () => 'TIMEOUT', enviar: async () => true,
    avisar: async (t) => { intentos.push(t); return slackOk; },
  });
  await general.ciclo();
  await general.ciclo();
  assert.equal(intentos.length, 1);
  assert.equal(mongo.docs.get('nexus_general').problema, undefined);
  slackOk = true;
  await general.ciclo();
  assert.equal(intentos.length, 2);
  assert.equal(mongo.docs.get('nexus_general').problema, 'sin_conexion');
});
