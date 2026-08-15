import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import * as G from '../models/grades.js';
import * as B from '../models/boundaries.js';
import { courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, panel, esc, toast, subjectColor, heatmap } from '../ui/dom.js';
import { commitSession } from './log.js';
import { halfLivesFor } from '../models/curve.js';
import { HUD_FIELDS, DEFAULT_HUD } from '../ui/jet.js';
import * as R from '../models/recall.js';
import { curveFor } from '../models/curve.js';
import { brief } from '../models/today.js';

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
  const settings = state.get('settings');
  const rows = index.examined.map(s => ({
    s, p: G.predict(entries.filter(g => g.subjectId === s.id), B.forSubject(settings, s.id)),
  }));
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
    boundaries: B.table(settings, index.examined),
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

export function fadeReadout(mount, ctx) {
  const { index, state } = ctx;

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '14px';
  mount.append(wrap);

  function draw() {
    wrap.innerHTML = '';
    const records = state.get('mastery');
    const checks = state.get('checks');
    const curve = curveFor(checks);
    const q = mastery.rescueQueue(examinedNodeIds(index), records, Date.now(), curve.halfLives);

    // ── how well you are actually holding things ───────────
    const head = panel('Recall', q.length ? `${q.length} to check` : 'all clear');
    const acc = curve.accuracy;
    head.append(stat([
      ['Fading now', `${q.length}`, q.length ? 'hot' : 'good'],
      ['Recent recall', acc ? `${acc.pct}%` : '—', acc && acc.pct >= 70 ? 'good' : acc ? 'hot' : ''],
      ['Checks done', `${checks.length}`],
      ['Curve', curve.drift.moved ? 'yours' : 'default'],
    ]));
    head.insertAdjacentHTML('beforeend', `<p class="mfd-sub">${
      checks.length < R.MIN_OBSERVATIONS
        ? `Answering these honestly is what makes the rest of the cockpit true. After
           ${R.MIN_OBSERVATIONS} checks at a level the app stops using my estimate of how
           fast you forget and starts fitting your own.`
        : curve.drift.moved
          ? `Fitted from your ${checks.length} checks: ${curve.drift.faster} level${
              curve.drift.faster === 1 ? '' : 's'} decaying faster than shipped, ${
              curve.drift.slower} slower.`
          : 'Your checks so far match the shipped curve.'}</p>`);
    wrap.append(head);

    if (!q.length) {
      const p = panel('Nothing fading');
      p.append(el('p', 'empty',
        'Everything you have captured is still fresh. Come back when something fades.'));
      wrap.append(p);
      return;
    }

    // ── the drill ──────────────────────────────────────────
    for (const item of q.slice(0, 12)) {
      const n = index.byId.get(item.id);
      const s = index.subjects.find(v => v.id === n.subjectId);
      const p = panel(`${s.short} · ${n.code}`, `${Math.round(item.days)}d ago`);
      p.style.setProperty('--c', subjectColor(s));
      p.insertAdjacentHTML('beforeend', `
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">${esc(n.title)}</div>
        <p class="mfd-sub">${esc(n.topicCode)} ${esc(n.topicTitle)} ·
          currently ${mastery.LEVELS[item.level]} ·
          ${Math.round(item.freshness * 100)}% retained</p>
        <p class="mfd-sub" style="margin-top:10px"><b>Could you do this cold, right now?</b></p>`);

      const row = el('div', 'row');
      for (const key of ['yes', 'partly', 'no']) {
        const o = R.OUTCOMES[key];
        const b = el('button', 'chip' + (key === 'yes' ? ' chip-primary' : ''), o.label);
        b.title = o.note;
        b.onclick = () => {
          const before = item.level;
          const after = R.applyOutcome(before, key);
          state.set('checks', R.record(state.get('checks'),
            { nodeId: n.id, level: before, days: item.days, outcome: key }));
          state.update('mastery', mm => {
            mm[n.id] = { level: after, lastTouched: new Date().toISOString(),
                         touches: (mm[n.id]?.touches ?? 0) + 1 };
          });
          if (key !== 'no') {
            const earned = xp.award('rescue', {}, state.get('xp').streak.current);
            state.update('xp', v => {
              v.total += earned;
              v.bySubject[n.subjectId] = (v.bySubject[n.subjectId] ?? 0) + earned;
            });
            toast(`${esc(o.note)} <b>+${earned} XP</b>`);
          } else {
            toast(esc(o.note));
          }
          draw();
        };
        row.append(b);
      }
      const skip = el('a', 'chip', 'Open topic');
      skip.href = `#/subject:${n.subjectId}`;
      row.append(skip);
      p.append(row);
      wrap.append(p);
    }
  }

  draw();
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

  // ── two ways to log: a raw mark, or the IB grade itself ──
  let mode = 'raw';
  const modeRow = el('div', 'row');
  const rawBtn = el('button', 'chip', 'Raw mark');
  const ibBtn = el('button', 'chip', 'IB grade 1–7');
  modeRow.append(rawBtn, ibBtn);

  const raw = numField('', 84, 'raw');
  const max = numField('', 84, 'max');
  const rawWrap = el('div', 'row');
  rawWrap.append(raw, el('span', 'mono', '/'), max);

  const gradeWrap = el('div', 'row');
  const gradeBtns = [];
  let grade = null;
  for (let g = 1; g <= 7; g++) {
    const b = el('button', 'chip', String(g));
    b.style.minWidth = '46px';
    b.title = `IB grade ${g} — about ${G.pctForGrade(g)}%`;
    b.onclick = () => {
      grade = g;
      gradeBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    };
    gradeBtns.push(b);
    gradeWrap.append(b);
  }

  const setMode = m => {
    mode = m;
    rawBtn.setAttribute('aria-pressed', String(m === 'raw'));
    ibBtn.setAttribute('aria-pressed', String(m === 'ib'));
    rawWrap.style.display = m === 'raw' ? '' : 'none';
    gradeWrap.style.display = m === 'ib' ? '' : 'none';
  };
  rawBtn.onclick = () => setMode('raw');
  ibBtn.onclick = () => setMode('ib');
  setMode('raw');

  const go = el('button', 'chip chip-primary', 'Add score');
  go.onclick = () => {
    let entry;
    if (mode === 'ib') {
      if (!grade) { toast('Pick a grade from 1 to 7'); return; }
      // Stored as the midpoint of that grade band so it feeds the prediction
      // like any other result, with the reported grade kept alongside.
      const pct = G.pctForGrade(grade);
      entry = { raw: pct, max: 100, pct, reported: grade };
    } else {
      const r = Number(raw.value), m = Number(max.value);
      if (!(m > 0) || !(r >= 0)) { raw.focus(); toast('Enter a raw mark and a maximum'); return; }
      entry = { raw: r, max: m, pct: (r / m) * 100, reported: null };
    }

    state.update('grades', list => {
      list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date().toISOString(), subjectId: pick.value,
        label: label.value.trim() || 'Assessment', paper: paper.value.trim() || 'Overall',
        ...entry });
    });
    const earned = xp.award('gradeLog', {}, state.get('xp').streak.current);
    state.update('xp', v => { v.total += earned; });
    const g = entry.reported ?? G.gradeFor(entry.pct);
    toast(`Grade ${g}/7 logged <b>+${earned} XP</b>`);
    raw.value = ''; max.value = ''; label.value = '';
    grade = null; gradeBtns.forEach(x => x.removeAttribute('aria-pressed'));
    mount.innerHTML = '';
    scoreEntry(mount, ctx);
  };

  const row = el('div', 'row');
  row.append(pick, paper, label);
  p.append(row, modeRow, rawWrap, gradeWrap, go);
  p.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
    A raw mark is more precise; an IB grade is what your teacher actually reports.
    Either one feeds the prediction and the projection out of 45.</p>`);
  mount.append(p);

  // recent scores, so you can see what you have logged
  const entries = state.get('grades');
  const hist = panel('Recent scores', `${entries.length}`);
  if (!entries.length) hist.append(el('p', 'empty', 'Nothing logged yet.'));
  for (const g of [...entries].reverse().slice(0, 10)) {
    const sub = index.subjects.find(v => v.id === g.subjectId);
    const pct = G.pctOf(g);
    const shown = g.reported ?? G.gradeFor(pct);
    const r = el('div', 'node');
    r.style.setProperty('--c', sub ? subjectColor(sub) : 'var(--accent)');
    r.dataset.state = shown >= 6 ? 'fresh' : shown >= 4 ? 'dimming' : 'fading';
    r.style.cursor = 'default';
    r.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(sub?.short ?? g.subjectId)}</span>
      <span class="node-title">${esc(g.paper)} — ${esc(g.label)}
        <span style="color:var(--panel-dim)">${g.reported
          ? ' · reported grade' : ` · ${g.raw}/${g.max}`}</span></span>
      <span class="node-lvl">${shown}/7</span>`;
    const del = el('button', 'node-lvl', '×');
    del.style.cursor = 'pointer';
    del.onclick = () => {
      state.update('grades', l => l.filter(z => z.id !== g.id));
      mount.innerHTML = ''; scoreEntry(mount, ctx);
    };
    r.append(del);
    hist.append(r);
  }
  mount.append(hist);
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

