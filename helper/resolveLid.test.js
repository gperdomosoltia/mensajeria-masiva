const test = require('node:test');
const assert = require('node:assert');
const resolveLidToPhone = require('./resolveLid.js');

test('deja pasar un JID @c.us sin consultar al cliente', async () => {
    let llamadas = 0;
    const client = { getContactLidAndPhone: async () => { llamadas++; return []; } };

    const result = await resolveLidToPhone(client, '584121234567@c.us');

    assert.strictEqual(result, '584121234567@c.us');
    assert.strictEqual(llamadas, 0, 'no debe consultar para IDs que no son @lid');
});

test('traduce un @lid a su @c.us', async () => {
    const client = {
        getContactLidAndPhone: async (ids) => {
            assert.deepStrictEqual(ids, ['256740377493618@lid']);
            return [{ lid: '256740377493618@lid', pn: '584121234567@c.us' }];
        }
    };

    const result = await resolveLidToPhone(client, '256740377493618@lid');

    assert.strictEqual(result, '584121234567@c.us');
});

test('conserva el @lid original si WhatsApp no devuelve teléfono', async () => {
    const client = {
        getContactLidAndPhone: async () => [{ lid: '256740377493618@lid', pn: undefined }]
    };

    const result = await resolveLidToPhone(client, '256740377493618@lid');

    assert.strictEqual(result, '256740377493618@lid');
});

test('conserva el @lid original si la consulta devuelve vacío', async () => {
    const client = { getContactLidAndPhone: async () => [] };

    const result = await resolveLidToPhone(client, '256740377493618@lid');

    assert.strictEqual(result, '256740377493618@lid');
});

test('conserva el @lid original si el cliente lanza error', async () => {
    const client = {
        getContactLidAndPhone: async () => { throw new Error('r: r'); }
    };

    const result = await resolveLidToPhone(client, '256740377493618@lid');

    assert.strictEqual(result, '256740377493618@lid');
});

test('conserva el @lid original si la versión fijada de WhatsApp Web no expone el método', async () => {
    const client = {};

    const result = await resolveLidToPhone(client, '256740377493618@lid');

    assert.strictEqual(result, '256740377493618@lid');
});
