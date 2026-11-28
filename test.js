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
  reply = () => [200, [{ name: 'A', code: 'AAAAAA' }]];
  assert.strictEqual((await handle('POST', 'admin/codes', { pin: 'bad' }))[0], 403);
  const c = await handle('POST', 'admin/codes', { pin: '1234' });
  assert.deepStrictEqual(c[1], { people: [{ name: 'A', code: 'AAAAAA' }] });
  assert.ok(calls.at(-1).url.includes('select=name,code') && !calls.at(-1).url.includes('give_to'), 'codes query never selects matches');
  // --- lookup / update
  reply = url => url.includes('ss_settings') ? [200, [{ drawn: false }]] : [200, [{ name: 'A', wishlist: 'w', notes: '', date: '2026-12-04' }]];
  const L = await handle('POST', 'lookup', { code: 'a1b2c3' });
  assert.strictEqual(L[0], 200); assert.strictEqual(L[1].entry.name, 'A'); assert.strictEqual(L[1].code, 'A1B2C3');
  assert.strictEqual((await handle('POST', 'lookup', { code: "1' or '1" }))[0], 404);
  reply = url => url.includes('ss_settings') ? [200, [{ drawn: false }]] : [200, []];
  assert.strictEqual((await handle('POST', 'lookup', { code: 'ABCDEF' }))[0], 404);

  reply = () => [200, null];
  assert.strictEqual((await handle('POST', 'update', { code: 'A1B2C3', name: 'A2', wishlist: 'x', date: '2026-12-11' }))[0], 200);
  const upd = JSON.parse(calls.at(-1).opts.body); assert.strictEqual(upd.p_code, 'A1B2C3'); assert.strictEqual(upd.p_name, 'A2');
  assert.strictEqual((await handle('POST', 'update', { code: 'bad', name: 'A', wishlist: 'x', date: '2026-12-11' }))[0], 404);
  assert.strictEqual((await handle('POST', 'update', { code: 'A1B2C3', name: '', wishlist: 'x', date: '2026-12-11' }))[0], 400);
  reply = () => [400, { message: 'DRAWN' }];
  assert.strictEqual((await handle('POST', 'update', { code: 'A1B2C3', name: 'A', wishlist: 'x', date: '2026-12-11' }))[0], 409);
  reply = () => [400, { message: 'NOT_FOUND' }];
  assert.strictEqual((await handle('POST', 'update', { code: 'A1B2C3', name: 'A', wishlist: 'x', date: '2026-12-11' }))[0], 404);
  reply = () => [409, { code: '23505', message: 'duplicate key ... "ss_participants_name_key"' }];
  assert.strictEqual((await handle('POST', 'update', { code: 'A1B2C3', name: 'B', wishlist: 'x', date: '2026-12-11' }))[0], 409);
  // --- late door
  reply = () => [200, null];
  assert.strictEqual((await handle('POST', 'admin/late', { open: true }))[0], 403);
  assert.strictEqual((await handle('POST', 'admin/late', { pin: '1234', open: true }))[0], 200);
  assert.strictEqual(JSON.parse(calls.at(-1).opts.body).p_open, true);
  await handle('POST', 'admin/late', { pin: '1234' });                     // missing flag must CLOSE, never open
  assert.strictEqual(JSON.parse(calls.at(-1).opts.body).p_open, false);
  reply = () => [400, { message: 'NOT_DRAWN' }];
  assert.strictEqual((await handle('POST', 'admin/late', { pin: '1234', open: true }))[0], 409);
  reply = url => url.includes('ss_settings') ? [200, [{ notes: 'n', drawn: true, late_open: true }]] : [200, []];
  assert.strictEqual((await handle('GET', 'state'))[1].lateOpen, true);
  reply = url => url.includes('ss_settings') ? [200, [{ drawn: true }]] : url.includes('code=eq') ? [200, [{ name: 'A', date: '2026-12-13', give_to: 'x', rematched: true }]] : [200, [{ name: 'B', wishlist: 'w', notes: '' }]];
  assert.strictEqual((await handle('POST', 'reveal', { code: 'A1B2C3' }))[1].rematched, true);
  // --- protect people who already bought
  reply = () => [200, null];
  assert.strictEqual((await handle('POST', 'admin/protect', { names: ['A'] }))[0], 403);
  assert.strictEqual((await handle('POST', 'admin/protect', { pin: '1234', names: ['Amy', 'bob'] }))[0], 200);
  assert.deepStrictEqual(JSON.parse(calls.at(-1).opts.body), { p_names: ['Amy', 'bob'] });
  await handle('POST', 'admin/protect', { pin: '1234', names: 'not-an-array' });          // junk input = protect nobody
  assert.deepStrictEqual(JSON.parse(calls.at(-1).opts.body), { p_names: [] });
  reply = () => [400, { message: 'NO_ELIGIBLE' }];
  assert.strictEqual((await handle('POST', 'admin/protect', { pin: '1234', names: ['A'] }))[0], 409);
  assert.strictEqual((await handle('POST', 'admin/late', { pin: '1234', open: true }))[0], 409);
  reply = () => [200, [{ name: 'Amy', keep_match: true }]];
  assert.strictEqual((await handle('POST', 'admin/people', {}))[0], 403);
  assert.deepStrictEqual((await handle('POST', 'admin/people', { pin: '1234' }))[1], { people: [{ name: 'Amy', keep_match: true }] });
  assert.ok(!calls.at(-1).url.includes('give_to'), 'people list never selects matches');
  console.log('handler OK');
})().catch(e => { console.error(e); process.exit(1); });
