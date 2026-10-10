const test = require('node:test');
const assert = require('node:assert');
const { crearToolsDeClases, resolverClase, normalizarHora } = require('./clases');

const SESIONES = [
  { sessionId: 'a'.repeat(24), clase: 'Pilates', modalidad: null, fecha: '2026-09-29', hora: '18:30', cuposDisponibles: 3 },
  { sessionId: 'b'.repeat(24), clase: 'Bike', modalidad: 'Training Bike', fecha: '2026-09-29', hora: '18:30', cuposDisponibles: 5 },
  { sessionId: 'c'.repeat(24), clase: 'Bike', modalidad: 'Cycling', fecha: '2026-09-29', hora: '10:00', cuposDisponibles: 5 },
  { sessionId: 'd'.repeat(24), clase: 'Crossfun', modalidad: null, fecha: '2026-09-29', hora: '07:00', requiereReserva: false }
];

function clienteFalso({ sesiones = SESIONES, semanaPublicada = true, reservar = { resultado: 'pendiente', reservationId: 'r1' }, ok = true } = {}) {
  const llamadas = [];
  return {
    llamadas,
    async sesiones(fecha) { llamadas.push(['sesiones', fecha]); return { ok, data: { fecha, semanaPublicada, sesiones } }; },
    async reservar(body) { llamadas.push(['reservar', body]); return { ok, data: reservar }; },
    async reservas(telefono) { llamadas.push(['reservas', telefono]); return { ok, data: { reservas: [] } }; },
    async solicitarCancelacion(id, telefono) { llamadas.push(['cancelar', id, telefono]); return { ok, data: { resultado: 'cancelacion_solicitada', reservationId: id } }; }
  };
}

function tools({ cliente = clienteFalso(), subscription = { cedula: 'V-12345678', titularReserva: {} }, avisoOk = true } = {}) {
  const actualizaciones = [];
  const avisos = [];
  const t = crearToolsDeClases({
    cliente,
    findSubscription: async () => subscription,
    updateSubscription: async (user, data) => { actualizaciones.push(data); },
    notificarAsesor: async (payload) => { avisos.push(payload); return { result: avisoOk }; }
  });
  return { ...t, cliente, actualizaciones, avisos };
}

const CHAT = { telefono: '584121234567', rawUserId: '584121234567@c.us', userName: 'Mari' };

test('entiende cómo escribe la gente el nombre de una clase', () => {
  assert.deepEqual(resolverClase('spinning'), { clase: 'Bike', modalidad: 'Cycling' });
  assert.deepEqual(resolverClase('Training Bike'), { clase: 'Bike', modalidad: 'Training Bike' });
  assert.deepEqual(resolverClase('bike', 'xtreme'), { clase: 'Bike', modalidad: 'Xtreme Bike' });
  assert.deepEqual(resolverClase('CrossFit'), { clase: 'Crossfun', modalidad: null });
  assert.deepEqual(resolverClase('Pilátes'), { clase: 'Pilates', modalidad: null });
  assert.deepEqual(resolverClase('aerobics'), { texto: 'aerobics' });
  assert.equal(resolverClase(''), null);
});

test('pasa las horas como las escribe la gente a HH:mm', () => {
  assert.equal(normalizarHora('18:30'), '18:30');
  assert.equal(normalizarHora('6:30 pm'), '18:30');
  assert.equal(normalizarHora('6:30 p. m.'), '18:30');
  assert.equal(normalizarHora('6pm'), '18:00');
  assert.equal(normalizarHora('7 am'), '07:00');
  assert.equal(normalizarHora('12 am'), '00:00');
  assert.equal(normalizarHora('10'), '10:00');
  assert.equal(normalizarHora('18h30'), '18:30');
  assert.equal(normalizarHora('en la tarde'), null);
  assert.equal(normalizarHora(undefined), null);
});

