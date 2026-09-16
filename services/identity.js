// Cédula o RIF del cliente: normalización y guardado.
//
// Es el identificador único con el que se van a cruzar los pagos, así que se guarda en
// una forma sola y predecible. La normalización está aparte de Mongo para poder probarla
// con los casos raros, que en este dato son la norma: la gente escribe "V-12.345.678",
// "v 12345678" o solo los números.

// Letras aceptadas: V y E para personas, J/G/P para RIF. Van en la expresión regular de
// `normalizarCedula`; si se agrega una, hay que tocarla ahí.

/**
 * @returns {{ok: true, valor: string, tipo: 'cedula'|'rif'} | {ok: false, motivo: 'vacio'|'falta_tipo'|'formato'}}
 */
function normalizarCedula(valor) {
    const crudo = String(valor ?? '').trim();
    if (!crudo) return { ok: false, motivo: 'vacio' };

    // Se quita todo lo que no sea letra o dígito: puntos, guiones y espacios sobran.
    const limpio = crudo.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const conTipo = limpio.match(/^([VEJGP])(\d{6,9})$/);
    if (conTipo) {
        const [, letra, digitos] = conTipo;
        // Nueve dígitos es un RIF: los últimos son el verificador y van separados.
        if (digitos.length === 9) {
            return { ok: true, valor: `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}`, tipo: 'rif' };
        }
        return { ok: true, valor: `${letra}-${digitos}`, tipo: 'cedula' };
    }

    // Solo números: NO se asume V. Un extranjero con cédula E quedaría mal guardado, y
    // este valor va a ser la llave con la que se crucen los pagos.
    if (/^\d{6,9}$/.test(limpio)) return { ok: false, motivo: 'falta_tipo' };

    return { ok: false, motivo: 'formato' };
}

/** La suscripción se guarda por JID completo; el dashboard manda el número pelado. */
function aJid(user) {
    const crudo = String(user ?? '').trim();
    if (!crudo) return '';
    return crudo.includes('@') ? crudo : `${crudo}@c.us`;
}

function crearRegistroDeCedula({ Subscription }) {
    /**
     * Normaliza y guarda. Deja constancia de si la dio el cliente o la escribió un asesor,
     * quién fue y cuándo: si un cobro sale mal, esto es lo que permite auditarlo.
     *
     * @param {{user: string, cedula: string, origen: 'cliente'|'asesor', por?: string|null}} datos
     */
    async function guardarCedula({ user, cedula, origen, por }) {
        const jid = aJid(user);
        if (!jid) return { ok: false, motivo: 'sin_usuario' };

        const normalizada = normalizarCedula(cedula);
        if (!normalizada.ok) return normalizada;

        try {
            await Subscription.findOneAndUpdate(
                { user: jid },
                {
                    $set: {
                        cedula: normalizada.valor,
                        cedulaOrigen: origen === 'asesor' ? 'asesor' : 'cliente',
                        cedulaPor: origen === 'asesor' ? (por || null) : null,
                        cedulaEn: new Date()
                    },
                    // La suscripción normalmente ya existe, pero el dashboard puede escribir
                    // antes de que el cliente hable con el bot. `name` es obligatorio.
                    $setOnInsert: { user: jid, name: 'Sin nombre' }
                },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('❌ Error guardando la cédula:', error.message);
            return { ok: false, motivo: 'error_al_guardar' };
        }

        return { ok: true, valor: normalizada.valor, tipo: normalizada.tipo };
    }

    return { guardarCedula };
}

module.exports = { normalizarCedula, crearRegistroDeCedula };
