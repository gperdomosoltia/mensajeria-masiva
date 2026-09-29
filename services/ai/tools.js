// Schemas de las tools que ve el modelo.
//
// Cada número ve solo las suyas: el general no puede reservar y el de reservas no
// maneja pagos ni suplementos. Qué número es lo dice BOT_INSTANCE_ID
// (services/instancia.js). Los ejecutores están en services/ai/respond.js.
//
// Las tools se declaran acá y viajan en cada llamada a OpenAI: no hace falta
// declararlas en el Playground, y si se declaran allá también hay que mantener dos
// copias iguales a mano.

const { esReservas } = require('../instancia');

const NO_ANUNCIES = 'No anuncies que estás usando una herramienta.';

const TOOL_REGISTRAR_CEDULA = {
  type: 'function',
  name: 'registrar_cedula',
  description: [
    'Guarda la cédula o el RIF de la persona que escribe, que es como se le identifica.',
    'LLÁMALA EN CUANTO te dé el número, dentro del flujo de reserva, inscripción o pago.',
    'Manda el valor tal como lo dijo, con su letra si la dio.',
    'El sistema te responde si quedó guardada: si dice que falta el tipo, pregúntale si',
    'es V o E y vuelve a llamarla con la letra; si dice que el formato no sirve, pídele',
    'que lo repita. Nunca le pidas una foto del documento, solo el número.',
    'Nunca la uses para la cédula de un invitado.',
    NO_ANUNCIES
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      cedula: {
        type: 'string',
        description: 'Cédula o RIF tal como lo dio el cliente, ej. "V-12345678", "12345678" o "J-12345678-9".'
      }
    },
    required: ['cedula'],
    additionalProperties: true
  }
};

function toolNotificarHumano(descripcion) {
  return {
    type: 'function',
    name: 'notificar_humano',
    description: descripcion.join(' '),
    parameters: {
      type: 'object',
      properties: {
        tipo_notificacion: {
          type: 'string',
          enum: ['RESERVA', 'INTERES', 'SOPORTE', 'RECLAMO', 'OTRO'],
          description: 'RESERVA solo para visitas o citas que no son clases dirigidas.'
        },
        descripcion: {
          type: 'string',
          description: 'Resumen en una o dos frases de lo que pidió el cliente, en sus términos.'
        },
        nombre_cliente: { type: 'string' },
        apellido_cliente: { type: 'string' },
        telefono: { type: 'string', description: 'Solo si el cliente da un número distinto al del chat.' },
        email: { type: 'string' },
        servicio: { type: 'string', description: 'Plan, servicio o clase del que se trata.' },
        fecha: { type: 'string', description: 'Fecha mencionada, tal como la dijo el cliente.' },
        hora: { type: 'string', description: 'Hora mencionada (ej. "7:00 am").' },
        cantidad_personas: { type: 'string', description: 'Cuántas personas, si aplica.' },
        source: { type: 'string' }
      },
      required: ['descripcion', 'tipo_notificacion'],
      additionalProperties: true
    }
  };
}

function toolsGenerales() {
  return [
    toolNotificarHumano([
      'Avisa por WhatsApp a un asesor del equipo.',
      'Úsala cuando el cliente quiera inscribirse o agendar una visita, pida hablar con una persona,',
      'reclame o pregunte algo que no puedes resolver.',
      'NUNCA la uses para reservar clases, consultar horarios o cupos, ni cancelar reservas:',
      'eso va con derivar_a_reservas.',
      'No anuncies que estás usando una herramienta: después de llamarla, confirma con',
      'naturalidad al cliente que un asesor lo contactará.'
    ]),
    {
      type: 'function',
      name: 'derivar_a_reservas',
      description: [
        'Pasa al cliente al número de reservas de clases y le deja el contexto de lo que pidió.',
        'LLÁMALA cuando el cliente quiera reservar una clase, pregunte por horarios exactos o cupos,',
        'o quiera revisar o cancelar una reserva. Si la cédula no está registrada, pídela y',
        'regístrala antes con registrar_cedula.',
        'Devuelve el número de reservas: dáselo al cliente. Nunca digas que la reserva quedó hecha,',
        'solicitada ni confirmada.',
        NO_ANUNCIES
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', enum: ['reservar', 'horarios', 'revisar_reserva', 'cancelar'] },
          nombre_cliente: { type: 'string', description: 'Nombre y apellido, si ya los dio.' },
          solicitudes: {
            type: 'array',
            description: 'Clases que mencionó, una por ítem. Llena solo lo que el cliente dijo: omite el campo si no lo dijo, nunca lo completes ni pongas "no especificada".',
            items: {
              type: 'object',
              properties: {
                clase: { type: 'string', description: 'Como la dijo el cliente, ej. "Pilates", "Cycling".' },
                modalidad: { type: 'string', description: 'Solo para Bike y solo si la dijo: "Cycling", "Training Bike" o "Xtreme Bike".' },
                fecha: { type: 'string', description: 'Como la dijo el cliente: "el jueves", "2/10".' },
                hora: { type: 'string', description: 'Como la dijo el cliente: "en la tarde", "6:30".' }
              },
              additionalProperties: false
            }
          },
          cantidad_invitados: { type: 'integer', minimum: 0 },
          resumen: { type: 'string', description: 'Una o dos frases con lo que quiere, en sus términos.' }
        },
        required: ['motivo', 'resumen'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'pago_pendiente',
      description: [
        'Registra que el cliente ya pagó o pidió los datos para pagar, y avisa al asesor.',
        'LLÁMALA DE INMEDIATO cuando el cliente pida los datos para pagar,',
        'diga que ya pagó o anuncie que va a mandar el comprobante. Usa motivo "comprobante"',
        'si dice que ya pagó o que manda el comprobante, y "datos_pago" si está pidiendo los datos.',
        'No anuncies que estás usando una herramienta y no escribas nada después de llamarla:',
        'el sistema ya le responde al cliente.'
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', enum: ['comprobante', 'datos_pago'] },
          descripcion: { type: 'string', description: 'Una frase con lo que dijo el cliente.' }
        },
        required: ['motivo'],
        additionalProperties: true
      }
    },
    {
      type: 'function',
      name: 'consulta_suplementos',
      description: [
        'Deriva a un asesor cualquier conversación sobre suplementos: precios, marcas,',
        'presentaciones, disponibilidad, recomendaciones o simple interés en comprarlos.',
        'LLÁMALA DE INMEDIATO en cuanto el tema aparezca, aunque el cliente no pregunte el',
        'precio: basta con que quiera saber de suplementos. NUNCA des un precio, un monto,',
        'una forma de pago ni ninguna tasa de cambio para suplementos.',
        'No anuncies que estás usando una herramienta y no escribas nada después de llamarla:',
        'el sistema ya le responde al cliente.'
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          descripcion: { type: 'string', description: 'Una frase con lo que preguntó el cliente.' }
        },
        required: [],
        additionalProperties: true
      }
    },
    TOOL_REGISTRAR_CEDULA
  ];
}

