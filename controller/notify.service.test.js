const test = require('node:test');
const assert = require('node:assert');
const { destinatarioAlertaApagado } = require('./notify.service');

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
