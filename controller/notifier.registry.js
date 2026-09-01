// Registro del notificador de agentes.
//
// `createNotifier` necesita el cliente de WhatsApp, que solo existe en index.js.
// Los servicios de IA (services/ai/respond.js) corren en el mismo proceso pero no
// pueden requerir index.js sin crear un ciclo, así que index.js deja aquí la
// función ya construida y respond.js la recoge cuando la IA dispara la tool.
let notifier = null;

function setNotifier(fn) {
    notifier = typeof fn === 'function' ? fn : null;
}

function getNotifier() {
    return notifier;
}

module.exports = { setNotifier, getNotifier };
