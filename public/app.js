const $ = id => document.getElementById(id);
const api = (path, body) => fetch('/api/' + path, body
  ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; });
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let state;

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function refresh() {
  state = await api('state');
  $('notes').textContent = state.notes;
  $('count').textContent = state.participants.length;
  $('empty').classList.toggle('hide', state.participants.length > 0);
  const label = Object.fromEntries(state.dates.map(d => [d.id, d.label]));
  $('people').innerHTML = state.participants.map(p => `<li>${esc(p.name)} <small>— ${label[p.date]}</small></li>`).join('');
  if (!$('dates').children.length) {
    $('dates').innerHTML = state.dates.map((d, i) =>
      `<div><input type="radio" name="date" id="d${i}" value="${d.id}" required><label for="d${i}">${d.label}<small id="t${i}"></small></label></div>`).join('');
  }
  state.dates.forEach((d, i) => { $('t' + i).textContent = `${state.tally[d.id]} going`; });
  $('joinCard').classList.toggle('hide', state.drawn);
  $('drawStatus').textContent = state.drawn
    ? 'Names have been drawn! Enter your code to see who you got.'
    : 'Names haven’t been drawn yet — check back once everyone has joined.';
}

$('joinForm').onsubmit = async e => {
  e.preventDefault();
  $('joinMsg').textContent = ''; $('joinMsg').className = 'msg';
  try {
    const { code } = await api('join', {
      name: $('name').value, wishlist: $('wishlist').value, notes: $('pnotes').value,
      date: document.querySelector('input[name=date]:checked')?.value,
    });
    store.set('santaCode', code);
    $('myCode').textContent = code; $('code').value = code;
    $('codeCard').classList.remove('hide'); $('joinCard').classList.add('hide');
    $('codeCard').scrollIntoView({ behavior: 'smooth' });
    refresh();
  } catch (err) { $('joinMsg').textContent = err.message; $('joinMsg').className = 'msg err'; }
};

$('revealForm').onsubmit = async e => {
  e.preventDefault(); $('revealMsg').textContent = ''; $('result').classList.add('hide');
  try {
    const r = await api('reveal', { code: $('code').value });
    const label = Object.fromEntries(state.dates.map(d => [d.id, d.label]));
    $('result').innerHTML = `<p>Hi ${esc(r.name)}! You're Secret Santa for:</p>
      <h2 style="font-size:1.6rem">🎁 ${esc(r.match.name)}</h2>
      <strong>Wish list</strong><pre>${esc(r.match.wishlist)}</pre>
      ${r.match.notes ? `<strong>Their notes</strong><pre>${esc(r.match.notes)}</pre>` : ''}
      <p>Your meet-up date: <strong>${label[r.date]}</strong></p>`;
    $('result').classList.remove('hide');
  } catch (err) { $('revealMsg').textContent = err.message; }
};

async function admin(action, extra = {}, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  $('adminMsg').className = 'msg';
  try { await api('admin/' + action, { pin: $('pin').value, ...extra });
        $('adminMsg').textContent = 'Done ✓'; refresh(); }
  catch (err) { $('adminMsg').textContent = err.message; $('adminMsg').className = 'msg err'; }
}
$('saveNotes').onclick = () => admin('notes', { notes: $('newNotes').value });
$('drawBtn').onclick = () => admin('draw', {}, 'Draw names now? No one can join afterward.');
$('resetBtn').onclick = () => admin('reset', {}, 'Delete all participants and start over?');

const saved = store.get('santaCode');
if (saved) $('code').value = saved;
refresh();
setInterval(refresh, 15000);