test('consultar_horarios filtra en el bot: Training Bike no trae el Cycling', async () => {
  const t = tools();
  const r = await t.consultarHorarios({ fecha: '2026-09-29', clase: 'training bike' });
  assert.deepEqual(r.sesiones.map(s => s.sessionId), ['b'.repeat(24)]);
  assert.deepEqual(t.cliente.llamadas, [['sesiones', '2026-09-29']], 'al dashboard solo va la fecha');
});

test('consultar_horarios: una sesión sin modalidad aparece al buscar cualquier modalidad de su clase', async () => {
  const sesiones = [
    { sessionId: 'e'.repeat(24), clase: 'Bike', modalidad: null, fecha: '2026-10-10', hora: '11:00', cuposDisponibles: 14 },
    { sessionId: 'b'.repeat(24), clase: 'Bike', modalidad: 'Training Bike', fecha: '2026-10-10', hora: '18:30', cuposDisponibles: 5 }
  ];
  const t = tools({ cliente: clienteFalso({ sesiones }) });
  const r = await t.consultarHorarios({ fecha: '2026-10-10', clase: 'bike', modalidad: 'cycling', hora: '11 am' });
  assert.deepEqual(r.sesiones.map(s => s.sessionId), ['e'.repeat(24)]);
  const xtreme = await t.consultarHorarios({ fecha: '2026-10-10', clase: 'xtreme bike' });
  assert.deepEqual(xtreme.sesiones.map(s => s.sessionId), ['e'.repeat(24)], 'la de Training Bike sigue sin colarse');
});

test('consultar_horarios: sin sesión a esa hora devuelve las de la clase con una nota', async () => {
  const r = await tools().consultarHorarios({ fecha: '2026-09-29', clase: 'pilates', hora: '9 am' });
  assert.equal(r.sesiones.length, 1);
  assert.match(r.nota, /09:00/);
});

test('consultar_horarios: clase que no hay ese día devuelve las que sí hay', async () => {
  const r = await tools().consultarHorarios({ fecha: '2026-09-29', clase: 'yoga' });
  assert.deepEqual(r.sesiones, []);
  assert.deepEqual(r.clasesDelDia, ['Pilates', 'Bike (Training Bike)', 'Bike (Cycling)', 'Crossfun']);
});

test('consultar_horarios: semana sin publicar no devuelve sesiones', async () => {
  const r = await tools({ cliente: clienteFalso({ semanaPublicada: false }) }).consultarHorarios({ fecha: '2026-10-05' });
  assert.deepEqual(r, { fecha: '2026-10-05', semanaPublicada: false, sesiones: [] });
});

test('consultar_horarios rechaza una fecha que no es YYYY-MM-DD sin llamar al dashboard', async () => {
  const t = tools();
  const r = await t.consultarHorarios({ fecha: 'el jueves' });
  assert.equal(r.status, 'error');
  assert.equal(t.cliente.llamadas.length, 0);
});

test('reservar para la titular usa la cédula registrada y guarda su nombre', async () => {
  const t = tools();
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'titular', nombre: 'María', apellido: 'Gómez' }, CHAT);
  assert.equal(r.resultado, 'pendiente');
  const [, body] = t.cliente.llamadas[0];
  assert.equal(body.telefono, '584121234567');
  assert.deepEqual(body.titular, { nombre: 'María', apellido: 'Gómez', cedula: 'V-12345678' });
  assert.deepEqual(body.participante, { tipo: 'titular', nombre: 'María', apellido: 'Gómez', cedula: 'V-12345678' });
  assert.equal(body.aceptaListaEspera, false);
  assert.deepEqual(t.actualizaciones, [{ titularReserva: { nombre: 'María', apellido: 'Gómez' } }]);
});

const FUERA_DE_PLAZO = {
  resultado: 'fuera_de_ventana',
  anticipacionMinutos: 1440,
  alternativas: [],
  sesion: { sessionId: 'e'.repeat(24), clase: 'Bike', modalidad: null, fecha: '2026-10-10', hora: '11:00', cuposDisponibles: 14 }
};

