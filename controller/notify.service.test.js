const test = require('node:test');
const assert = require('node:assert');
const { createNotifier } = require('./notify.service');

function notificadorFalso() {
  const pausas = [];
  const notificar = createNotifier({
    client: {},
    mongoose: { connection: { collection: () => ({ insertOne: async () => {} }) } },
    pauseBotForUser: async (user, horas, motivo) => { pausas.push({ user, horas, motivo }); return { until: new Date() }; },
    enviarMensajeWhatsapp: async () => true
  });
  return { notificar, pausas };
}

async function conAgente(fn) {
  const original = process.env.AGENTE_VENTAS_PHONE;
  process.env.AGENTE_VENTAS_PHONE = '584121110000';
  try { await fn(); } finally {
    if (original === undefined) delete process.env.AGENTE_VENTAS_PHONE;
    else process.env.AGENTE_VENTAS_PHONE = original;
  }
}

test('el aviso puede pedir una pausa más corta que la general', async () => {
  await conAgente(async () => {
    const { notificar, pausas } = notificadorFalso();
    await notificar({ descripcion: 'Reserva fuera de plazo', tipo_notificacion: 'RESERVA', telefono: '584121234567@c.us', pause_hours: 0.5 });
    assert.deepEqual(pausas, [{ user: '584121234567', horas: 0.5, motivo: 'notificacion_reserva' }]);
  });
});

test('sin pause_hours se usa la pausa general', async () => {
  await conAgente(async () => {
    const { notificar, pausas } = notificadorFalso();
    await notificar({ descripcion: 'Quiere hablar con alguien', tipo_notificacion: 'OTRO', telefono: '584121234567@c.us' });
    assert.equal(pausas[0].horas, undefined);
  });
});
