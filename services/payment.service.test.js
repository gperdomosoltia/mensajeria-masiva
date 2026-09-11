const test = require('node:test');
const assert = require('node:assert');
const { crearServicioPagos, ACK_COMPROBANTE } = require('./payment.service');

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
      async create(doc) { creados.push(doc); return { ...doc, _id: 'id-1' }; }
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

test('si la pausa falla no se crea el caso', async () => {
  const d = deps({ pauseBotForUser: async () => null });
  const registrar = crearServicioPagos(d);
  const res = await registrar({ userId: '58412', rawUserId: '58412@c.us', motivo: 'datos_pago' });
  assert.equal(res.created, false);
  assert.equal(res.acked, false);
  assert.equal(d.creados.length, 0);
});