test('dentro del plazo y con cupo, avisa al asesor con los datos y le pasa la conversación', async () => {
  const t = tools({ cliente: clienteFalso({ reservar: FUERA_DE_PLAZO }) });
  const r = await t.reservarCupo({ sessionId: 'e'.repeat(24), participante: 'titular', nombre: 'Vicmar', apellido: 'Luis' }, CHAT);
  assert.equal(r.resultado, 'derivada_a_asesor');
  assert.equal(t.avisos.length, 1);
  const aviso = t.avisos[0];
  assert.equal(aviso.tipo_notificacion, 'RESERVA');
  assert.equal(aviso.telefono, '584121234567@c.us');
  assert.equal(aviso.servicio, 'Bike');
  assert.equal(aviso.fecha, '2026-10-10');
  assert.equal(aviso.hora, '11:00');
  assert.equal(aviso.skip_pause, false, 'la conversación se pausa para que la atienda el asesor');
  assert.match(aviso.descripcion, /Vicmar Luis/);
  assert.match(aviso.descripcion, /V-12345678/);
  assert.match(aviso.descripcion, /24 h/);
});

test('dentro del plazo para un invitado, el aviso lleva los datos del invitado', async () => {
  const t = tools({ cliente: clienteFalso({ reservar: FUERA_DE_PLAZO }), subscription: { cedula: 'V-12345678', titularReserva: { nombre: 'Vicmar', apellido: 'Luis' } } });
  const r = await t.reservarCupo({ sessionId: 'e'.repeat(24), participante: 'invitado', nombre: 'Karelis', apellido: 'Manzano', cedula: '87654321' }, CHAT);
  assert.equal(r.resultado, 'derivada_a_asesor');
  assert.match(t.avisos[0].descripcion, /Karelis Manzano/);
  assert.match(t.avisos[0].descripcion, /invitad/);
});

test('dentro del plazo pero sin cupo, no molesta al asesor', async () => {
  const llena = { ...FUERA_DE_PLAZO, sesion: { ...FUERA_DE_PLAZO.sesion, cuposDisponibles: 0 } };
  const t = tools({ cliente: clienteFalso({ reservar: llena }) });
  const r = await t.reservarCupo({ sessionId: 'e'.repeat(24), participante: 'titular', nombre: 'Vicmar', apellido: 'Luis' }, CHAT);
  assert.equal(r.resultado, 'fuera_de_ventana');
  assert.equal(t.avisos.length, 0);
});

test('si el dashboard no dice los cupos, avisa igual: el asesor decide', async () => {
  const { sesion, ...sinSesion } = FUERA_DE_PLAZO;
  const t = tools({ cliente: clienteFalso({ reservar: sinSesion }) });
  const r = await t.reservarCupo({ sessionId: 'e'.repeat(24), participante: 'titular', nombre: 'Vicmar', apellido: 'Luis' }, CHAT);
  assert.equal(r.resultado, 'derivada_a_asesor');
  assert.equal(t.avisos.length, 1);
});

test('si el aviso al asesor falla, el modelo recibe un error en vez de prometer contacto', async () => {
  const t = tools({ cliente: clienteFalso({ reservar: FUERA_DE_PLAZO }), avisoOk: false });
  const r = await t.reservarCupo({ sessionId: 'e'.repeat(24), participante: 'titular', nombre: 'Vicmar', apellido: 'Luis' }, CHAT);
  assert.equal(r.resultado, 'error');
});

test('un nombre de relleno como "Cliente" no cuenta: usa el del contacto', async () => {
  const t = tools();
  await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'titular', nombre: 'Cliente', apellido: 'Blanco' }, CHAT);
  const [, body] = t.cliente.llamadas[0];
  assert.deepEqual(body.titular, { nombre: 'Mari', apellido: 'Blanco', cedula: 'V-12345678' });
});

test('sin nombre real de la titular ni del contacto, lo pide en vez de reservar', async () => {
  const t = tools({ subscription: { cedula: 'V-12345678', titularReserva: { nombre: 'Cliente', apellido: 'Blanco' } } });
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'titular', nombre: 'cliente', apellido: 'Blanco' }, { ...CHAT, userName: 'Usuario' });
  assert.equal(r.resultado, 'falta_datos_titular');
  assert.equal(t.cliente.llamadas.length, 0);
});

