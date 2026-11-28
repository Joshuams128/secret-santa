// Secret Santa API. Talks to Supabase's REST API with the service-role key (server-side only).
const crypto = require('crypto');

const DATES = [
  { id: '2026-12-04', label: 'Fri, Dec 4' },
  { id: '2026-12-11', label: 'Fri, Dec 11' },
  { id: '2026-12-13', label: 'Sun, Dec 13' },
];

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer && { Prefer: prefer }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) { const e = new Error(data?.message || 'Database error'); e.db = data; throw e; }
  return data;
}

const clean = (v, n) => String(v ?? '').trim().slice(0, n);
const pinOk = pin => {
  const expected = process.env.ADMIN_PIN;
  if (!expected) throw new Error('ADMIN_PIN is not set');
  const a = crypto.createHash('sha256').update(String(pin ?? '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
};

function validateEntry(b) {
  const name = clean(b.name, 40), wishlist = clean(b.wishlist, 1000), notes = clean(b.notes, 500);
  if (!name) throw new HttpError(400, 'Please enter your name.');
  if (!wishlist) throw new HttpError(400, 'Please add a few wish list ideas.');
  if (!DATES.some(d => d.id === b.date)) throw new HttpError(400, 'Please pick a meet-up date.');
  return { name, wishlist, notes, date: b.date };
}
const validCode = v => { const c = clean(v, 10).toUpperCase(); return /^[0-9A-F]{6}$/.test(c) ? c : null; };
const dupName = e => e.db?.code === '23505' && /name_key/.test(e.db.message);

const routes = {
  async 'GET state'() {
    const [[settings], people] = await Promise.all([
      sb('ss_settings?select=notes,drawn,late_open&id=eq.1'),
      sb('ss_participants?select=name,date&order=created_at'),
    ]);
    const tally = Object.fromEntries(DATES.map(d => [d.id, 0]));
    people.forEach(p => { if (p.date in tally) tally[p.date]++; });
    return { dates: DATES, tally, drawn: settings.drawn, lateOpen: settings.late_open, notes: settings.notes, participants: people };
  },

  async 'POST join'(b) {
    const e = validateEntry(b);
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    try {
      await sb('rpc/ss_join', { method: 'POST', body: { p_name: e.name, p_wishlist: e.wishlist, p_notes: e.notes, p_date: e.date, p_code: code } });
    } catch (err) {
      if (/DRAWN/.test(err.message)) throw new HttpError(409, 'Names have already been drawn.');
      if (/NO_ELIGIBLE/.test(err.message)) throw new HttpError(409, 'Sorry, late signup isn’t available right now. Ask the organizer.');
      if (dupName(err)) throw new HttpError(409, 'Someone with that name already joined.');
      throw err;
    }
    return { code };
  },

  // Load an existing entry by personal code (used for "welcome back" / edit).
  async 'POST lookup'(b) {
    const code = validCode(b.code);
    if (!code) throw new HttpError(404, 'Code not found.');
    const [[entry], [{ drawn }]] = await Promise.all([
      sb(`ss_participants?select=name,wishlist,notes,date&code=eq.${code}`).then(r => [r[0]]),
      sb('ss_settings?select=drawn&id=eq.1'),
    ]);
    if (!entry) throw new HttpError(404, 'Code not found.');
    return { entry, drawn, code };
  },

  async 'POST update'(b) {
    const code = validCode(b.code);
    if (!code) throw new HttpError(404, 'Code not found.');
    const e = validateEntry(b);
    try {
      await sb('rpc/ss_update', { method: 'POST', body: { p_code: code, p_name: e.name, p_wishlist: e.wishlist, p_notes: e.notes, p_date: e.date } });
    } catch (err) {
      if (/DRAWN/.test(err.message)) throw new HttpError(409, 'Names have been drawn, so entries are locked.');
      if (/NOT_FOUND/.test(err.message)) throw new HttpError(404, 'Code not found.');
      if (dupName(err)) throw new HttpError(409, 'Someone with that name already joined.');
      throw err;
    }
    return { ok: true };
  },

  async 'POST reveal'(b) {
    const [{ drawn }] = await sb('ss_settings?select=drawn&id=eq.1');
    if (!drawn) throw new HttpError(409, 'Names haven’t been drawn yet. Check back soon!');
    const code = validCode(b.code);
    if (!code) throw new HttpError(404, 'Code not found.');
    const [me] = await sb(`ss_participants?select=name,date,give_to,rematched&code=eq.${code}`);
    if (!me?.give_to) throw new HttpError(404, 'Code not found.');
    const [t] = await sb(`ss_participants?select=name,wishlist,notes&id=eq.${me.give_to}`);
    return { name: me.name, match: t, date: me.date, rematched: me.rematched };
  },

  async 'POST admin/notes'(b) {
    await sb('ss_settings?id=eq.1', { method: 'PATCH', body: { notes: clean(b.notes, 500) } });
    return { ok: true };
  },
  async 'POST admin/draw'() {
    try { await sb('rpc/ss_draw', { method: 'POST', body: {} }); }
    catch (e) {
      if (/DRAWN/.test(e.message)) throw new HttpError(409, 'Already drawn.');
      if (/TOO_FEW/.test(e.message)) throw new HttpError(400, 'Need at least 3 people to draw.');
      throw e;
    }
    return { ok: true };
  },
  async 'POST admin/reset'() { await sb('rpc/ss_reset', { method: 'POST', body: {} }); return { ok: true }; },
  // Names + codes only. Never returns who is matched with whom.
  async 'POST admin/codes'() { return { people: await sb('ss_participants?select=name,code&order=name') }; },
  // Open/close the one-use door for a late player (only after the draw).
  async 'POST admin/late'(b) {
    try { await sb('rpc/ss_set_late', { method: 'POST', body: { p_open: b.open === true } }); }
    catch (e) {
      if (/NOT_DRAWN/.test(e.message)) throw new HttpError(409, 'Draw names first — before that, anyone can just join.');
      if (/NO_ELIGIBLE/.test(e.message)) throw new HttpError(409, 'Everyone is marked as having bought a gift, so there’s nobody to place the newcomer after. Untick at least one person.');
      throw e;
    }
    return { ok: true };
  },
  // Names + whether each person is marked "already bought a gift" (never returns matches).
  async 'POST admin/people'() { return { people: await sb('ss_participants?select=name,keep_match&order=name') }; },
  // Set exactly which people are protected from being re-matched by a late join.
  async 'POST admin/protect'(b) {
    const names = (Array.isArray(b.names) ? b.names : []).slice(0, 200).map(n => clean(n, 40));
    try { await sb('rpc/ss_set_keep', { method: 'POST', body: { p_names: names } }); }
    catch (e) {
      if (/NO_ELIGIBLE/.test(e.message)) throw new HttpError(409, 'At least one person must stay unticked so the newcomer can be placed.');
      throw e;
    }
    return { ok: true };
  },
  async 'POST admin/check'() { return { ok: true }; },
};

async function handle(method, route, body) {
  const fn = routes[`${method} ${route}`];
  if (!fn) return [404, { error: 'Not found' }];
  try {
    if (route.startsWith('admin/') && !pinOk(body?.pin)) return [403, { error: 'Wrong organizer PIN.' }];
    return [200, await fn(body || {})];
  } catch (e) {
    if (e instanceof HttpError) return [e.code, { error: e.message }];
    console.error(e);
    return [500, { error: 'Server error' }];
  }
}

module.exports = { handle, DATES };
