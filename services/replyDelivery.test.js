const test = require('node:test');
const assert = require('node:assert');
const { crearEntregaDeRespuesta } = require('./replyDelivery');

function deps(overrides = {}) {
  const actualizaciones = [];
  const enviados = [];
  return {
    actualizaciones,
    enviados,
    enviarMensajeWhatsapp: async (to, mensaje) => { enviados.push({ to, mensaje }); return true; },
    updateHistoryEntry: async (id, datos) => { actualizaciones.push({ id, datos }); return {}; },
    ...overrides
  };
}

const USAGE = { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } };

test('con el envío confirmado marca responded y deja constancia de que respondió el bot', async () => {
  const d = deps();
  const entregar = crearEntregaDeRespuesta(d);

  const res = await entregar('584121112233@c.us', 'Hola, con gusto.', 'h1', USAGE);

  assert.equal(res.sent, true);
  assert.equal(d.enviados.length, 1);
  assert.equal(d.actualizaciones.length, 1);
  assert.deepEqual(d.actualizaciones[0].datos, {
    response: 'Hola, con gusto.',
    status: 'responded',
    responseBy: 'bot',
    promptTokens: 10,
    completionTokens: 4,
    totalTokens: 14
  });
});

test('si el envío devuelve false NO marca responded', async () => {
  // enviarMensajeWhatsapp captura sus propios errores y devuelve false en vez de lanzar.
  // Derivar el éxito de "no lanzó" dejaba el turno como respondido sin que el cliente
  // recibiera nada, y el dashboard mostraba el tag verde "Respondido".
  const d = deps({ enviarMensajeWhatsapp: async () => false });
  const entregar = crearEntregaDeRespuesta(d);

  const res = await entregar('584121112233@c.us', 'Hola, con gusto.', 'h1', USAGE);

  assert.equal(res.sent, false);
  assert.equal(d.actualizaciones.length, 1);
  assert.equal(d.actualizaciones[0].datos.status, 'webhook_failed');
  assert.equal(d.actualizaciones[0].datos.response, 'Hola, con gusto.', 'se conserva lo que intentó decir');
});

test('si el envío lanza, tampoco marca responded y no propaga el error', async () => {
  const d = deps({ enviarMensajeWhatsapp: async () => { throw new Error('WhatsApp caído'); } });
  const entregar = crearEntregaDeRespuesta(d);

  const res = await entregar('584121112233@c.us', 'Hola.', 'h1', USAGE);

  assert.equal(res.sent, false);
  assert.equal(d.actualizaciones[0].datos.status, 'webhook_failed');
});

test('sin texto que enviar no toca WhatsApp ni el historial', async () => {
  const d = deps();
  const entregar = crearEntregaDeRespuesta(d);

  assert.equal((await entregar('x@c.us', '', 'h1', USAGE)).sent, false);
  assert.equal((await entregar('x@c.us', '   ', 'h1', USAGE)).sent, false);
  assert.equal((await entregar('x@c.us', null, 'h1', USAGE)).sent, false);
  assert.equal(d.enviados.length, 0);
  assert.equal(d.actualizaciones.length, 0);
});

test('un resultado sin usage no rompe la actualización', async () => {
  const d = deps();
  const entregar = crearEntregaDeRespuesta(d);

  await entregar('x@c.us', 'Hola.', 'h1', undefined);

  assert.equal(d.actualizaciones[0].datos.status, 'responded');
  assert.equal(d.actualizaciones[0].datos.promptTokens, undefined);
});

test('no entrega un mensaje que nombre términos prohibidos', async () => {
  // Nombrar USDT o Binance por chat es un problema regulatorio. El prompt es el control
  // principal, pero un prompt no es una garantía: esto es la red de abajo.
  const bloqueos = [];
  const d = deps({ alBloquear: async (datos) => { bloqueos.push(datos); } });
  const entregar = crearEntregaDeRespuesta(d);

  const res = await entregar('584121112233@c.us', 'La proteína cuesta 40 $, se paga en USDT por Binance.', 'h1', USAGE);

  assert.equal(res.sent, false);
  assert.equal(res.reason, 'terminos_prohibidos');
  assert.equal(d.enviados.length, 0, 'el cliente no recibe ese texto');
  assert.equal(bloqueos.length, 1, 'se abre el caso para que lo tome un asesor');
  assert.equal(bloqueos[0].to, '584121112233@c.us');
  // Queda registrado lo que el bot estuvo a punto de decir, para poder revisarlo.
  assert.equal(d.actualizaciones[0].datos.status, 'blocked_terms');
  assert.match(d.actualizaciones[0].datos.response, /USDT/);
});

test('bloquea los términos con o sin mayúsculas y otras variantes', async () => {
  for (const texto of ['pagas con usdt', 'te paso el Binance', 'a tasa paralela', 'según el monitor dólar']) {
    const d = deps({ alBloquear: async () => {} });
    const entregar = crearEntregaDeRespuesta(d);
    const res = await entregar('x@c.us', texto, 'h1', USAGE);
    assert.equal(res.sent, false, `debería bloquear: ${texto}`);
  }
});

test('un mensaje normal no se ve afectado por el filtro', async () => {
  const d = deps({ alBloquear: async () => {} });
  const entregar = crearEntregaDeRespuesta(d);

  const res = await entregar('x@c.us', 'Los planes se pagan en bolívares a tasa BCV del día.', 'h1', USAGE);

  assert.equal(res.sent, true);
  assert.equal(d.enviados.length, 1);
});

test('si el bloqueo no se puede registrar, igual no se envía el texto', async () => {
  const d = deps({ alBloquear: async () => { throw new Error('sin servicio'); } });
  const entregar = crearEntregaDeRespuesta(d);

  const res = await entregar('x@c.us', 'pagas por Binance', 'h1', USAGE);

  assert.equal(res.sent, false);
  assert.equal(d.enviados.length, 0);
});
