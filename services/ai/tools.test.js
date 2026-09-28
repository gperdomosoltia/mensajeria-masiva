const test = require('node:test');
const assert = require('node:assert');
const { toolsGenerales, toolsDeReservas } = require('./tools');

const nombres = (tools) => tools.map(t => t.name).sort();

test('el número general no puede reservar y deriva a reservas', () => {
  assert.deepEqual(nombres(toolsGenerales()), [
    'consulta_suplementos', 'derivar_a_reservas', 'notificar_humano', 'pago_pendiente', 'registrar_cedula'
  ]);
});

test('el número de reservas tiene las siete tools del prompt y ninguna de pagos', () => {
  assert.deepEqual(nombres(toolsDeReservas()), [
    'consultar_horarios', 'consultar_mis_reservas', 'derivar_a_informacion_general',
    'notificar_humano', 'registrar_cedula', 'reservar_cupo_clase', 'solicitar_cancelacion'
  ]);
});

test('notificar_humano del general ya no manda las reservas de clases al asesor', () => {
  const notificar = toolsGenerales().find(t => t.name === 'notificar_humano');
  assert.doesNotMatch(notificar.description, /LLÁMALA DE INMEDIATO en cuanto el cliente exprese que quiere reservar/);
  assert.match(notificar.description, /derivar_a_reservas/);
});