test('un invitado con nombre de relleno se pide de nuevo', async () => {
  const t = tools({ subscription: { cedula: 'V-12345678', titularReserva: { nombre: 'María', apellido: 'Gómez' } } });
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'invitado', nombre: 'Invitado', apellido: 'Pérez', cedula: 'V-23456789' }, CHAT);
  assert.equal(r.resultado, 'falta_datos_invitado');
  assert.equal(t.cliente.llamadas.length, 0);
});

test('reservar sin cédula de la titular no llama al dashboard', async () => {
  const t = tools({ subscription: { cedula: null } });
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'titular', nombre: 'María', apellido: 'Gómez' }, CHAT);
  assert.deepEqual(r, { resultado: 'falta_cedula', falta: 'titular' });
  assert.equal(t.cliente.llamadas.length, 0);
});

test('reservar para un invitado toma los datos de la titular de su reserva anterior', async () => {
  const t = tools({ subscription: { cedula: 'V-12345678', titularReserva: { nombre: 'María', apellido: 'Gómez' } } });
  await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'invitado', nombre: 'Ana', apellido: 'Pérez', cedula: 'v 23.456.789', aceptaListaEspera: true }, CHAT);
  const [, body] = t.cliente.llamadas[0];
  assert.deepEqual(body.titular, { nombre: 'María', apellido: 'Gómez', cedula: 'V-12345678' });
  assert.deepEqual(body.participante, { tipo: 'invitado', nombre: 'Ana', apellido: 'Pérez', cedula: 'V-23456789' });
  assert.equal(body.aceptaListaEspera, true);
  assert.equal(t.actualizaciones.length, 0, 'no reescribe la titular si no cambió');
});

test('reservar para un invitado sin datos de la titular los pide', async () => {
  const t = tools({ subscription: { cedula: 'V-12345678' } });
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'invitado', nombre: 'Ana', apellido: 'Pérez', cedula: 'V-23456789' }, CHAT);
  assert.equal(r.resultado, 'falta_datos_titular');
  assert.equal(t.cliente.llamadas.length, 0);
});

test('reservar para un invitado sin cédula devuelve falta_cedula del participante', async () => {
  const t = tools({ subscription: { cedula: 'V-12345678', titularReserva: { nombre: 'María', apellido: 'Gómez' } } });
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'invitado', nombre: 'Ana', apellido: 'Pérez' }, CHAT);
  assert.deepEqual(r, { resultado: 'falta_cedula', falta: 'participante' });
});

test('un sessionId inventado no llega al dashboard', async () => {
  const t = tools();
  const r = await t.reservarCupo({ sessionId: 'pilates-jueves', participante: 'titular', nombre: 'María', apellido: 'Gómez' }, CHAT);
  assert.deepEqual(r, { resultado: 'sesion_no_disponible' });
  assert.equal(t.cliente.llamadas.length, 0);
});

test('si el dashboard falla, el modelo recibe resultado "error"', async () => {
  const t = tools({ cliente: clienteFalso({ ok: false, reservar: null }) });
  const r = await t.reservarCupo({ sessionId: 'a'.repeat(24), participante: 'titular', nombre: 'María', apellido: 'Gómez' }, CHAT);
  assert.deepEqual(r, { resultado: 'error' });
});

test('solicitar_cancelacion: un id mal formado es no_encontrada sin llamar al dashboard', async () => {
  const t = tools();
  assert.deepEqual(await t.solicitarCancelacion({ reservationId: '123' }, CHAT), { resultado: 'no_encontrada' });
  assert.equal(t.cliente.llamadas.length, 0);
  const r = await t.solicitarCancelacion({ reservationId: 'e'.repeat(24) }, CHAT);
  assert.equal(r.resultado, 'cancelacion_solicitada');
  assert.deepEqual(t.cliente.llamadas[0], ['cancelar', 'e'.repeat(24), '584121234567']);
});
