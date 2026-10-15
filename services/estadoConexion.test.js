const test = require('node:test');
const assert = require('node:assert');
const { crearEstadoConexion, enlaceVinculacion } = require('./estadoConexion');

test('arranca en "iniciando" y anota desde cuándo', () => {
  const estado = crearEstadoConexion(() => new Date('2026-10-15T10:00:00Z'));
  assert.deepEqual(estado.leer(), { estado: 'iniciando', desde: '2026-10-15T10:00:00.000Z' });
});

test('un QR que se renueva no reinicia la cuenta; conectarse sí', () => {
  let ahora = new Date('2026-10-15T10:00:00Z');
  const estado = crearEstadoConexion(() => ahora);
  estado.marcar('esperando_qr');
  ahora = new Date('2026-10-15T10:05:00Z');
  estado.marcar('esperando_qr');
  assert.equal(estado.leer().desde, '2026-10-15T10:00:00.000Z');
  estado.marcar('conectado');
  assert.deepEqual(estado.leer(), { estado: 'conectado', desde: '2026-10-15T10:05:00.000Z' });
});

test('rechaza estados que el dashboard no conoce', () => {
  assert.throws(() => crearEstadoConexion().marcar('desvinculado'));
});

test('el enlace sale del dominio público de Railway', () => {
  assert.equal(enlaceVinculacion('bot-reservas-production.up.railway.app'), 'https://bot-reservas-production.up.railway.app/');
  assert.equal(enlaceVinculacion('https://x.up.railway.app/'), 'https://x.up.railway.app/');
  assert.equal(enlaceVinculacion(''), null);
  assert.equal(enlaceVinculacion(undefined), null);
});