function toolsDeReservas() {
  return [
    {
      type: 'function',
      name: 'consultar_horarios',
      description: [
        'Consulta las sesiones publicadas de una fecha, con cupos, instructor y si se pueden reservar ahora.',
        'LLÁMALA antes de mencionar cualquier hora, instructor o cupo.',
        'Si no hay nada de esa clase ese día, devuelve las clases que sí hay (clasesDelDia).',
        NO_ANUNCIES
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha exacta en formato YYYY-MM-DD, calculada con la fecha actual del sistema.' },
          clase: { type: 'string', description: 'Clase como la dijo el cliente, ej. "Pilates", "Cycling", "Boxeo".' },
          modalidad: { type: 'string', description: 'Solo para Bike: "Cycling", "Training Bike" o "Xtreme Bike".' },
          hora: { type: 'string', description: 'Hora en formato 24 h HH:mm, ej. "18:30".' }
        },
        required: ['fecha'],
        additionalProperties: false
      }
    },
    TOOL_REGISTRAR_CEDULA,
    {
      type: 'function',
      name: 'reservar_cupo_clase',
      description: [
        'Registra la SOLICITUD de un cupo en una sesión. Queda pendiente hasta que el equipo la confirme.',
        'Una llamada por persona y por sesión. Usa solo un sessionId devuelto por consultar_horarios.',
        'La titular es siempre quien escribe: su cédula la toma el sistema de la que ya registró.',
        'Para un invitado manda nombre, apellido y cédula del invitado, y además titular_nombre y',
        'titular_apellido de quien escribe.',
        NO_ANUNCIES
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          participante: { type: 'string', enum: ['titular', 'invitado'] },
          nombre: { type: 'string', description: 'Nombre del participante.' },
          apellido: { type: 'string', description: 'Apellido del participante.' },
          cedula: { type: 'string', description: 'Solo para invitado: cédula del invitado tal como la dio.' },
          titular_nombre: { type: 'string', description: 'Solo para invitado: nombre de quien escribe.' },
          titular_apellido: { type: 'string', description: 'Solo para invitado: apellido de quien escribe.' },
          aceptaListaEspera: { type: 'boolean', description: 'true solo si el cliente aceptó quedar en lista de espera.' }
        },
        required: ['sessionId', 'participante', 'nombre', 'apellido'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'consultar_mis_reservas',
      description: [
        'Devuelve las reservas y solicitudes del número del chat, incluidas las de sus invitados,',
        'con su estado y el reservationId de cada una.',
        NO_ANUNCIES
      ].join(' '),
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      type: 'function',
      name: 'solicitar_cancelacion',
      description: [
        'Registra el pedido de cancelar una reserva. El equipo lo aprueba; hasta entonces la reserva sigue activa.',
        'Usa el reservationId exacto que devolvió consultar_mis_reservas.',
        NO_ANUNCIES
      ].join(' '),
      parameters: {
        type: 'object',
        properties: { reservationId: { type: 'string' } },
        required: ['reservationId'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'derivar_a_informacion_general',
      description: [
        'Registra que la persona necesita información general (precios, planes, pagos, instalaciones,',
        'suplementos, entrenamiento personalizado, reglas de invitados) y deja el contexto para ese número.',
        'Devuelve el número de información general: dáselo y sigue atendiendo las reservas.',
        NO_ANUNCIES
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          tema: { type: 'string', description: 'Tema en pocas palabras, ej. "precio del plan mensual".' },
          resumen: { type: 'string', description: 'Una o dos frases con lo que preguntó.' }
        },
        required: ['tema', 'resumen'],
        additionalProperties: false
      }
    },
    toolNotificarHumano([
      'Avisa por WhatsApp a un asesor del equipo.',
      'Úsala cuando la persona pida hablar con alguien, presente una queja, pida una excepción',
      'o haya un error técnico con una reserva que no puedes resolver.',
      'No la uses para registrar reservas ni cancelaciones: eso va con sus propias herramientas.',
      NO_ANUNCIES
    ])
  ];
}

function buildToolSchemas() {
  return esReservas() ? toolsDeReservas() : toolsGenerales();
}

module.exports = { buildToolSchemas, toolsGenerales, toolsDeReservas };
