import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import * as G from '../models/grades.js';
import { courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, panel, esc, toast, subjectColor, heatmap } from '../ui/dom.js';
import { commitSession } from './log.js';
import { HUD_FIELDS, DEFAULT_HUD } from '../ui/jet.js';

const DAY = 86400000;

/* ─────────────────────────── readouts ─────────────────────────── */

export function heatReadout(mount, { state }) {
  const sessions = state.get('sessions');
  const x = state.get('xp');
  const p = panel('Study heat map', '45 weeks');
  p.insertAdjacentHTML('beforeend', heatmap(sessions, 45));

  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  const today = sessions.filter(s => xp.localDay(new Date(s.ts)) === xp.localDay())
    .reduce((a, s) => a + s.minutes, 0);
  const week = sessions.filter(s => Date.now() - Date.parse(s.ts) <= 7 * DAY)
    .reduce((a, s) => a + s.minutes, 0);

  p.append(stat([
    ['Current streak', `${x.streak.current}d`, x.streak.current ? 'good' : 'hot'],
    ['Longest streak', `${x.streak.longest}d`],
    ['This week', `${(week / 60).toFixed(1)}h`],
    ['Today', `${today}m`],
    ['All time', `${(total / 60).toFixed(1)}h`],
  ]));
  mount.append(p);
}

export function avgReadout(mount, { index, state }) {
  const entries = state.get('grades');
  const rows = index.examined.map(s => ({ s, p: G.predict(entries.filter(g => g.subjectId === s.id)) }));
  const known = rows.filter(r => r.p);
  const avg = known.length ? known.reduce((a, r) => a + r.p.grade, 0) / known.length : null;

  const p = panel('Grade average', known.length ? `${known.length}/6 subjects` : 'no data');
  p.append(stat([
    ['Average grade', avg === null ? '—' : avg.toFixed(2), avg >= 6 ? 'good' : avg === null ? '' : 'hot'],
    ['Subjects logged', `${known.length}`],
    ['Sum of grades', `${known.reduce((a, r) => a + r.p.grade, 0)}`],
  ]));

  if (!known.length) {
    p.append(el('p', 'empty', 'No assessments logged yet. Press SCORE to add one.'));
  }
  for (const { s, p: pred } of rows) {
    const r = el('div', 'node');
    r.style.setProperty('--c', subjectColor(s));
    r.dataset.state = !pred ? 'untouched' : pred.grade >= 6 ? 'fresh' : pred.grade >= 4 ? 'dimming' : 'fading';
    r.style.cursor = 'default';
    const trend = !pred ? '' : pred.trend > 0.5 ? `▲ ${pred.trend}%`
      : pred.trend < -0.5 ? `▼ ${Math.abs(pred.trend)}%` : 'flat';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(s.short)}</span>
      <span class="node-title">${pred ? `${pred.pct}% over ${pred.count} · ${trend}`
        : '<span style="color:var(--panel-dim)">nothing logged</span>'}</span>
      <span class="node-lvl">${pred ? pred.grade + '/7' : '—'}</span>`;
    p.append(r);
  }
  mount.append(p);
}

export function projReadout(mount, { index, state }) {
  const settings = state.get('settings');
  const target = state.get('meta').targetPoints ?? 45;
  const proj = G.project({
    subjects: index.examined, grades: state.get('grades'),
    tok: settings.tokGrade ?? null, ee: settings.eeGrade ?? null, target,
  });
  const p = panel('Projection', `target ${target}`);
  p.append(stat([
    ['Projected', `${proj.total}`, proj.total >= target ? 'good' : 'hot'],
    ['Target', `${target}`],
    ['Ceiling', `${proj.ceiling}`],
    ['Core bonus', proj.bonus.known ? `+${proj.bonus.points}` : 'not set'],
  ]));
  const gap = target - proj.total;
  p.insertAdjacentHTML('beforeend', `<p class="mfd-sub">${
    proj.bonus.fail ? '<b style="color:var(--bad)">TOK/EE combination fails the diploma.</b>'
    : proj.knownCount === 0 ? 'Nothing logged yet — press SCORE to start the projection.'
    : gap > 0 ? `<b>${gap} short.</b> Weakest link: ${esc(proj.weakest.subject.short)} at ${
        proj.weakest.grade}/7.` : '<b>On target.</b>'}</p>`);
  mount.append(p);
}

export function paceReadout(mount, { index, state }) {
  const records = state.get('mastery');
  const ids = examinedNodeIds(index);
  const captured = mastery.subjectProgress(ids, records);
  const expected = courseElapsed(index.dpStart, index.examStart);
  const ratio = paceRatio(captured, expected);
  const days = Math.max(0, Math.ceil((Date.parse(index.examStart) - Date.now()) / DAY));

  const p = panel('Pace', `${days} days to exams`);
  p.append(stat([
    ['Captured', `${(captured * 100).toFixed(1)}%`],
    ['Calendar expects', `${(expected * 100).toFixed(1)}%`],
    ['On pace', expected > 0 ? `${Math.round(ratio * 100)}%` : '—', ratio >= 0.95 ? 'good' : 'hot'],
    ['Nodes left', `${ids.length - ids.filter(i => (records[i]?.level ?? 0) > 0).length}`],
  ]));
  for (const s of index.examined) {
    const sIds = nodesFor(index, s.id).map(n => n.id);
    const pct = mastery.subjectProgress(sIds, records);
    const r = el('div', 'node');
    r.style.setProperty('--c', subjectColor(s));
    r.dataset.state = pct >= expected ? 'fresh' : 'fading';
    r.style.cursor = 'default';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(s.short)}</span>
      <span class="node-title"><span class="sub-track" style="display:block;max-width:260px">
        <span class="sub-fill" style="width:${(pct * 100).toFixed(1)}%"></span></span></span>
      <span class="node-lvl">${Math.round(pct * 100)}%</span>`;
    p.append(r);
  }
  mount.append(p);
}

