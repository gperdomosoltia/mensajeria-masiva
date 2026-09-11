const test = require('node:test');
const assert = require('node:assert');
const { requireApiKey, safeEqual } = require('./requireApiKey');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}
function fakeReq(key) {
  return { header: (name) => (name.toLowerCase() === 'x-api-key' ? key : undefined) };
}

test('safeEqual es falso con longitudes distintas', () => {
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('abc', 'abc'), true);
});

test('sin BOT_API_KEY deja pasar la request', () => {
  delete process.env.BOT_API_KEY;
  let llamado = false;
  requireApiKey(fakeReq(undefined), fakeRes(), () => { llamado = true; });
  assert.equal(llamado, true);
});

test('con BOT_API_KEY rechaza la key incorrecta', () => {
  process.env.BOT_API_KEY = 'secreto';
  const res = fakeRes();
  let llamado = false;
  requireApiKey(fakeReq('otra'), res, () => { llamado = true; });
  assert.equal(llamado, false);
  assert.equal(res.statusCode, 401);
  delete process.env.BOT_API_KEY;
});

test('con BOT_API_KEY acepta la key correcta', () => {
  process.env.BOT_API_KEY = 'secreto';
  let llamado = false;
  requireApiKey(fakeReq('secreto'), fakeRes(), () => { llamado = true; });
  assert.equal(llamado, true);
  delete process.env.BOT_API_KEY;
});
