const test = require('node:test');
const assert = require('node:assert');
const { destinatarioAlertaApagado, createNotifier } = require('./notify.service');

function conVariable(valor, fn) {
  const original = process.env.ALERTA_BOT_APAGADO_PHONE;
  if (valor === undefined) delete process.env.ALERTA_BOT_APAGADO_PHONE;
  else process.env.ALERTA_BOT_APAGADO_PHONE = valor;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.ALERTA_BOT_APAGADO_PHONE;
    else process.env.ALERTA_BOT_APAGADO_PHONE = original;
  }
}

test('normaliza el número del aviso de apagado a JID', () => {
  conVariable('+58 424-3522065', () => {
    assert.strictEqual(destinatarioAlertaApagado(), '584243522065@c.us');
  });
});

test('respeta un JID que ya viene completo', () => {
  conVariable('584129999999@c.us', () => {
    assert.strictEqual(destinatarioAlertaApagado(), '584129999999@c.us');
  });
});

test('sin variable no hay destinatario', () => {
  conVariable(undefined, () => {
    assert.strictEqual(destinatarioAlertaApagado(), null);
  });
});

test('el placeholder de Railway no cuenta como número', () => {
  conVariable('REEMPLAZAR', () => {
    assert.strictEqual(destinatarioAlertaApagado(), null);
  });
});

test('un número inválido devuelve null en vez de reventar', () => {
  conVariable('no-es-un-numero', () => {
    assert.strictEqual(destinatarioAlertaApagado(), null);
  });
});

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