export function xpReadout(mount, { index, state }) {
  const x = state.get('xp');
  const lvl = xp.levelFromXp(x.total);
  const p = panel('Level and XP', `level ${lvl.level}`);
  p.insertAdjacentHTML('beforeend', `
    <div class="xp"><span class="xp-lvl">LEVEL<b>${lvl.level}</b></span>
      <div class="xp-track"><div class="xp-fill" style="width:${(lvl.into / lvl.need) * 100}%"></div></div>
      <span class="xp-num">${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()}</span></div>`);
  p.append(stat([
    ['Total XP', x.total.toLocaleString()],
    ['To next level', (lvl.need - lvl.into).toLocaleString()],
    ['Streak bonus', `${xp.streakMultiplier(x.streak.current).toFixed(2)}×`],
  ]));
  for (const s of index.subjects) {
    const v = x.bySubject[s.id] ?? 0;
    const sl = xp.levelFromXp(v);
    const r = el('div', 'node');
    r.style.setProperty('--c', subjectColor(s));
    r.dataset.state = v ? 'fresh' : 'untouched';
    r.style.cursor = 'default';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(s.callsign)}</span>
      <span class="node-title">${esc(s.short)}</span>
      <span class="node-lvl">LV${sl.level} · ${v.toLocaleString()} XP</span>`;
    p.append(r);
  }
  mount.append(p);
}

export function fadeReadout(mount, { index, state }) {
  const records = state.get('mastery');
  const q = mastery.rescueQueue(examinedNodeIds(index), records);
  const p = panel('Fading topics', `${q.length}`);
  if (!q.length) {
    p.append(el('p', 'empty', 'Nothing is fading. Everything you have captured is still fresh.'));
  }
  for (const item of q.slice(0, 25)) {
    const n = index.byId.get(item.id);
    const s = index.subjects.find(v => v.id === n.subjectId);
    const a = el('a', 'node');
    a.href = `#/subject:${n.subjectId}`;
    a.style.textDecoration = 'none';
    a.style.setProperty('--c', subjectColor(s));
    a.dataset.state = 'fading';
    a.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(n.code)}</span>
      <span class="node-title">${esc(s.short)} · ${esc(n.title)}</span>
      <span class="node-lvl">${Math.round(item.days)}d · ${Math.round(item.freshness * 100)}%</span>`;
    p.append(a);
  }
  mount.append(p);
}

/** Deadlines filtered to the two kinds you asked to see separately. */
function upcoming(mount, ctx, kind, title) {
  const { index, state } = ctx;
  const isTest = d => /test|mock|exam|paper|quiz/i.test(d.title);
  const items = state.get('deadlines')
    .filter(d => d.status !== 'done')
    .filter(d => (kind === 'test' ? isTest(d) : !isTest(d)))
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));

  const p = panel(title, `${items.length}`);
  if (!items.length) {
    p.append(el('p', 'empty',
      `Nothing scheduled. Press DUE to add ${kind === 'test' ? 'a test or mock' : 'an assignment'}.`));
  }
  for (const d of items) {
    const days = Math.ceil((Date.parse(d.due) - Date.now()) / DAY);
    const s = d.subjectId ? index.subjects.find(v => v.id === d.subjectId) : null;
    const r = el('div', 'node');
    r.style.setProperty('--c', s ? subjectColor(s) : 'var(--accent)');
    r.dataset.state = days <= 3 ? 'lapsed' : days <= 14 ? 'fading' : 'dimming';
    r.style.cursor = 'default';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(s?.short ?? 'CORE')}</span>
      <span class="node-title">${esc(d.title)}
        <span style="color:var(--panel-dim);font-size:11px"> · ${esc(d.status)}</span></span>
      <span class="node-lvl">${days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'today' : `${days}d`}</span>`;
    p.append(r);
  }
  mount.append(p);
}