/* ─────────────────── today ─────────────────── */

/**
 * The only screen that answers "what do I do now". Everything else reports.
 */
export function todayView(mount, ctx) {
  const { index, state } = ctx;
  let budget = state.get('settings').dailyBudget ?? 60;

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '14px';

  const bar = el('div', 'row');
  const buttons = [];
  for (const m of [30, 60, 90, 120]) {
    const b = el('button', 'chip', `${m} min`);
    b.setAttribute('aria-pressed', String(m === budget));
    b.onclick = () => {
      budget = m;
      state.update('settings', s => { s.dailyBudget = m; });
      buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    };
    buttons.push(b);
    bar.append(b);
  }
  mount.append(bar, wrap);

  function draw() {
    wrap.innerHTML = '';
    const curve = curveFor(state.get('checks'));
    const b = brief({
      index,
      records: state.get('mastery'),
      sessions: state.get('sessions'),
      deadlines: state.get('deadlines'),
      questState: state.get('quests'),
      checks: state.get('checks'),
      halfLives: curve.halfLives,
      expected: courseElapsed(index.dpStart, index.examStart),
      budget,
    });

    const head = panel('Today', b.done ? 'clear' : `${b.minutes} min`);
    head.insertAdjacentHTML('beforeend', `
      <div class="mfd-big" style="color:var(--panel-text);font-size:22px;line-height:1.25">${
        esc(b.headline)}</div>
      <p class="mfd-sub">${esc(b.detail)}</p>`);
    head.append(stat([
      ['Planned', `${b.minutes}m`],
      ['Logged today', `${b.loggedToday}m`, b.loggedToday ? 'good' : 'hot'],
      ['Items', `${b.items.length}`],
    ]));
    wrap.append(head);

    if (b.done) {
      const p = panel('Clear');
      p.append(el('p', 'empty',
        'Nothing is fading, nothing is due, and today is logged. Take new ground or stop.'));
      wrap.append(p);
      return;
    }

    const list = panel('In order', 'most consequential first');
    b.items.forEach((item, i) => {
      const a = el('a', 'node');
      a.href = item.href;
      a.style.textDecoration = 'none';
      a.style.setProperty('--c', item.subject ? subjectColor(item.subject) : 'var(--accent)');
      a.dataset.state = item.critical ? 'lapsed'
        : item.kind === 'recall' ? 'fading'
        : item.kind === 'deadline' ? 'fading' : 'dimming';
      a.innerHTML = `
        <span class="node-pip"></span>
        <span class="node-code">${i + 1}</span>
        <span class="node-title"><b>${esc(item.title)}</b>
          <span style="display:block;color:var(--panel-dim);font-size:11.5px;margin-top:2px">
            ${esc(item.detail)}</span></span>
        <span class="node-lvl">${item.minutes ? `${item.minutes}m` : '—'}</span>`;
      list.append(a);
    });
    wrap.append(list);
  }

  draw();
}

