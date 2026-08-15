import * as G from '../models/grades.js';
import * as B from '../models/boundaries.js';
import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';

const GRADES = ['A', 'B', 'C', 'D', 'E'];

/** Engine performance: every score logged, predicted grades, projection to 45. */
export function gradesView(mount, ctx) {
  const { index, state } = ctx;

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';
  mount.append(logForm(ctx, draw), wrap);

  function draw() {
    wrap.innerHTML = '';
    const entries = state.get('grades');
    const settings = state.get('settings');
    const target = state.get('meta').targetPoints ?? 45;

    const p = G.project({
      subjects: index.examined,
      grades: entries,
      tok: settings.tokGrade ?? null,
      ee: settings.eeGrade ?? null,
      target,
      boundaries: B.table(settings, index.examined),
    });

    wrap.append(projectionPanel(p, target, state, draw));
    wrap.append(subjectsPanel(p));
    wrap.append(boundariesPanel(ctx, settings, draw));
    wrap.append(corePanel(settings, state, draw, p));
    wrap.append(historyPanel(index, entries, state, draw));
  }

  draw();
}

function projectionPanel(p, target, state, draw) {
  const box = panel('Projection', `target ${target}`);
  const short = target - p.total;
  const line = p.bonus.fail
    ? '<b style="color:var(--bad)">TOK/EE combination fails the diploma.</b> An E in either is a failing condition.'
    : p.knownCount === 0
      ? 'No assessments logged yet. Log a test below and the projection starts working.'
      : short > 0
        ? `<b>${short} point${short > 1 ? 's' : ''} short of ${target}.</b> ${
            p.weakest ? `Weakest link is ${esc(p.weakest.subject.short)} at ${p.weakest.grade}/7${
              p.weakest.weakest ? ` — ${esc(p.weakest.weakest.paper)} is the worst component at ${
                p.weakest.weakest.pct}%.` : '.'}` : ''}`
        : `<b>On target.</b> Projected ${p.total} against a target of ${target}.`;

  box.insertAdjacentHTML('beforeend', `
    <div class="mfd-big" style="color:var(--panel-text)">${p.total}<small>/ 45</small></div>
    <p class="mfd-sub">${line}</p>
    <div class="sub-track" style="margin-top:14px">
      <div class="sub-fill" style="--c:var(--accent);background:var(--accent);width:${
        Math.min(100, (p.total / 45) * 100)}%"></div>
    </div>
    <p class="mfd-sub">${p.knownCount} of ${p.knownCount + p.unknownCount} subjects have data
      · ${p.subjectPoints} subject points ${p.bonus.known ? `+ ${p.bonus.points} core bonus`
      : '· core bonus not set'} · ceiling ${p.ceiling}</p>`);

  const t = el('div', 'row');
  const num = el('input', 'chip field');
  num.type = 'number'; num.min = '24'; num.max = '45'; num.value = String(target);
  num.style.width = '84px';
  const save = el('button', 'chip', 'Set target');
  save.onclick = () => {
    state.update('meta', m => { m.targetPoints = Math.max(24, Math.min(45, Number(num.value) || 45)); });
    toast('Target updated');
    draw();
  };
  t.append(el('span', 'mono', 'Target'), num, save);
  box.append(t);
  return box;
}

function subjectsPanel(p) {
  const box = panel('Predicted grades', 'weighted to recent');
  for (const s of p.perSubject) {
    const r = el('div', 'node');
    r.style.setProperty('--c', subjectColor(s.subject));
    r.dataset.state = s.grade === null ? 'untouched' : s.grade >= 6 ? 'fresh' : s.grade >= 4 ? 'dimming' : 'fading';
    r.style.cursor = 'default';
    const trend = s.trend > 0.5 ? `▲ ${s.trend}%` : s.trend < -0.5 ? `▼ ${Math.abs(s.trend)}%` : '—';
    r.innerHTML = `
      <span class="node-pip"></span>
      <span class="node-code">${esc(s.subject.short)}</span>
      <span class="node-title">${s.grade === null
        ? '<span style="color:var(--panel-dim)">no assessments logged</span>'
        : `${s.pct}% over ${s.count} assessment${s.count > 1 ? 's' : ''} · ${trend}${
            s.weakest ? ` · weakest ${esc(s.weakest.paper)} ${s.weakest.pct}%` : ''}`}</span>
      <span class="node-lvl">${s.grade === null ? '—' : s.grade + '/7'}</span>`;
    box.append(r);
  }
  return box;
}

/**
 * Per-subject grade boundaries.
 *
 * These decide every predicted grade and the whole projection, and they are not
 * the same across subjects. Nothing here is guessed: the app ships a generic
 * placeholder and shows plainly which subjects are still on it.
 */
