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
      `<div><input type="radio" name="date" id="d${i}" value="${d.id}" required><label for="d${i}"><span>${d.label.split(', ')[0]}</span><b>${d.label.split(', ')[1]}</b><small id="t${i}"></small></label></div>`).join('');
  }
  state.dates.forEach((d, i) => { $('t' + i).textContent = `${state.tally[d.id]} going`; });
  renderJoinCard(); if (typeof renderLateBtn === 'function') renderLateBtn();
  $('drawStatus').textContent = state.drawn
    ? 'Names have been drawn! Enter your code to see who you got.'
    : 'Names haven’t been drawn yet — check back once everyone has joined.';
}

let myCode = null;   // set once this phone has joined (or loaded an entry)

function showMyCode(code) {
  $('myCode').textContent = code; $('code').value = code;
  $('codeCard').classList.remove('hide');
}
// One place that decides what the join / edit card looks like.
function renderJoinCard() {
  if (!state) return;
  const drawn = state.drawn, editing = !!myCode;
  const lockCore = drawn && editing;               // after the draw: only wish list + notes are editable
  $('name').disabled = lockCore;
  document.querySelectorAll('input[name=date]').forEach(r => { r.disabled = lockCore; });
  const lateDoor = drawn && !editing && state.lateOpen;
  $('joinForm').classList.toggle('hide', drawn && !editing && !lateDoor);
  $('joinCard').classList.remove('hide');
  $('haveCode').classList.toggle('hide', editing);
  if (drawn && editing) {
    $('joinTitle').textContent = 'Update your wish list';
    $('welcomeBack').textContent = 'Names are drawn! You can still change your wish list and notes — whoever drew you will see the update when they check their match.';
    $('welcomeBack').classList.remove('hide');
  } else if (lateDoor) {
    $('joinTitle').textContent = 'Join the fun';
    $('welcomeBack').classList.add('hide');
  } else if (drawn) {
    $('joinTitle').textContent = 'Already joined?';
    $('welcomeBack').textContent = 'Names have been drawn, so no new players can join. If you’re in, load your entry to update your wish list.';
    $('welcomeBack').classList.remove('hide');
  } else if (editing) {
    $('joinTitle').textContent = 'Edit your entry';
    $('welcomeBack').textContent = `Welcome back, ${$('name').value.trim()}! Change anything below until names are drawn.`;
    $('welcomeBack').classList.remove('hide');
  } else {
    $('joinTitle').textContent = 'Join the fun';
    $('welcomeBack').classList.add('hide');
  }
  $('joinBtn').textContent = editing ? 'Save changes' : 'Join Secret Santa';
}

// Switch the join card into "edit my entry" mode and fill it in.
function enterEditMode(entry, code) {
  myCode = code; store.set('santaCode', code);
  $('name').value = entry.name; $('wishlist').value = entry.wishlist; $('pnotes').value = entry.notes;
  const radio = document.querySelector(`input[name=date][value="${entry.date}"]`);
  if (radio) radio.checked = true;
  showMyCode(code);
  renderJoinCard();
}
function leaveEditMode() {
  myCode = null; store.set('santaCode', '');
  $('codeCard').classList.add('hide');
  renderJoinCard();
}

$('joinForm').onsubmit = async e => {
  e.preventDefault();
  $('joinMsg').textContent = ''; $('joinMsg').className = 'msg';
  const entry = {
    name: $('name').value, wishlist: $('wishlist').value, notes: $('pnotes').value,
    date: document.querySelector('input[name=date]:checked')?.value,
  };
  try {
    if (myCode) {
      await api('update', { code: myCode, ...entry });
      $('joinMsg').textContent = 'Saved ✓'; renderJoinCard();
    } else {
      const { code } = await api('join', entry);
      enterEditMode({ ...entry, name: entry.name.trim() }, code);
      $('joinMsg').textContent = 'You’re in! Your code is below.';
      $('codeCard').scrollIntoView({ behavior: 'smooth' });
    }
    refresh();
  } catch (err) {
    if (myCode && /not found/i.test(err.message)) { leaveEditMode(); refresh(); err = new Error('The organizer reset the game, so please join again.'); }
    $('joinMsg').textContent = err.message; $('joinMsg').className = 'msg err';
  }
};

// Load an entry by code (another phone, or cleared browser data).
async function loadEntry(code, quiet) {
  try {
    const r = await api('lookup', { code });
    enterEditMode(r.entry, r.code);
  } catch (err) {
    if (quiet) { if (/not found/i.test(err.message)) store.set('santaCode', ''); }
    else { $('loadMsg').textContent = err.message; }
  }
}
$('haveBtn').onclick = () => {
  const open = $('loadPanel').classList.toggle('hide') === false;
  $('haveBtn').setAttribute('aria-expanded', open);
  if (open) $('loadCode').focus();
};
$('loadBtn').onclick = () => { $('loadMsg').textContent = ''; loadEntry($('loadCode').value.trim().toUpperCase(), false); };

