const test = require('node:test');
const assert = require('node:assert');
const { normalizarCedula, crearRegistroDeCedula } = require('./identity');

// ── Normalización ─────────────────────────────────────────────────────────────

test('acepta la cédula con su letra, en cualquier forma de escribirla', () => {
  for (const entrada of ['V-12345678', 'v12345678', 'V 12.345.678', ' v-12.345.678 ']) {
    const r = normalizarCedula(entrada);
    assert.equal(r.ok, true, `debería aceptar ${entrada}`);
    assert.equal(r.valor, 'V-12345678');
    assert.equal(r.tipo, 'cedula');
  }
});

test('acepta cédulas de extranjero y de 6 o 7 dígitos', () => {
  assert.equal(normalizarCedula('E-81234567').valor, 'E-81234567');
  assert.equal(normalizarCedula('V-123456').valor, 'V-123456');
  assert.equal(normalizarCedula('V-1234567').valor, 'V-1234567');
});

test('un RIF de nueve dígitos se separa con su dígito verificador', () => {
  const r = normalizarCedula('J-12345678-9');
  assert.equal(r.ok, true);
  assert.equal(r.valor, 'J-12345678-9');
  assert.equal(r.tipo, 'rif');
  assert.equal(normalizarCedula('G200012345').valor, 'G-20001234-5');
});

test('solo dígitos NO se asume V: hay que preguntar el tipo', () => {
  // Un extranjero con cédula E quedaría mal guardado si adivinamos, y este valor va a
  // ser la llave del cobro automatizado.
  const r = normalizarCedula('12345678');
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'falta_tipo');
});

test('rechaza lo que no tiene forma de documento', () => {
  assert.deepEqual(normalizarCedula(''), { ok: false, motivo: 'vacio' });
  assert.deepEqual(normalizarCedula(null), { ok: false, motivo: 'vacio' });
  assert.equal(normalizarCedula('V-123').motivo, 'formato');
  assert.equal(normalizarCedula('X-12345678').motivo, 'formato');
  assert.equal(normalizarCedula('1234567890').motivo, 'formato');
  assert.equal(normalizarCedula('mi cédula').motivo, 'formato');
});

// ── Guardado ──────────────────────────────────────────────────────────────────

function fakeSubscription() {
  const estado = { escrituras: [] };
  return {
    estado,
    async findOneAndUpdate(filtro, update, opciones) {
      estado.escrituras.push({ filtro, update, opciones });
      return { user: filtro.user, ...update.$set };
    }
  };
}

test('guarda la cédula normalizada con su origen y quién la puso', async () => {
  const Subscription = fakeSubscription();
  const { guardarCedula } = crearRegistroDeCedula({ Subscription });

  const r = await guardarCedula({ user: '584121112233', cedula: 'v 12.345.678', origen: 'asesor', por: 'Daniela' });

  assert.equal(r.ok, true);
  assert.equal(r.valor, 'V-12345678');
  const [escritura] = Subscription.estado.escrituras;
  assert.equal(escritura.filtro.user, '584121112233@c.us', 'la suscripción se guarda por JID');
  assert.equal(escritura.update.$set.cedula, 'V-12345678');
  assert.equal(escritura.update.$set.cedulaOrigen, 'asesor');
  assert.equal(escritura.update.$set.cedulaPor, 'Daniela');
  assert.ok(escritura.update.$set.cedulaEn instanceof Date);
  assert.equal(escritura.opciones.upsert, true);
});

test('no escribe nada si el valor no sirve', async () => {
  const Subscription = fakeSubscription();
  const { guardarCedula } = crearRegistroDeCedula({ Subscription });

  const r = await guardarCedula({ user: '584121112233', cedula: '12345678', origen: 'cliente' });

  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'falta_tipo');
  assert.equal(Subscription.estado.escrituras.length, 0);
});

test('una cédula que viene del cliente no registra asesor', async () => {
  const Subscription = fakeSubscription();
  const { guardarCedula } = crearRegistroDeCedula({ Subscription });

  await guardarCedula({ user: '584121112233@c.us', cedula: 'V-12345678', origen: 'cliente' });

  assert.equal(Subscription.estado.escrituras[0].update.$set.cedulaPor, null);
});
