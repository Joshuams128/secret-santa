// Exercises the handler with a mocked Supabase REST API.
const assert = require('assert');
process.env.SUPABASE_URL = 'http://sb.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.ADMIN_PIN = '1234';
const calls = [];
let reply = () => [200, null];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  const [status, data] = reply(url, opts);
  return { ok: status < 300, status, text: async () => (data === null ? '' : JSON.stringify(data)) };
};
const { handle } = require('./lib/handler');
(async () => {
  assert.deepStrictEqual((await handle('POST', 'admin/draw', { pin: 'nope' }))[0], 403);
  assert.deepStrictEqual((await handle('POST', 'admin/draw', {}))[0], 403);
  assert.strictEqual(calls.length, 0, 'bad PIN never reaches the DB');

  reply = () => [400, { message: 'TOO_FEW' }];
  assert.strictEqual((await handle('POST', 'admin/draw', { pin: '1234' }))[0], 400);
  reply = () => [400, { message: 'DRAWN' }];
  assert.strictEqual((await handle('POST', 'admin/draw', { pin: '1234' }))[0], 409);

  assert.strictEqual((await handle('POST', 'join', { name: '', wishlist: 'x', date: '2026-12-04' }))[0], 400);
  assert.strictEqual((await handle('POST', 'join', { name: 'A', wishlist: 'x', date: '2026-12-25' }))[0], 400);
  reply = () => [409, { code: '23505', message: 'duplicate key value violates unique constraint "ss_participants_name_key"' }];
  assert.strictEqual((await handle('POST', 'join', { name: 'A', wishlist: 'x', date: '2026-12-04' }))[0], 409);
  reply = () => [200, null];
  const j = await handle('POST', 'join', { name: 'A', wishlist: 'x', date: '2026-12-04' });
  assert.ok(/^[0-9A-F]{6}$/.test(j[1].code));

  reply = url => url.includes('ss_settings') ? [200, [{ notes: 'n', drawn: false }]] : [200, [{ name: 'A', date: '2026-12-11' }]];
  const s = await handle('GET', 'state');
  assert.strictEqual(s[1].tally['2026-12-11'], 1); assert.ok(!('wishlist' in s[1].participants[0]));

  reply = url => url.includes('ss_settings') ? [200, [{ drawn: true }]] : [200, []];
  assert.strictEqual((await handle('POST', 'reveal', { code: "1' or '1" }))[0], 404);
  console.log('handler OK');
})().catch(e => { console.error(e); process.exit(1); });