export const testsReadout  = (m, c) => upcoming(m, c, 'test', 'Next tests');
export const assignReadout = (m, c) => upcoming(m, c, 'assignment', 'Next assignments');

/* ─────────────────────────── entry boxes ─────────────────────────── */

export function logEntry(mount, ctx) {
  const { index, state } = ctx;
  const p = panel('Log a study session', 'type it in');

  const pick = subjectSelect(index);
  const mins = numField('30', 90);
  const note = textField('What did you actually learn?');
  const go = el('button', 'chip chip-primary', 'Log it');

  const submit = () => {
    const m = Math.max(1, Math.min(600, Number(mins.value) || 0));
    const { earned, streak } = commitSession(state, {
      subjectId: pick.value, minutes: m, note: note.value.trim(), source: 'manual',
    });
    toast(`Logged ${m} min <b>+${earned} XP</b> · ${streak.current}-day streak`);
    note.value = '';
    recent(p, state, index);
  };
  go.onclick = submit;
  note.onkeydown = e => { if (e.key === 'Enter') submit(); };

  const row = el('div', 'row');
  row.append(pick, mins, note, go);
  p.append(row);
  recent(p, state, index);
  mount.append(p);
  setTimeout(() => note.focus(), 60);
}

function recent(p, state, index) {
  p.querySelector('[data-recent]')?.remove();
  const box = el('div');
  box.dataset.recent = '1';
  const list = [...state.get('sessions')].reverse().slice(0, 8);
  if (!list.length) box.append(el('p', 'empty', 'Nothing logged yet.'));
  for (const s of list) {
    const subj = index.subjects.find(v => v.id === s.subjectId);
    const r = el('div', 'node');
    r.style.setProperty('--c', subj ? subjectColor(subj) : 'var(--accent)');
    r.dataset.state = 'fresh';
    r.style.cursor = 'default';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${new Date(s.ts).toLocaleDateString()}</span>
      <span class="node-title">${esc(subj?.short ?? s.subjectId)}${s.note ? ` — ${esc(s.note)}` : ''}</span>
      <span class="node-lvl">${s.minutes}m</span>`;
    box.append(r);
  }
  p.append(box);
}

export function scoreEntry(mount, ctx) {
  const { index, state } = ctx;
  const p = panel('Add a score', 'test, mock or paper');
  const pick = subjectSelect(index, true);
  const paper = textField('Paper 2', 120);
  const label = textField('End of unit test');
  const raw = numField('', 84, 'raw');
  const max = numField('', 84, 'max');
  const go = el('button', 'chip chip-primary', 'Add score');

  go.onclick = () => {
    const r = Number(raw.value), m = Number(max.value);
    if (!(m > 0) || !(r >= 0)) { raw.focus(); toast('Enter a raw mark and a maximum'); return; }
    state.update('grades', list => {
      list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date().toISOString(), subjectId: pick.value,
        label: label.value.trim() || 'Assessment', paper: paper.value.trim() || 'Overall',
        raw: r, max: m, pct: (r / m) * 100 });
    });
    const earned = xp.award('gradeLog', {}, state.get('xp').streak.current);
    state.update('xp', v => { v.total += earned; });
    toast(`${Math.round((r / m) * 100)}% · grade ${G.gradeFor((r / m) * 100)}/7 <b>+${earned} XP</b>`);
    raw.value = ''; label.value = '';
    avgReadout(mount, ctx);
  };

  const row = el('div', 'row');
  row.append(pick, paper, label, raw, max, go);
  p.append(row);
  mount.append(p);
  setTimeout(() => raw.focus(), 60);
}

export function dueEntry(mount, ctx) {
  const { index, state } = ctx;
  const p = panel('Add a deadline', 'test, IA, essay or milestone');
  const title = textField('Physics IA first draft');
  const pick = subjectSelect(index, false, true);
  const date = el('input', 'chip field');
  date.type = 'date';
  date.value = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10);
  const go = el('button', 'chip chip-primary', 'Add');

  const submit = () => {
    const t = title.value.trim();
    if (!t) { title.focus(); return; }
    state.update('deadlines', list => {
      list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: t, subjectId: pick.value || null, type: 'milestone',
        due: new Date(date.value + 'T23:59:00').toISOString(),
        status: 'not started', progress: 0 });
    });
    title.value = '';
    toast('Waypoint added');
    mount.innerHTML = '';
    dueEntry(mount, ctx);
  };
  go.onclick = submit;
  title.onkeydown = e => { if (e.key === 'Enter') submit(); };

  const row = el('div', 'row');
  row.append(title, pick, date, go);
  p.append(row);
  p.insertAdjacentHTML('beforeend',
    '<p class="mfd-sub">Anything with “test”, “mock”, “exam”, “paper” or “quiz” in the title shows up under TEST. Everything else lands under ASGN.</p>');
  mount.append(p);

  const all = [...state.get('deadlines')].sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  const q = panel('All waypoints', `${all.length}`);
  if (!all.length) q.append(el('p', 'empty', 'Nothing scheduled yet.'));
  for (const d of all) {
    const days = Math.ceil((Date.parse(d.due) - Date.now()) / DAY);
    const s = d.subjectId ? index.subjects.find(v => v.id === d.subjectId) : null;
    const r = el('div', 'node');
    r.style.setProperty('--c', s ? subjectColor(s) : 'var(--accent)');
    r.dataset.state = d.status === 'done' ? 'fresh' : days <= 3 ? 'lapsed' : days <= 14 ? 'fading' : 'dimming';
    r.style.cursor = 'default';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(s?.short ?? 'CORE')}</span>
      <span class="node-title">${esc(d.title)}</span>`;
    const sel = el('select', 'node-lvl');
    sel.style.cursor = 'pointer';
    for (const st of ['not started', 'drafting', 'submitted', 'done']) {
      const o = el('option', null, st); o.value = st;
      if (st === d.status) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => {
      state.update('deadlines', l => { const h = l.find(z => z.id === d.id); if (h) h.status = sel.value; });
      mount.innerHTML = ''; dueEntry(mount, ctx);
    };
    const del = el('button', 'node-lvl', '×');
    del.style.cursor = 'pointer';
    del.onclick = () => {
      state.update('deadlines', l => l.filter(z => z.id !== d.id));
      mount.innerHTML = ''; dueEntry(mount, ctx);
    };
    r.append(sel, el('span', 'node-lvl', days < 0 ? `${Math.abs(days)}d late` : `${days}d`), del);
    q.append(r);
  }
  mount.append(q);
}

export function noteEntry(mount, ctx) {
  const { index, state } = ctx;
  const p = panel('Quick note', 'attached to a syllabus topic');

  const pick = subjectSelect(index);
  const nodeSel = el('select', 'chip field row-grow');
  const fill = () => {
    nodeSel.innerHTML = '';
    for (const n of nodesFor(index, pick.value)) {
      const o = el('option', null, `${n.code} — ${n.title}`);
      o.value = n.id;
      nodeSel.append(o);
    }
  };
  pick.onchange = fill;
  fill();

  const ta = el('textarea');
  ta.placeholder = 'Formulas, what you got wrong, the thing that finally clicked…';
  const gn = el('input', 'chip field row-grow');
  gn.type = 'url';
  gn.placeholder = 'GoodNotes share link for this topic (optional)';

  const load = () => {
    const saved = state.get('notes')[nodeSel.value] ?? {};
    ta.value = saved.md ?? '';
    gn.value = saved.goodnotes ?? '';
  };
  nodeSel.onchange = load;
  load();

  const go = el('button', 'chip chip-primary', 'Save note');
  go.onclick = () => {
    const first = !state.get('notes')[nodeSel.value]?.md && ta.value.trim();
    state.update('notes', n => {
      n[nodeSel.value] = { md: ta.value, goodnotes: gn.value.trim(),
        updatedAt: new Date().toISOString() };
    });
    if (first) {
      const earned = xp.award('firstNote', {}, state.get('xp').streak.current);
      state.update('xp', v => { v.total += earned; });
      toast(`Note saved <b>+${earned} XP</b>`);
    } else toast('Note saved');
  };

  const r1 = el('div', 'row'); r1.append(pick, nodeSel);
  const r2 = el('div', 'notes'); r2.append(ta);
  const r3 = el('div', 'row'); r3.append(gn, go);
  p.append(r1, r2, r3);
  mount.append(p);
}

/* ─────────────────────────── helpers ─────────────────────────── */

function subjectSelect(index, examinedOnly = false, allowNone = false) {
  const sel = el('select', 'chip field');
  if (allowNone) { const o = el('option', null, 'No subject'); o.value = ''; sel.append(o); }
  for (const s of (examinedOnly ? index.examined : index.subjects)) {
    const o = el('option', null, s.level === 'CORE' ? s.short : `${s.short} ${s.level}`);
    o.value = s.id;
    sel.append(o);
  }
  return sel;
}

function numField(value, width, ph = '') {
  const i = el('input', 'chip field');
  i.type = 'number'; i.min = '0'; i.value = value; i.placeholder = ph;
  i.style.width = width + 'px';
  return i;
}

function textField(ph, width) {
  const i = el('input', 'chip field' + (width ? '' : ' row-grow'));
  i.type = 'text'; i.placeholder = ph;
  if (width) i.style.width = width + 'px';
  return i;
}

/** A row of big numeric readouts, the way an instrument reports. */
function stat(pairs) {
  const box = el('div', 'stat');
  box.innerHTML = pairs.map(([label, value, tone]) =>
    `<span class="${tone ?? ''}"><b>${esc(value)}</b><i>${esc(label)}</i></span>`).join('');
  return box;
}


/* ─────────────────── windshield editor ─────────────────── */

/**
 * What is projected on the glass. Toggle the instrument readouts, and add
 * your own lines — a target, a reminder, whatever you want in front of you.
 */
export function hudEntry(mount, ctx) {
  const { state } = ctx;

  const own = panel('Your lines on the glass', 'up to four');
  own.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
    Anything you type here is projected under the reticle, every time you open
    the cockpit.</p>`);

  const list = el('div');
  const row = el('div', 'row');
  const input = el('input', 'chip field row-grow');
  input.type = 'text';
  input.maxLength = 42;
  input.placeholder = 'TARGET 45 · NO ZERO DAYS · FIX PAPER 2';
  const add = el('button', 'chip chip-primary', 'Project it');

  const submit = () => {
    const v = input.value.trim();
    if (!v) return;
    const cur = state.get('settings').hudCustom ?? [];
    if (cur.length >= 4) { toast('The glass holds four lines. Remove one first.'); return; }
    state.update('settings', st => { st.hudCustom = [...cur, v]; });
    input.value = '';
    drawLines();
  };
  add.onclick = submit;
  input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  row.append(input, add);
  own.append(row, list);

  function drawLines() {
    list.innerHTML = '';
    const lines = state.get('settings').hudCustom ?? [];
    if (!lines.length) {
      list.append(el('p', 'empty', 'Nothing of your own on the glass yet.'));
      return;
    }
    lines.forEach((line, i) => {
      const r = el('div', 'node');
      r.style.setProperty('--c', 'var(--accent)');
      r.dataset.state = 'fresh';
      r.style.cursor = 'default';
      r.innerHTML = `<span class="node-pip"></span>
        <span class="node-code">${i + 1}</span>
        <span class="node-title mono">${esc(line)}</span>`;
      const del = el('button', 'node-lvl', '×');
      del.style.cursor = 'pointer';
      del.title = 'Remove this line';
      del.onclick = () => {
        state.update('settings', st => {
          st.hudCustom = (st.hudCustom ?? []).filter((_, j) => j !== i);
        });
        drawLines();
      };
      r.append(del);
      list.append(r);
    });
  }
  drawLines();

  // ── instrument readouts ───────────────────────────────────
  const inst = panel('Instrument readouts', 'toggle any');
  const chosen = new Set(state.get('settings').hudFields ?? DEFAULT_HUD);
  for (const [id, f] of Object.entries(HUD_FIELDS)) {
    const r = el('button', 'node');
    r.dataset.state = chosen.has(id) ? 'fresh' : 'untouched';
    r.style.setProperty('--c', 'var(--accent)');
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(f.label)}</span>
      <span class="node-title">${esc(f.name)}</span>
      <span class="node-lvl">${chosen.has(id) ? 'on' : 'off'}</span>`;
    r.onclick = () => {
      if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
      state.update('settings', st => { st.hudFields = [...chosen]; });
      mount.innerHTML = '';
      hudEntry(mount, ctx);
    };
    inst.append(r);
  }

  const foot = el('div', 'row');
  const reset = el('button', 'chip', 'Restore defaults');
  reset.onclick = () => {
    state.update('settings', st => { st.hudFields = [...DEFAULT_HUD]; st.hudCustom = []; });
    toast('Glass cleared to defaults');
    mount.innerHTML = '';
    hudEntry(mount, ctx);
  };
  const apply = el('button', 'chip chip-primary', 'Apply to the glass');
  apply.onclick = () => location.reload();
  foot.append(apply, reset);
  inst.append(foot);

  mount.append(own, inst);
  setTimeout(() => input.focus(), 60);
}
