// Igual que notifier.registry.js: index.js arma el servicio de pagos (necesita el
// cliente de WhatsApp) y lo deja acá para que services/ai/respond.js lo use sin
// importar index.js y crear un ciclo.
let registrar = null;
function setPagoRegistrar(fn) { registrar = fn; }
function getPagoRegistrar() { return registrar; }
module.exports = { setPagoRegistrar, getPagoRegistrar };
