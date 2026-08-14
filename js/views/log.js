import * as xp from '../models/xp.js';
import { el, panel, esc, toast, subjectColor, heatmap } from '../ui/dom.js';

const pad = n => String(n).padStart(2, '0');

function subjectPicker(index, cls = 'chip field') {
  const sel = el('select', cls);
  for (const s of index.subjects) {
    const o = el('option', null, s.level === 'CORE' ? s.short : `${s.short} ${s.level}`);
    o.value = s.id;
    sel.append(o);
  }
  return sel;
}

export function commitSession(state, { subjectId, minutes, note, source }) {
  const today = xp.localDay();
  const streak = xp.updateStreak(state.get('xp').streak, today);
  const earned = xp.award('study', { minutes }, streak.current);

  state.update('sessions', list => {
    list.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      subjectId, minutes, note, source, nodeIds: [],
    });
  });

  state.update('xp', x => {
    x.total += earned;
    x.bySubject[subjectId] = (x.bySubject[subjectId] ?? 0) + earned;
    x.streak = streak;
  });

  return { earned, streak };
}

export function logView(mount, ctx) {
  const { index, state } = ctx;

  // ── focus timer ───────────────────────────────────────────
  const t = panel('Focus timer');
  const tPick = subjectPicker(index);
  const readout = el('div', 'timer-readout', '00:00');
  const start = el('button', 'chip chip-primary', 'Start');
  const stop = el('button', 'chip', 'Stop & log');
  const tNote = el('input', 'chip field row-grow');
  tNote.type = 'text';
  tNote.placeholder = 'What are you working on?';
  stop.disabled = true;

  let startedAt = null;
  let ticking = null;

  const tick = () => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    readout.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };

  start.onclick = () => {
    startedAt = Date.now();
    start.disabled = true;
    stop.disabled = false;
    readout.classList.add('running');
    tick();
    ticking = setInterval(tick, 1000);
  };

  stop.onclick = () => {
    clearInterval(ticking);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const { earned, streak } = commitSession(state, {
      subjectId: tPick.value, minutes, note: tNote.value.trim(), source: 'timer',
    });
    toast(`Logged ${minutes} min <b>+${earned} XP</b> · ${streak.current}-day streak`);
    startedAt = null;
    start.disabled = false;
    stop.disabled = true;
    readout.classList.remove('running');
    readout.textContent = '00:00';
    tNote.value = '';
    renderHistory();
  };

  const tRow = el('div', 'row');
  tRow.append(tPick, tNote);
  const tRow2 = el('div', 'row');
  tRow2.append(start, stop);
  t.append(tRow, readout, tRow2);

  // ── manual entry ──────────────────────────────────────────
  const m = panel('Manual entry', 'studied on paper');
  const mPick = subjectPicker(index);
  const mins = el('input', 'chip field');
  mins.type = 'number'; mins.min = '1'; mins.max = '600'; mins.value = '30';
  mins.style.width = '86px';
  const note = el('input', 'chip field row-grow');
  note.type = 'text';
  note.placeholder = 'What did you actually learn?';
  const add = el('button', 'chip chip-primary', 'Log it');

  const submit = () => {
    const minutes = Math.max(1, Math.min(600, Number(mins.value) || 0));
    const { earned, streak } = commitSession(state, {
      subjectId: mPick.value, minutes, note: note.value.trim(), source: 'manual',
    });
    toast(`Logged ${minutes} min <b>+${earned} XP</b> · ${streak.current}-day streak`);
    note.value = '';
    renderHistory();
  };
  add.onclick = submit;
  note.onkeydown = e => { if (e.key === 'Enter') submit(); };

  const mRow = el('div', 'row');
  mRow.append(mPick, mins, note, add);
  m.append(mRow);

  // ── heatmap + history ─────────────────────────────────────
  const heat = el('div');
  const history = el('div');

  mount.append(t, m, heat, history);

  function renderHistory() {
    const sessions = state.get('sessions');
    const x = state.get('xp');

    heat.innerHTML = '';
    const hp = panel('Study heatmap', '45 weeks');
    hp.insertAdjacentHTML('beforeend', heatmap(sessions, 45));
    const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
    const todayMin = sessions
      .filter(s => xp.localDay(new Date(s.ts)) === xp.localDay())
      .reduce((a, s) => a + s.minutes, 0);
    const st = el('div', 'streak');
    st.innerHTML = `<b>${x.streak.current}</b><span>day streak · longest ${x.streak.longest}
      · ${(totalMin / 60).toFixed(1)}h total · ${todayMin}m today</span>`;
    hp.append(st);
    heat.append(hp);

    history.innerHTML = '';
    const p = panel('Recent sessions', `${sessions.length} logged`);
    const recent = [...sessions].reverse().slice(0, 40);
    if (!recent.length) {
      p.append(el('p', 'empty', 'Nothing logged yet. Start the timer above.'));
    }
    for (const s of recent) {
      const subj = index.subjects.find(v => v.id === s.subjectId);
      const row = el('div', 'node');
      row.style.setProperty('--c', subj ? subjectColor(subj) : 'var(--accent)');
      row.dataset.state = 'fresh';
      row.style.cursor = 'default';
      const when = new Date(s.ts);
      row.innerHTML = `
        <span class="node-pip"></span>
        <span class="node-code">${pad(when.getDate())}/${pad(when.getMonth() + 1)}</span>
        <span class="node-title">${esc(subj?.short ?? s.subjectId)}${
          s.note ? ` — ${esc(s.note)}` : ''}</span>
        <span class="node-lvl">${s.minutes}m</span>`;
      p.append(row);
    }
    history.append(p);
  }

  renderHistory();
}