function boundariesPanel(ctx, settings, draw) {
  const { index, state } = ctx;
  const custom = index.examined.filter(s => B.isCustom(settings, s.id)).length;
  const box = panel('Mark thresholds — what % is a 7', `${custom}/${index.examined.length} set`);

  box.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
    Grades are always 1–7. These are the <b>percentages that earn each grade</b>, and
    they are not the same across subjects: the same 66% has historically been a 7 in
    Mathematics AA HL and a 5 in a Language A course. Every subject here is on one
    placeholder table, so the projection is indicative until you replace it. Your
    school receives the real thresholds from the IB after each session.</p>`);

  for (const s of index.examined) {
    const b = B.forSubject(settings, s.id);
    const mine = B.isCustom(settings, s.id);

    const row = el('div', 'node');
    row.style.setProperty('--c', subjectColor(s));
    row.dataset.state = mine ? 'fresh' : 'untouched';
    row.innerHTML = `<span class="node-pip"></span>
      <span class="node-code">${esc(s.short)}</span>
      <span class="node-title mono" style="font-size:11.5px">${
        b.slice(1).map((v, i) => `${i + 2}:${v}`).join('  ')}</span>
      <span class="node-lvl">${mine ? 'yours' : 'placeholder'}</span>`;

    const edit = el('div', 'row');
    edit.style.display = 'none';
    const fields = [];
    for (let g = 2; g <= 7; g++) {
      const f = el('input', 'chip field');
      f.type = 'number'; f.min = '1'; f.max = '100'; f.step = '0.1';
      f.value = String(b[g - 1]);
      f.style.width = '68px';
      f.title = `Minimum percentage for a ${g}`;
      fields.push(f);
      edit.append(f);
    }
    const save = el('button', 'chip chip-primary', 'Save');
    save.onclick = () => {
      const r = B.parse([0, ...fields.map(f => f.value)]);
      if (!r.ok) { toast(esc(r.error)); return; }
      state.update('settings', st => {
        st.boundaries = { ...(st.boundaries ?? {}), [s.id]: r.boundaries };
      });
      toast(`${esc(s.short)} boundaries saved`);
      draw();
    };
    const reset = el('button', 'chip', 'Reset');
    reset.onclick = () => {
      state.update('settings', st => {
        if (st.boundaries) delete st.boundaries[s.id];
      });
      draw();
    };
    edit.append(save, reset);

    row.onclick = () => {
      edit.style.display = edit.style.display === 'none' ? '' : 'none';
    };
    row.style.cursor = 'pointer';
    box.append(row, edit);
  }
  return box;
}

function corePanel(settings, state, draw, p) {
  const box = panel('TOK / EE bonus', p.bonus.known ? `+${p.bonus.points}` : 'not set');
  const row = el('div', 'row');

  for (const [key, label] of [['tokGrade', 'TOK'], ['eeGrade', 'EE']]) {
    const sel = el('select', 'chip field');
    const none = el('option', null, `${label} —`);
    none.value = '';
    sel.append(none);
    for (const g of GRADES) {
      const o = el('option', null, `${label} ${g}`);
      o.value = g;
      if (settings[key] === g) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => {
      state.update('settings', s => { s[key] = sel.value || null; });
      draw();
    };
    row.append(sel);
  }

  box.append(row);
  box.insertAdjacentHTML('beforeend',
    `<p class="mfd-sub">The published matrix awards up to 3 points. An E in either TOK or the
     Extended Essay is a failing condition for the diploma, not a zero.</p>`);
  return box;
}

function logForm(ctx, draw) {
  const { index, state } = ctx;
  const box = panel('Log an assessment');

  const pick = el('select', 'chip field');
  for (const s of index.examined) {
    const o = el('option', null, `${s.short} ${s.level}`);
    o.value = s.id;
    pick.append(o);
  }
  const paper = el('input', 'chip field');
  paper.type = 'text'; paper.placeholder = 'Paper 2'; paper.style.width = '120px';
  const label = el('input', 'chip field row-grow');
  label.type = 'text'; label.placeholder = 'End of unit test — kinematics';
  const raw = el('input', 'chip field');
  raw.type = 'number'; raw.min = '0'; raw.placeholder = 'raw'; raw.style.width = '82px';
  const max = el('input', 'chip field');
  max.type = 'number'; max.min = '1'; max.placeholder = 'max'; max.style.width = '82px';
  const add = el('button', 'chip chip-primary', 'Log score');

  add.onclick = () => {
    const r = Number(raw.value), m = Number(max.value);
    if (!(m > 0) || !(r >= 0)) { raw.focus(); toast('Enter a raw score and a maximum'); return; }
    state.update('grades', list => {
      list.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date().toISOString(),
        subjectId: pick.value,
        label: label.value.trim() || 'Assessment',
        paper: paper.value.trim() || 'Overall',
        raw: r, max: m, pct: (r / m) * 100,
      });
    });
    toast('<b>Score logged</b>');
    raw.value = ''; label.value = '';
    draw();
  };

  const row = el('div', 'row');
  row.append(pick, paper, label, raw, max, add);
  box.append(row);
  return box;
}

function historyPanel(index, entries, state, draw) {
  const box = panel('Assessment history', `${entries.length}`);
  if (!entries.length) {
    box.append(el('p', 'empty', 'Nothing logged yet.'));
    return box;
  }
  for (const g of [...entries].reverse()) {
    const s = index.subjects.find(v => v.id === g.subjectId);
    const pct = G.pctOf(g);
    const r = el('div', 'node');
    r.style.setProperty('--c', s ? subjectColor(s) : 'var(--accent)');
    r.dataset.state = pct >= 67 ? 'fresh' : pct >= 40 ? 'dimming' : 'fading';
    r.style.cursor = 'default';
    r.innerHTML = `
      <span class="node-pip"></span>
      <span class="node-code">${new Date(g.ts).toLocaleDateString()}</span>
      <span class="node-title">${esc(s?.short ?? g.subjectId)} · ${esc(g.paper)} — ${esc(g.label)}</span>
      <span class="node-lvl">${g.raw}/${g.max} · ${Math.round(pct)}% · ${G.gradeFor(pct)}/7</span>`;
    const del = el('button', 'node-lvl', '×');
    del.style.cursor = 'pointer';
    del.onclick = () => {
      state.update('grades', l => l.filter(z => z.id !== g.id));
      draw();
    };
    r.append(del);
    box.append(r);
  }
  return box;
}
