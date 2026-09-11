const test = require('node:test');
const assert = require('node:assert');
const { crearServicioPagos, ACK_COMPROBANTE } = require('./payment.service');
const { createNotifier } = require('../controller/notify.service');

function deps(overrides = {}) {
  const enviados = [];
  const avisos = [];
  const pausas = [];
  const creados = [];
  return {
    enviados, avisos, pausas, creados,
    PaymentReview: {
      pendiente: null,
      async findOne() { return this.pendiente; },
      // M11: registrarPagoPendiente ahora hace `review.save()` (para reflejar el
      // pauseUntil real, o para marcar `expired` si la pausa falla), así que el doc
      // devuelto por create() necesita un save() usable, además de quedar en `creados`
      // tal cual se pidió (sin el save inyectado) para que las aserciones de forma no
      // se ensucien.
      async create(doc) { creados.push(doc); return { ...doc, _id: 'id-1', save: async () => {} }; }
    },
    pauseBotForUser: async (user, horas, reason) => { pausas.push({ user, horas, reason }); return { until: new Date('2026-09-10T18:00:00Z') }; },
    enviarMensajeWhatsapp: async (to, mensaje) => { enviados.push({ to, mensaje }); return true; },
    notificarAgentes: async (payload) => { avisos.push(payload); return { result: true }; },
    ...overrides
  };
}

test('crea el caso, pausa el bot, acusa recibo y avisa a los agentes', async () => {
  const d = deps();
  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '584121112233', rawUserId: '584121112233@c.us', userName: 'Ana', motivo: 'comprobante', gcs_objectKey: 'https://x/y.jpg' });

  assert.equal(res.created, true);
  assert.equal(res.acked, true);
  assert.equal(d.pausas.length, 1);
  assert.equal(d.pausas[0].user, '584121112233');
  assert.equal(d.pausas[0].horas, 2);
  assert.equal(d.pausas[0].reason, 'pago_comprobante');
  assert.equal(d.enviados[0].to, '584121112233@c.us');
  assert.equal(d.enviados[0].mensaje, ACK_COMPROBANTE);
  assert.equal(d.avisos[0].tipo_notificacion, 'PAGO');
  assert.equal(d.creados[0].status, 'pending');
  assert.equal(d.creados[0].motivo, 'comprobante');
  assert.ok(d.creados[0].nextNotifyAt instanceof Date);
});

test('con un caso pendiente no duplica ni vuelve a acusar recibo', async () => {
  const d = deps();
  let guardado = false;
  d.PaymentReview.pendiente = { _id: 'existente', gcs_objectKey: null, save: async () => { guardado = true; } };
  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '584121112233', rawUserId: '584121112233@c.us', userName: 'Ana', motivo: 'comprobante', gcs_objectKey: 'https://x/y2.jpg' });

  assert.equal(res.created, false);
  assert.equal(res.acked, false);
  assert.equal(d.enviados.length, 0);
  assert.equal(d.creados.length, 0);
  assert.equal(d.pausas.length, 0);
  assert.equal(guardado, true);
});

test('si la pausa falla no se deja el caso como pending (aunque ya se creó)', async () => {
  // M11: el caso se crea ANTES de pausar (para que un fallo en create() no deje una
  // pausa huérfana), así que si la pausa falla DESPUÉS, el caso ya existe en Mongo:
  // no se puede "no crear". Lo que sí se garantiza es que no queda como `pending`
  // sin pausa real detrás, y que el llamador sigue viendo created:false/acked:false.
  const d = deps({ pauseBotForUser: async () => null });
  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '58412', rawUserId: '58412@c.us', motivo: 'datos_pago' });
  assert.equal(res.created, false);
  assert.equal(res.acked, false);
  assert.equal(res.review, null);
  assert.equal(d.creados.length, 1);
  assert.equal(d.creados[0].status, 'pending');
  assert.equal(d.enviados.length, 0);
  assert.equal(d.avisos.length, 0);
});

test('si enviarMensajeWhatsapp resuelve false, el caso se crea igual pero acked queda false', async () => {
  // enviarMensajeWhatsapp real (index.js) no lanza en un fallo de WhatsApp: atrapa el
  // error de client.sendMessage y resuelve `false`. acked debe reflejar ese valor
  // resuelto, no solo la ausencia de una excepción.
  const d = deps({ enviarMensajeWhatsapp: async () => false });
  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '584121112233', rawUserId: '584121112233@c.us', userName: 'Ana', motivo: 'comprobante' });

  assert.equal(res.created, true);
  assert.equal(res.acked, false);
});

test('si enviarMensajeWhatsapp lanza, acked queda false y la función no rechaza', async () => {
  const d = deps({ enviarMensajeWhatsapp: async () => { throw new Error('boom'); } });
  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '584121112233', rawUserId: '584121112233@c.us', userName: 'Ana', motivo: 'comprobante' });

  assert.equal(res.created, true);
  assert.equal(res.acked, false);
});