$('revealForm').onsubmit = async e => {
  e.preventDefault(); $('revealMsg').textContent = ''; $('result').classList.add('hide');
  try {
    const r = await api('reveal', { code: $('code').value });
    const label = Object.fromEntries(state.dates.map(d => [d.id, d.label]));
    $('result').innerHTML = `<p>Hi ${esc(r.name)}! You're Secret Santa for:</p>
      <h2 style="font-size:1.6rem">🎁 ${esc(r.match.name)}</h2>
      <strong>Wish list</strong><pre>${esc(r.match.wishlist)}</pre>
      ${r.match.notes ? `<strong>Their notes</strong><pre>${esc(r.match.notes)}</pre>` : ''}
      <p>Your meet-up date: <strong>${label[r.date]}</strong></p>
      ${r.rematched ? '<p class="note">👋 Heads up: your match was updated. This is your final match — please use this one!</p>' : ''}`;
    $('result').classList.remove('hide');
  } catch (err) { $('revealMsg').textContent = err.message; }
};

let adminPin = '';
async function admin(action, extra = {}, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  $('adminMsg').className = 'msg';
  try { await api('admin/' + action, { pin: adminPin, ...extra });
        $('adminMsg').textContent = 'Done ✓'; refresh(); return true; }
  catch (err) { $('adminMsg').textContent = err.message; $('adminMsg').className = 'msg err'; return false; }
}
function setUnlocked(on) {
  $('orgTools').classList.toggle('hide', !on);
  $('unlockForm').classList.toggle('hide', on);
  if (!on) { adminPin = ''; $('pin').value = ''; $('newNotes').value = ''; $('codesList').innerHTML = ''; $('codesList').classList.add('hide'); $('keepList').textContent = ''; }
}
$('orgLink').onclick = () => {
  $('orgLinkWrap').classList.add('hide'); $('orgCard').classList.remove('hide');
  $('pin').focus(); $('orgCard').scrollIntoView({ behavior: 'smooth' });
};
$('unlockForm').onsubmit = async e => {
  e.preventDefault(); adminPin = $('pin').value;
  if (await admin('check')) { setUnlocked(true); renderLateBtn(); loadKeep(); $('newNotes').value = state.notes; $('adminMsg').textContent = ''; }
  else adminPin = '';
};
$('lockBtn').onclick = () => { setUnlocked(false); $('adminMsg').textContent = ''; $('orgCard').classList.add('hide'); $('orgLinkWrap').classList.remove('hide'); };
$('codesBtn').onclick = async () => {
  try {
    const { people } = await api('admin/codes', { pin: adminPin });
    $('codesList').innerHTML = people.length
      ? people.map(p => `<li><span>${esc(p.name)}</span><b>${esc(p.code)}</b></li>`).join('')
      : '<li>No one has joined yet.</li>';
    $('codesList').classList.remove('hide'); $('adminMsg').textContent = '';
  } catch (err) { $('adminMsg').textContent = err.message; $('adminMsg').className = 'msg err'; }
};
async function loadKeep() {
  if (!adminPin || !state?.drawn) return;
  try {
    const { people } = await api('admin/people', { pin: adminPin });
    const box = $('keepList'); box.textContent = '';
    people.forEach(p => {
      const label = document.createElement('label'), cb = document.createElement('input'), span = document.createElement('span');
      cb.type = 'checkbox'; cb.value = p.name; cb.checked = p.keep_match; span.textContent = p.name;
      label.append(cb, span); box.append(label);
    });
  } catch (err) { $('adminMsg').textContent = err.message; $('adminMsg').className = 'msg err'; }
}
$('keepList').onchange = async e => {
  const names = [...$('keepList').querySelectorAll('input:checked')].map(i => i.value);
  const ok = await admin('protect', { names });
  if (ok) $('adminMsg').textContent = `${names.length} marked as already bought ✓`;
  else { e.target.checked = !e.target.checked; }   // roll back the tick the server refused
};
function renderLateBtn() {
  const open = !!state?.lateOpen;
  $('lateBtn').classList.toggle('hide', !state?.drawn);
  $('keepBox').classList.toggle('hide', !state?.drawn || !adminPin);
  $('lateBtn').textContent = open ? '🚪 Late signup is OPEN — tap to close' : '🚪 Allow one late player';
}
$('lateBtn').onclick = async () => {
  const open = !state.lateOpen;
  if (open && !confirm('Open ONE spot for a late player? They’ll be slipped into the circle, and one random person’s match will change. It closes by itself after they join.')) return;
  if (await admin('late', { open })) {
    $('adminMsg').textContent = open ? 'Open for one late player. Share the link — it closes automatically after they join. Then ask everyone to re-check their match.' : 'Late signup closed.';
  }
};
$('saveNotes').onclick = () => admin('notes', { notes: $('newNotes').value });
$('drawBtn').onclick = () => admin('draw', {}, 'Draw names now? No one can join afterward.');
$('resetBtn').onclick = () => admin('reset', {}, 'Delete all participants and start over?');

const saved = store.get('santaCode');
refresh().then(() => { if (saved) { $('code').value = saved; loadEntry(saved, true); } });
setInterval(refresh, 15000);