/* ─────────────────── command terms ─────────────────── */

/**
 * What a question is actually asking for. The assessment-objective grouping is
 * verbatim from the official guide; misreading a command term is one of the
 * cheapest marks there is to lose.
 */
export async function termsReadout(mount) {
  let data;
  try {
    data = await (await fetch('data/command-terms.json')).json();
  } catch {
    mount.append(el('p', 'empty', 'Could not load data/command-terms.json.'));
    return;
  }

  const head = panel('Command terms', 'by assessment objective');
  head.insertAdjacentHTML('beforeend', `<p class="mfd-sub">${esc(data.source)}</p>`);
  mount.append(head);

  for (const o of data.objectives) {
    const p = panel(o.ao, `${o.terms.length} terms`);
    p.insertAdjacentHTML('beforeend', `
      <p class="mfd-sub" style="margin-bottom:10px">${esc(o.demand)}</p>`);

    const row = el('div', 'row');
    for (const t of o.terms) {
      const chip = el('span', 'chip');
      chip.textContent = t;
      chip.style.cursor = 'default';
      row.append(chip);
    }
    p.append(row);
    p.insertAdjacentHTML('beforeend',
      `<p class="mfd-sub" style="margin-top:12px"><b>${esc(o.note)}</b></p>`);
    mount.append(p);
  }
}
