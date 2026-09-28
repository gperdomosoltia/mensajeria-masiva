const test = require('node:test');
const assert = require('node:assert');
const { textoDelAviso, formatearFecha } = require('./avisosReserva');

// 22:30 UTC = 18:30 en Caracas (UTC-4), jueves 1 de octubre de 2026.
const INICIO = '2026-10-01T22:30:00.000Z';
const TITULAR = { tipo: 'titular', nombre: 'María', apellido: 'Gómez' };
const INVITADA = { tipo: 'invitado', nombre: 'Ana', apellido: 'Pérez' };

test('la fecha sale en hora de Caracas y en el formato del aviso', () => {
  assert.equal(formatearFecha(INICIO), 'jueves 1/10, 6:30 p. m.');
  assert.equal(formatearFecha('2026-10-01T11:00:00.000Z'), 'jueves 1/10, 7:00 a. m.');
  assert.equal(formatearFecha('no es fecha'), '');
});

test('confirmada: distinto texto para la titular y para un invitado', () => {
  const titular = textoDelAviso({ tipo: 'confirmada', clase: 'Pilates', inicio: INICIO, participante: TITULAR });
  assert.equal(titular.texto, '¡Listo! Tu cupo para *Pilates* el jueves 1/10, 6:30 p. m. quedó confirmado. Te esperamos en Nexus. Si no puedes venir, avísanos por aquí hasta una hora antes para liberar el cupo.');
  const invitado = textoDelAviso({ tipo: 'confirmada', clase: 'Pilates', inicio: INICIO, participante: INVITADA });
  assert.match(invitado.texto, /^¡Listo! El cupo de Ana Pérez para \*Pilates\*/);
});

test('rechazada: solo da el motivo si es sin_cupo', () => {
  const lleno = textoDelAviso({ tipo: 'rechazada', motivo: 'sin_cupo', clase: 'Pilates', inicio: INICIO, participante: TITULAR });
  assert.match(lleno.texto, /la clase se llenó/);
  const otro = textoDelAviso({ tipo: 'rechazada', motivo: 'otro', clase: 'Pilates', inicio: INICIO, participante: TITULAR });
  assert.doesNotMatch(otro.texto, /llen/);
  assert.match(otro.texto, /0424 274 5897/);
});

test('la modalidad se agrega al nombre de la clase', () => {
  const r = textoDelAviso({ tipo: 'cancelacion_aprobada', clase: 'Bike', modalidad: 'Training Bike', inicio: INICIO, participante: TITULAR });
  assert.match(r.texto, /\*Bike Training Bike\*/);
});

test('ningún aviso empieza con "No" ni habla de "humano"', () => {
  for (const tipo of ['confirmada', 'rechazada', 'cancelacion_aprobada', 'cancelacion_rechazada', 'cancelada_por_equipo']) {
    for (const participante of [TITULAR, INVITADA]) {
      for (const motivo of ['sin_cupo', null]) {
        const { ok, texto } = textoDelAviso({ tipo, motivo, clase: 'Pilates', inicio: INICIO, participante });
        assert.ok(ok, tipo);
        assert.doesNotMatch(texto, /^No\b/);
        assert.doesNotMatch(texto, /humano/i);
      }
    }
  }
});

test('tipo o fecha inválidos no arman texto', () => {
  assert.deepEqual(textoDelAviso({ tipo: 'otra_cosa', clase: 'Pilates', inicio: INICIO }), { ok: false, error: 'tipo_invalido' });
  assert.deepEqual(textoDelAviso({ tipo: 'confirmada', clase: 'Pilates', inicio: 'x' }), { ok: false, error: 'inicio_invalido' });
});
