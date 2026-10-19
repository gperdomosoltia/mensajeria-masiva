const test = require('node:test');
const assert = require('node:assert');
const { esSinCreditos, fechaVenezuela, textoAviso, crearAlertaSinCreditos } = require('./alertaSinCreditos');

const sinCreditos = { status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota' };

// Mongo falsa compartida, como la real entre los dos bots: _id único.
function mongoFalsa() {
  const docs = new Map();
  return {
    docs,
    coleccion: () => ({
      async insertOne(doc) {
        if (docs.has(doc._id)) throw Object.assign(new Error('duplicate key'), { code: 11000 });
        docs.set(doc._id, doc);
      },
      async deleteOne({ _id }) { docs.delete(_id); },
    }),
  };
}

test('reconoce el 429 de saldo agotado y no el de demasiadas peticiones', () => {
  assert.equal(esSinCreditos(sinCreditos), true);
  assert.equal(esSinCreditos({ status: 429, code: 'insufficient_quota' }), true);
  assert.equal(esSinCreditos({ status: 429, code: 'rate_limit_exceeded', type: 'requests' }), false);
  assert.equal(esSinCreditos(new Error('otra cosa')), false);
  assert.equal(esSinCreditos(null), false);
});

test('el día se cuenta en hora de Venezuela', () => {
  assert.equal(fechaVenezuela(new Date('2026-10-20T03:30:00Z')), '2026-10-19');
  assert.equal(fechaVenezuela(new Date('2026-10-20T04:30:00Z')), '2026-10-20');
});

test('el texto dice qué bot lo detectó, la hora y dónde cargar saldo', () => {
  const texto = textoAviso('nexus_reservas', new Date('2026-10-19T12:40:00Z'));
  assert.match(texto, /^🔴 OpenAI se quedó sin créditos/);
  assert.match(texto, /reservas \(5891\)/);
  assert.match(texto, /8:40/);
  assert.match(texto, /platform\.openai\.com\/settings\/organization\/billing/);
});

test('avisa una sola vez por día entre los dos bots', async () => {
  const mongo = mongoFalsa();
  let ahora = new Date('2026-10-19T12:40:00Z');
  const enviados = [];
  const enviar = async (t) => { enviados.push(t); return true; };
  const general = crearAlertaSinCreditos({ coleccion: mongo.coleccion, enviar, ahora: () => ahora, instancia: () => 'nexus_general' });
  const reservas = crearAlertaSinCreditos({ coleccion: mongo.coleccion, enviar, ahora: () => ahora, instancia: () => 'nexus_reservas' });

  assert.equal(await reservas(sinCreditos), true);
  assert.equal(await reservas(sinCreditos), false);
  assert.equal(await general(sinCreditos), false);
  assert.equal(enviados.length, 1);

  ahora = new Date('2026-10-20T13:00:00Z');
  assert.equal(await general(sinCreditos), true);
  assert.equal(enviados.length, 2);
});

test('otros errores no avisan ni tocan Mongo', async () => {
  const mongo = mongoFalsa();
  const avisar = crearAlertaSinCreditos({ coleccion: mongo.coleccion, enviar: async () => assert.fail('no debía enviar') });
  assert.equal(await avisar(new Error('timeout')), false);
  assert.equal(mongo.docs.size, 0);
});

test('si Slack falla, el próximo error del día reintenta', async () => {
  const mongo = mongoFalsa();
  let respuesta = false;
  let intentos = 0;
  const avisar = crearAlertaSinCreditos({
    coleccion: mongo.coleccion,
    enviar: async () => { intentos++; return respuesta; },
    ahora: () => new Date('2026-10-19T12:40:00Z'),
  });
  assert.equal(await avisar(sinCreditos), false);
  assert.equal(mongo.docs.size, 0);
  respuesta = true;
  assert.equal(await avisar(sinCreditos), true);
  assert.equal(intentos, 2);
});

test('si Mongo falla, no avisa ni lanza', async () => {
  const avisar = crearAlertaSinCreditos({
    coleccion: () => ({ insertOne: async () => { throw new Error('sin conexión'); } }),
    enviar: async () => assert.fail('no debía enviar'),
  });
  assert.equal(await avisar(sinCreditos), false);
});