// C1: un caso `pending` con la pausa ya vencida (p. ej. el dashboard estuvo caído y
// nunca lo expiró) no es un duplicado real: se cierra como `expired` y se crea uno
// nuevo con acuse, en vez de dejar al cliente en silencio para siempre.
test('con un caso pendiente cuya pausa ya venció, se expira y se crea uno nuevo con acuse', async () => {
  let guardadoExistente = null;
  const existente = {
    _id: 'viejo-1',
    status: 'pending',
    gcs_objectKey: null,
    pauseUntil: new Date(Date.now() - 60 * 1000), // venció hace un minuto
    nextNotifyAt: new Date(Date.now() - 30 * 1000),
    save: async function () { guardadoExistente = { status: this.status, nextNotifyAt: this.nextNotifyAt }; }
  };
  const d = deps();
  d.PaymentReview.pendiente = existente;

  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '584121112233', rawUserId: '584121112233@c.us', userName: 'Ana', motivo: 'comprobante', gcs_objectKey: 'https://x/nuevo.jpg' });

  // El caso viejo quedó cerrado.
  assert.equal(guardadoExistente.status, 'expired');
  assert.equal(guardadoExistente.nextNotifyAt, null);

  // Y se creó uno nuevo, con pausa y acuse, como si no hubiera habido caso previo.
  assert.equal(res.created, true);
  assert.equal(res.acked, true);
  assert.equal(d.creados.length, 1);
  assert.equal(d.creados[0].status, 'pending');
  assert.equal(d.pausas.length, 1);
  assert.equal(d.enviados.length, 1);
  assert.equal(d.enviados[0].mensaje, ACK_COMPROBANTE);
});

test('con un caso pendiente cuya pausa sigue viva, no se expira ni se duplica', async () => {
  let guardado = false;
  const existente = {
    _id: 'vivo-1',
    status: 'pending',
    gcs_objectKey: null,
    pauseUntil: new Date(Date.now() + 60 * 60 * 1000), // todavía viva
    save: async () => { guardado = true; }
  };
  const d = deps();
  d.PaymentReview.pendiente = existente;

  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '584121112233', rawUserId: '584121112233@c.us', userName: 'Ana', motivo: 'comprobante' });

  assert.equal(res.created, false);
  assert.equal(res.acked, false);
  assert.equal(existente.status, 'pending'); // no se tocó el status
  assert.equal(d.creados.length, 0);
  assert.equal(d.enviados.length, 0);
  assert.equal(guardado, true); // sí se guarda (puede actualizar gcs_objectKey/motivo)
});

// I2: services/payment.service.js pasa `skip_pause: true` en la notificación; el
// notify.service.js real (no un mock) debe respetarlo y no pisar la pausa que ya puso
// el flujo de pago. Se usa createNotifier real para probar la integración entre los
// dos módulos, con PAGO_PAUSE_HOURS distinto de BOT_PAUSE_HOURS para exponer el drift.
test('el aviso a agentes no pisa la pausa que puso el pago (I2)', async () => {
  const originalPagoHoras = process.env.PAGO_PAUSE_HOURS;
  const originalAgente1 = process.env.AGENTE_VENTAS_PHONE;
  const originalAgente2 = process.env.AGENTE_VENTAS_PHONE_2;
  process.env.PAGO_PAUSE_HOURS = '5'; // BOT_PAUSE_HOURS default es 2: distinto a propósito
  process.env.AGENTE_VENTAS_PHONE = '584129999999@c.us';
  process.env.AGENTE_VENTAS_PHONE_2 = '';

  try {
    // Simula la colección `bot_pauses`: user -> { until, reason }.
    const botPauses = new Map();
    const pauseBotForUser = async (user, horas, reason) => {
      const h = Number(horas ?? process.env.BOT_PAUSE_HOURS ?? 2);
      const until = new Date(Date.now() + h * 60 * 60 * 1000);
      botPauses.set(String(user), { until, reason });
      return { until };
    };

    const notificarAgentes = createNotifier({
      client: {},
      mongoose: { connection: { collection: () => ({ insertOne: async () => {} }) } },
      pauseBotForUser,
      MessageMedia: {},
      enviarMensajeWhatsapp: async () => true,
      fetch: async () => {}
    });

    const registrar = crearServicioPagos({
      PaymentReview: {
        async findOne() { return null; },
        async create(doc) { return { ...doc, _id: 'id-i2', save: async () => {} }; }
      },
      pauseBotForUser,
      enviarMensajeWhatsapp: async () => true,
      notificarAgentes
    });

    const res = await registrar({ userId: '584121110000', rawUserId: '584121110000@c.us', userName: 'Luis', motivo: 'comprobante' });

    assert.equal(res.created, true);
    const pausaFinal = botPauses.get('584121110000');
    assert.ok(pausaFinal, 'debía quedar una pausa registrada');
    // Si notify.service NO respetara skip_pause, pisaría esto con una pausa de
    // BOT_PAUSE_HOURS (2h) en vez de las 5h de PAGO_PAUSE_HOURS, y este assert fallaría.
    assert.equal(pausaFinal.until.getTime(), res.review.pauseUntil.getTime());
  } finally {
    if (originalPagoHoras === undefined) delete process.env.PAGO_PAUSE_HOURS; else process.env.PAGO_PAUSE_HOURS = originalPagoHoras;
    if (originalAgente1 === undefined) delete process.env.AGENTE_VENTAS_PHONE; else process.env.AGENTE_VENTAS_PHONE = originalAgente1;
    if (originalAgente2 === undefined) delete process.env.AGENTE_VENTAS_PHONE_2; else process.env.AGENTE_VENTAS_PHONE_2 = originalAgente2;
  }
});
