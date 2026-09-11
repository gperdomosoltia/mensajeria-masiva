const test = require('node:test');
const assert = require('node:assert');
const { parseDetectorOutput } = require('./payment.detector');

test('parsea un JSON limpio', () => {
  const out = parseDetectorOutput('{"es_comprobante": true, "confianza": 0.92}');
  assert.equal(out.esComprobante, true);
  assert.equal(out.confianza, 0.92);
});

test('parsea un JSON envuelto en bloque de código', () => {
  const out = parseDetectorOutput('```json\n{"es_comprobante": false, "confianza": 0.1}\n```');
  assert.equal(out.esComprobante, false);
  assert.equal(out.confianza, 0.1);
});

test('ante texto inválido devuelve falso sin lanzar', () => {
  assert.deepEqual(parseDetectorOutput('no soy json'), { esComprobante: false, confianza: 0 });
  assert.deepEqual(parseDetectorOutput(null), { esComprobante: false, confianza: 0 });
});

test('un confianza no numérico se trata como 0', () => {
  const out = parseDetectorOutput('{"es_comprobante": true, "confianza": "alta"}');
  assert.equal(out.confianza, 0);
});
