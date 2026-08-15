import * as store from '../store.js';
import { sha256, lockNow } from '../gate.js';
import { el, panel, esc, toast } from '../ui/dom.js';

const THEMES = [
  ['glass',      'Glass Cockpit',     'Bright cabin, dark luminous instruments. The literal modern flight deck.'],
  ['daylight',   'Daylight Deck',     'Cool near-white with crisp white cards and vivid accents.'],
  ['cabin',      'Cabin',             'Bone white and warm greys — a Dreamliner interior.'],
  ['horizon',    'Horizon',           'Pale sky wash behind bright white panels.'],
  ['instrument', 'Instrument White',  'Pure white, hairlines, black type. Swiss and precise.'],
];

const DAY = 86400000;

export function settingsView(mount, ctx) {
  const { state } = ctx;

  // ── theme ─────────────────────────────────────────────────
  const th = panel('Cabin lighting', 'theme');
  for (const [id, name, note] of THEMES) {
    const r = el('button', 'node');
    r.dataset.state = state.get('settings').theme === id ? 'fresh' : 'untouched';
    r.style.setProperty('--c', 'var(--accent)');
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(id.slice(0, 4).toUpperCase())}</span>
      <span class="node-title"><b>${esc(name)}</b> — <span
        style="color:var(--panel-dim)">${esc(note)}</span></span>`;
    r.onclick = () => {
      state.update('settings', s => { s.theme = id; });
      document.documentElement.dataset.theme = id;
      toast(`${name} applied`);
      settingsRedraw(mount, ctx);
    };
    th.append(r);
  }

  // ── backup ────────────────────────────────────────────────
  const bk = panel('Backup and restore', 'your data never leaves the browser');
  const last = state.get('settings').backupLastAt;
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / DAY) : null;
  bk.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
    ${last ? `Last exported ${days} day${days === 1 ? '' : 's'} ago.`
           : 'You have never exported. Everything lives in this browser only — clear it and it is gone.'}
    </p>`);

  const bkRow = el('div', 'row');
  const exp = el('button', 'chip chip-primary', 'Export JSON');
  exp.onclick = () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ib-cockpit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    state.update('settings', s => { s.backupLastAt = new Date().toISOString(); });
    toast('Backup downloaded');
  };

  const file = el('input');
  file.type = 'file';
  file.accept = 'application/json';
  file.className = 'chip field';
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    const res = store.importAll(await f.text());
    if (!res.ok) { toast(esc(res.error)); return; }
    toast('Restored — reloading');
    setTimeout(() => location.reload(), 700);
  };

  bkRow.append(exp, file);
  bk.append(bkRow);

  // ── passcode ──────────────────────────────────────────────
  const pc = panel('Passcode', 'cosmetic by design');
  pc.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
    A lock screen for anyone who finds the URL. Be clear-eyed about it: this is
    <b>client-side and therefore cosmetic</b> — it hides the interface, it does not encrypt
    anything. It is enough here only because your study data lives in your browser, so a
    public repo exposes an empty shell.</p>`);

  const pcRow = el('div', 'row');
  const pin = el('input', 'chip field');
  pin.type = 'password';
  pin.placeholder = state.get('settings').passHash ? 'Set a new passcode' : 'Set a passcode';
  const setPin = el('button', 'chip', 'Set');
  setPin.onclick = async () => {
    const v = pin.value.trim();
    if (!v) return;
    const h = await sha256(v);
    state.update('settings', s => { s.passHash = h; });
    pin.value = '';
    lockNow();
    toast('Passcode set — it applies on next load');
    settingsRedraw(mount, ctx);
  };
  const clearPin = el('button', 'chip', 'Remove');
  clearPin.onclick = () => {
    state.update('settings', s => { s.passHash = null; });
    toast('Passcode removed');
    settingsRedraw(mount, ctx);
  };
  pcRow.append(pin, setPin, clearPin);
  pc.append(pcRow);

  // ── danger ────────────────────────────────────────────────
  const dz = panel('Reset', 'irreversible');
  const wipe = el('button', 'chip', 'Erase everything');
  wipe.style.borderColor = 'var(--bad)';
  wipe.style.color = 'var(--bad)';
  let armed = false;
  wipe.onclick = () => {
    if (!armed) {
      armed = true;
      wipe.textContent = 'Click again to confirm — this cannot be undone';
      setTimeout(() => { armed = false; wipe.textContent = 'Erase everything'; }, 5000);
      return;
    }
    for (const k of ['meta', 'mastery', 'sessions', 'notes', 'deadlines', 'grades',
                     'quests', 'xp', 'crew', 'settings']) store.remove(k);
    location.reload();
  };
  dz.insertAdjacentHTML('beforeend',
    '<p class="mfd-sub">Export first. This wipes every session, capture, score and note.</p>');
  dz.append(wipe);

  const hd = panel('Head-up display', 'HUD key');
  hd.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
    What is projected on the glass now lives on its own control — press
    <b>HUD</b> on the panel to choose readouts and add your own lines.</p>`);

  mount.append(hd, th, bk, pc, dz);
}

function settingsRedraw(mount, ctx) {
  mount.innerHTML = '';
  settingsView(mount, ctx);
}

