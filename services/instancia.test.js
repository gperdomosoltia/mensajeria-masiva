const test = require('node:test');
const assert = require('node:assert');
const { botInstanceId, esReservas, filtroInstancia, aInternacional, formatoLocal, numeroReservas } = require('./instancia');

function conEnv(vars, fn) {
  const antes = {};
  for (const k of Object.keys(vars)) { antes[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(vars)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
  }
}

test('sin BOT_INSTANCE_ID es el número general, como antes de la separación', () => {
  conEnv({ BOT_INSTANCE_ID: undefined }, () => {
    assert.equal(botInstanceId(), 'nexus_general');
    assert.equal(esReservas(), false);
  });
  conEnv({ BOT_INSTANCE_ID: 'nexus_reservas' }, () => assert.equal(esReservas(), true));
});

test('la general también toma lo que no tiene instancia (historial anterior)', () => {
  assert.deepEqual(filtroInstancia('nexus_general'), { botInstanceId: { $in: ['nexus_general', null] } });
  assert.deepEqual(filtroInstancia('nexus_reservas'), { botInstanceId: 'nexus_reservas' });
});

test('los números se pasan a 58… y se dictan como 0424 274 5891', () => {
  assert.equal(aInternacional('0424-274-5891'), '584242745891');
  assert.equal(aInternacional('+58 424 2745891'), '584242745891');
  assert.equal(aInternacional('4242745891'), '584242745891');
  assert.equal(formatoLocal('584242745891'), '0424 274 5891');
  conEnv({ NUMERO_RESERVAS: undefined }, () => assert.equal(numeroReservas(), '584242745891'));
});
