const test = require('node:test');
const assert = require('node:assert');
const { crearControlDePausa } = require('./botPause');

// Doble en memoria del modelo BotPause: solo guarda un documento por usuario,
// que es justo lo que garantiza el índice único de `user` en Mongo.
function fakeBotPause(inicial = null) {
  const estado = { doc: inicial ? { ...inicial } : null, escrituras: 0, borrados: 0 };
  return {
    estado,
    async findOne(filter) {
      return estado.doc && estado.doc.user === filter.user ? estado.doc : null;
    },
    async findOneAndUpdate(filter, update) {
      estado.escrituras += 1;
      estado.doc = { user: filter.user, ...update.$set };
      return estado.doc;
    },
    async deleteOne(filter) {
      if (estado.doc && estado.doc.user === filter.user) estado.doc = null;
      estado.borrados += 1;
      return { deletedCount: 1 };
    }
  };
}

const EN_UNA_HORA = () => new Date(Date.now() + 60 * 60 * 1000);
const HACE_UNA_HORA = () => new Date(Date.now() - 60 * 60 * 1000);

test('la pausa automática fija un vencimiento y no se marca como manual', async () => {
  const BotPause = fakeBotPause();
  const { pauseBotForUser } = crearControlDePausa({ BotPause });

  const pausa = await pauseBotForUser('584121110000', 2, 'notificacion_reserva');

  assert.equal(pausa.manual, false);
  assert.equal(pausa.reason, 'notificacion_reserva');
  assert.ok(pausa.until instanceof Date);
  const horas = (pausa.until.getTime() - Date.now()) / 3_600_000;
  assert.ok(horas > 1.9 && horas <= 2, `esperaba ~2 h, dio ${horas}`);
});

test('la pausa manual sin horas queda indefinida y registra quién la puso', async () => {
  const BotPause = fakeBotPause();
  const { pauseBotForUser } = crearControlDePausa({ BotPause });

  const pausa = await pauseBotForUser('584121110000', null, 'manual', { manual: true, by: 'asesor@nexus.com' });

  assert.equal(pausa.until, null);
  assert.equal(pausa.manual, true);
  assert.equal(pausa.pausedBy, 'asesor@nexus.com');
});

test('una pausa automática NO pisa una pausa manual vigente', async () => {
  const BotPause = fakeBotPause({ user: '584121110000', until: null, reason: 'manual', manual: true, pausedBy: 'asesor@nexus.com' });
  const { pauseBotForUser } = crearControlDePausa({ BotPause });

  const pausa = await pauseBotForUser('584121110000', 2, 'pago_comprobante');

  assert.equal(BotPause.estado.escrituras, 0, 'no debe escribir sobre la pausa manual');
  assert.equal(pausa.manual, true);
  assert.equal(pausa.reason, 'manual');
});

test('una pausa manual sí pisa una pausa automática vigente', async () => {
  const BotPause = fakeBotPause({ user: '584121110000', until: EN_UNA_HORA(), reason: 'pago_comprobante', manual: false });
  const { pauseBotForUser } = crearControlDePausa({ BotPause });

  const pausa = await pauseBotForUser('584121110000', null, 'manual', { manual: true, by: 'asesor@nexus.com' });

  assert.equal(pausa.manual, true);
  assert.equal(pausa.until, null);
});

test('una pausa manual vencida no bloquea a la automática', async () => {
  const BotPause = fakeBotPause({ user: '584121110000', until: HACE_UNA_HORA(), reason: 'manual', manual: true });
  const { pauseBotForUser } = crearControlDePausa({ BotPause });

  const pausa = await pauseBotForUser('584121110000', 2, 'pago_comprobante');

  assert.equal(pausa.manual, false);
  assert.equal(pausa.reason, 'pago_comprobante');
});

test('getBotPause trata la pausa sin fecha como vigente y descarta la vencida', async () => {
  const indefinida = crearControlDePausa({ BotPause: fakeBotPause({ user: '5841', until: null, manual: true }) });
  assert.ok(await indefinida.getBotPause('5841'), 'la indefinida sigue vigente');

  const vencida = crearControlDePausa({ BotPause: fakeBotPause({ user: '5841', until: HACE_UNA_HORA(), manual: false }) });
  assert.equal(await vencida.getBotPause('5841'), null);
});

test('reanudar sin force respeta la pausa manual', async () => {
  const BotPause = fakeBotPause({ user: '584121110000', until: null, reason: 'manual', manual: true });
  const { resumeBotForUser } = crearControlDePausa({ BotPause });

  const resultado = await resumeBotForUser('584121110000');

  assert.equal(resultado.resumed, false);
  assert.equal(resultado.reason, 'pausa_manual');
  assert.ok(BotPause.estado.doc, 'la pausa manual sigue ahí');
});

test('reanudar con force levanta también la pausa manual', async () => {
  const BotPause = fakeBotPause({ user: '584121110000', until: null, reason: 'manual', manual: true });
  const { resumeBotForUser } = crearControlDePausa({ BotPause });

  const resultado = await resumeBotForUser('584121110000', { force: true });

  assert.equal(resultado.resumed, true);
  assert.equal(BotPause.estado.doc, null);
});

test('reanudar sin force levanta una pausa automática', async () => {
  const BotPause = fakeBotPause({ user: '584121110000', until: EN_UNA_HORA(), reason: 'pago_comprobante', manual: false });
  const { resumeBotForUser } = crearControlDePausa({ BotPause });

  const resultado = await resumeBotForUser('584121110000');

  assert.equal(resultado.resumed, true);
  assert.equal(BotPause.estado.doc, null);
});

test('estadoPausa reporta el apagón global sin consultar la pausa por usuario', async () => {
  const BotPause = fakeBotPause();
  BotPause.findOne = async () => { throw new Error('no debería consultarse'); };
  const { estadoPausa } = crearControlDePausa({ BotPause });

  const estado = await estadoPausa('584121110000', { bot_status: false });

  assert.deepEqual(estado, { pausado: true, motivo: 'bot_apagado', until: null, manual: false });
});

test('estadoPausa expone el motivo y el carácter manual de la pausa del chat', async () => {
  const until = EN_UNA_HORA();
  const BotPause = fakeBotPause({ user: '584121110000', until, reason: 'pago_comprobante', manual: false });
  const { estadoPausa } = crearControlDePausa({ BotPause });

  const estado = await estadoPausa('584121110000', { bot_status: true });

  assert.deepEqual(estado, { pausado: true, motivo: 'pago_comprobante', until, manual: false });
});

test('estadoPausa deja pasar al bot cuando no hay nada que lo detenga', async () => {
  const { estadoPausa } = crearControlDePausa({ BotPause: fakeBotPause() });

  const estado = await estadoPausa('584121110000', { bot_status: true });

  assert.equal(estado.pausado, false);
  assert.equal(estado.motivo, null);
});
