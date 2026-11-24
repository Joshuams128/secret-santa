// Secret Santa server — zero dependencies. Run: ADMIN_PIN=1234 node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const ADMIN_PIN = process.env.ADMIN_PIN || String(crypto.randomInt(1000, 9999));
const DATES = [
  { id: '2026-12-04', label: 'Fri, Dec 4' },
  { id: '2026-12-11', label: 'Fri, Dec 11' },
  { id: '2026-12-13', label: 'Sun, Dec 13' },
];

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { participants: [], drawn: false, notes: 'Budget: TBD — the organizer will update this.' }; }
}
function save(s) { fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2)); }
let state = load();

// Random cycle: shuffle, then each person gives to the next. Nobody gets themselves.
function draw(participants) {
  const a = participants.map(p => p.id);
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  const map = {};
  a.forEach((id, i) => { map[id] = a[(i + 1) % a.length]; });
  participants.forEach(p => { p.giveTo = map[p.id]; });
}

function publicState() {
  const tally = Object.fromEntries(DATES.map(d => [d.id, 0]));
  state.participants.forEach(p => { if (tally[p.date] !== undefined) tally[p.date]++; });
  return {
    dates: DATES, tally, drawn: state.drawn, notes: state.notes,
    participants: state.participants.map(p => ({ name: p.name, date: p.date })),
  };
}

const clean = (v, n) => String(v || '').trim().slice(0, n);
const pinOk = pin => {
  const a = Buffer.from(String(pin || '')), b = Buffer.from(ADMIN_PIN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function handle(req, res, body) {
  const url = req.url.split('?')[0];
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'GET' && url === '/api/state') return send(200, publicState());

  if (req.method === 'POST' && url === '/api/join') {
    if (state.drawn) return send(409, { error: 'Names have already been drawn.' });
    const name = clean(body.name, 40), wishlist = clean(body.wishlist, 1000), notes = clean(body.notes, 500);
    if (!name) return send(400, { error: 'Please enter your name.' });
    if (!wishlist) return send(400, { error: 'Please add a few wish list ideas.' });
    if (!DATES.some(d => d.id === body.date)) return send(400, { error: 'Please pick a meet-up date.' });
    if (state.participants.some(p => p.name.toLowerCase() === name.toLowerCase()))
      return send(409, { error: 'Someone with that name already joined.' });
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    state.participants.push({ id: crypto.randomUUID(), code, name, wishlist, notes, date: body.date });
    save(state);
    return send(200, { code });
  }

  if (req.method === 'POST' && url === '/api/reveal') {
    if (!state.drawn) return send(409, { error: 'Names haven’t been drawn yet. Check back soon!' });
    const code = clean(body.code, 10).toUpperCase();
    const me = state.participants.find(p => p.code === code);
    if (!me) return send(404, { error: 'Code not found.' });
    const t = state.participants.find(p => p.id === me.giveTo);
    return send(200, { name: me.name, match: { name: t.name, wishlist: t.wishlist, notes: t.notes }, date: me.date });
  }

  if (req.method === 'POST' && url.startsWith('/api/admin/')) {
    if (!pinOk(body.pin)) return send(403, { error: 'Wrong organizer PIN.' });
    const action = url.slice('/api/admin/'.length);
    if (action === 'check') return send(200, { ok: true });
    if (action === 'notes') { state.notes = clean(body.notes, 500); save(state); return send(200, { ok: true }); }
    if (action === 'draw') {
      if (state.drawn) return send(409, { error: 'Already drawn.' });
      if (state.participants.length < 3) return send(400, { error: 'Need at least 3 people to draw.' });
      draw(state.participants); state.drawn = true; save(state); return send(200, { ok: true });
    }
    if (action === 'reset') { state = { participants: [], drawn: false, notes: state.notes }; save(state); return send(200, { ok: true }); }
  }
  send(404, { error: 'Not found' });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 20000) req.destroy(); });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400); return res.end('{"error":"Bad JSON"}'); }
      try { handle(req, res, body); } catch (e) { console.error(e); res.writeHead(500); res.end('{"error":"Server error"}'); }
    });
    return;
  }
  const file = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  const full = path.join(__dirname, 'public', path.normalize(file));
  if (!full.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Secret Santa running on http://localhost:${PORT}`);
    if (!process.env.ADMIN_PIN) console.log(`Organizer PIN (set ADMIN_PIN to choose your own): ${ADMIN_PIN}`);
  });
}
module.exports = { server, draw };
