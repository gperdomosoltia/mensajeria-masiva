const test = require('node:test');
const assert = require('node:assert');
const { crearRegistroDeEnviosPropios, crearCapturaDeAsesor } = require('./agentCapture');

function mensaje(overrides = {}) {
  return {
    fromMe: true,
    id: { _serialized: 'true_584121112233@c.us_ABC' },
    to: '584121112233@c.us',
    body: 'Le paso los datos de la transferencia.',
    type: 'chat',
    ...overrides
  };
}

function capturaCon(overrides = {}) {
  const guardados = [];
  const registro = overrides.registro ?? crearRegistroDeEnviosPropios();
  const capturar = crearCapturaDeAsesor({
    registro,
    destinatariosVentas: overrides.destinatariosVentas ?? (() => ['584242745891@c.us']),
    guardarMensajeAsesor: async (datos) => { guardados.push(datos); return 'id-1'; }
  });
  return { capturar, guardados, registro };
}

// ── Registro de envíos propios ────────────────────────────────────────────────

test('un id anotado se reconoce como envío propio', () => {
  const r = crearRegistroDeEnviosPropios();
  r.anotarId('true_584121112233@c.us_ABC');
  assert.equal(r.esPropio('true_584121112233@c.us_ABC', '584121112233@c.us', 'hola'), true);
  assert.equal(r.esPropio('otro_id', '584121112233@c.us', 'hola'), false);
});

test('el texto anotado antes de enviar cubre la carrera con el id', () => {
  // WhatsApp emite message_create a veces ANTES de que sendMessage resuelva, así que el
  // id todavía no está anotado. El texto se anota antes de enviar, así que siempre está.
  const r = crearRegistroDeEnviosPropios();
  r.anotarTexto('584121112233@c.us', 'Hola, con gusto.');
  assert.equal(r.esPropio('id-que-no-se-anotó', '584121112233@c.us', 'Hola, con gusto.'), true);
});

test('el texto anotado se consume: un segundo mensaje igual ya no se filtra', () => {
  const r = crearRegistroDeEnviosPropios();
  r.anotarTexto('584121112233@c.us', 'Hola');
  assert.equal(r.esPropio('a', '584121112233@c.us', 'Hola'), true);
  assert.equal(r.esPropio('b', '584121112233@c.us', 'Hola'), false);
});

test('el mismo texto a otro chat no se confunde', () => {
  const r = crearRegistroDeEnviosPropios();
  r.anotarTexto('584121112233@c.us', 'Hola');
  assert.equal(r.esPropio('a', '584129999999@c.us', 'Hola'), false);
});

test('una anotación vencida deja de contar', () => {
  let t = 1_000_000;
  const r = crearRegistroDeEnviosPropios({ ahora: () => t, ttlMs: 60_000 });
  r.anotarTexto('584121112233@c.us', 'Hola');
  r.anotarId('id-1');
  t += 61_000;
  assert.equal(r.esPropio('id-1', '584121112233@c.us', 'Hola'), false);
});

// ── Captura del mensaje del asesor ────────────────────────────────────────────

test('guarda el mensaje que el asesor escribió a mano', async () => {
  const { capturar, guardados } = capturaCon();

  const res = await capturar(mensaje());

  assert.equal(res.guardado, true);
  assert.deepEqual(guardados[0], {
    user: '584121112233',
    phone: '584121112233@c.us',
    text: 'Le paso los datos de la transferencia.',
    type: 'chat'
  });
});

test('ignora lo que mandó el propio bot', async () => {
  const { capturar, guardados, registro } = capturaCon();
  registro.anotarId('true_584121112233@c.us_ABC');

  const res = await capturar(mensaje());

  assert.equal(res.guardado, false);
  assert.equal(res.motivo, 'lo_mando_el_bot');
  assert.equal(guardados.length, 0);
});

test('ignora los mensajes entrantes', async () => {
  const { capturar, guardados } = capturaCon();
  const res = await capturar(mensaje({ fromMe: false }));
  assert.equal(res.guardado, false);
  assert.equal(guardados.length, 0);
});

test('ignora los avisos que el equipo recibe en su propio número', async () => {
  // Si no, cada aviso al agente de ventas abriría una "conversación" con el equipo.
  const { capturar, guardados } = capturaCon();
  const res = await capturar(mensaje({ to: '584242745891@c.us' }));
  assert.equal(res.guardado, false);
  assert.equal(res.motivo, 'es_un_agente');
  assert.equal(guardados.length, 0);
});

test('ignora grupos, canales y estados', async () => {
  const { capturar } = capturaCon();
  for (const to of ['1203630@g.us', '12345@newsletter', 'status@broadcast']) {
    const res = await capturar(mensaje({ to }));
    assert.equal(res.guardado, false, `debería ignorar ${to}`);
  }
});

test('a un adjunto le pone marcador, y conserva el pie de foto', async () => {
  const { capturar, guardados } = capturaCon();

  await capturar(mensaje({ type: 'image', body: 'Así queda la sala' }));
  await capturar(mensaje({ type: 'ptt', body: '', id: { _serialized: 'otro' } }));

  assert.equal(guardados[0].text, '[imagen] Así queda la sala');
  assert.equal(guardados[0].type, 'image');
  assert.equal(guardados[1].text, '[nota de voz]');
});

test('un saliente sin nada que mostrar no se guarda', async () => {
  const { capturar, guardados } = capturaCon();
  const res = await capturar(mensaje({ body: '   ' }));
  assert.equal(res.guardado, false);
  assert.equal(guardados.length, 0);
});
