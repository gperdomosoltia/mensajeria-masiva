const test = require('node:test');
const assert = require('node:assert');
const { crearDerivaciones, formatearContexto } = require('./derivaciones');

// Doble en memoria del modelo: lo justo para las consultas que hace el servicio.
function fakeDerivacion() {
  const docs = [];
  let id = 0;
  const coincide = (doc, filtro) => Object.entries(filtro).every(([k, v]) => {
    if (v && typeof v === 'object' && '$gt' in v) return doc[k] > v.$gt;
    return String(doc[k]) === String(v);
  });
  return {
    docs,
    async updateMany(filtro, update) { for (const d of docs) if (coincide(d, filtro)) Object.assign(d, update.$set); },
    async create(doc) { const nuevo = { _id: String(++id), createdAt: new Date(Date.now() + id), ...doc }; docs.push(nuevo); return nuevo; },
    findOne(filtro) {
      const encontrados = docs.filter(d => coincide(d, filtro)).sort((a, b) => b.createdAt - a.createdAt);
      return { sort: async () => encontrados[0] || null };
    },
    async updateOne(filtro, update) { const d = docs.find(x => coincide(x, filtro)); if (d) Object.assign(d, update.$set); }
  };
}

const BASE = { telefono: '584121234567', origen: 'nexus_general', destino: 'nexus_reservas' };

test('una derivación nueva vence la pendiente anterior del mismo teléfono', async () => {
  const Derivacion = fakeDerivacion();
  const d = crearDerivaciones({ Derivacion });
  await d.crear({ ...BASE, contexto: { resumen: 'primera' } });
  await d.crear({ ...BASE, contexto: { resumen: 'segunda' } });
  assert.deepEqual(Derivacion.docs.map(x => x.estado), ['vencida', 'pendiente']);
  const pendiente = await d.buscarPendiente({ telefono: BASE.telefono, destino: 'nexus_reservas' });
  assert.equal(pendiente.contexto.resumen, 'segunda');
});

test('una derivación vencida por tiempo no se entrega', async () => {
  const Derivacion = fakeDerivacion();
  const d = crearDerivaciones({ Derivacion });
  await d.crear({ ...BASE, ahora: new Date(Date.now() - 100 * 3_600_000) });
  assert.equal(await d.buscarPendiente({ telefono: BASE.telefono, destino: 'nexus_reservas' }), null);
});

test('se entrega una sola vez', async () => {
  const Derivacion = fakeDerivacion();
  const d = crearDerivaciones({ Derivacion });
  const creada = await d.crear(BASE);
  await d.marcarEntregada(creada._id);
  assert.equal(await d.buscarPendiente({ telefono: BASE.telefono, destino: 'nexus_reservas' }), null);
  assert.ok(Derivacion.docs[0].entregadaAt instanceof Date);
});

test('el bloque para reservas trae lo que pidió en información general', () => {
  const texto = formatearContexto({
    origen: 'nexus_general',
    destino: 'nexus_reservas',
    nombreCliente: 'María Gómez',
    cedulaRegistrada: true,
    contexto: {
      motivo: 'reservar',
      solicitudes: [{ clase: 'Pilates', fecha: 'el jueves', hora: 'en la tarde' }],
      cantidad_invitados: 1,
      resumen: 'quiere empezar Pilates con una amiga'
    }
  });
  assert.equal(texto, [
    '[CONTEXTO_DERIVACION]',
    'Viene de: información general',
    'Nombre: María Gómez',
    'Cédula registrada: sí',
    'Motivo: reservar',
    'Pidió: Pilates, el jueves, en la tarde; va con 1 invitado',
    'Resumen: quiere empezar Pilates con una amiga',
    '[/CONTEXTO_DERIVACION]'
  ].join('\n'));
});

test('el bloque para información general trae el tema, sin cédula', () => {
  const texto = formatearContexto({
    origen: 'nexus_reservas',
    destino: 'nexus_general',
    contexto: { tema: 'precio del plan', resumen: 'pregunta cuánto cuesta el mensual' }
  });
  assert.match(texto, /Viene de: reservas de clases/);
  assert.match(texto, /Tema: precio del plan/);
  assert.doesNotMatch(texto, /Cédula/);
});
