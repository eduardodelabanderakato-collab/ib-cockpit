import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import * as ann from '../models/annunciators.js';
import * as quests from '../models/quests.js';
import { courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, esc, subjectColor, toast } from '../ui/dom.js';
import { createCockpit } from '../ui/cockpit.js';
import { grouped, byId } from '../ui/controls.js';
import { mountMCDU, controlButton, open as openMCDU, close as closeMCDU } from '../ui/mcdu.js';
import { commitSession } from './log.js';
import * as quick from './quick.js';
import { subjectDetailView } from './subject.js';
import { territoryView } from './territory.js';
import { questsView } from './quests.js';
import { deadlinesView } from './deadlines.js';
import { plannerView } from './planner.js';
import { crewView } from './crew.js';
import { resourcesView } from './resources.js';
import { settingsView } from './settings.js';
import { gradesView } from './grades.js';

const DAY = 86400000;
let live = null;

export function disposeDeck() {
  if (live) { live.destroy(); live = null; }
}

/** Which control opens which screen. Everything renders inside the MCDU. */
const RENDERERS = {
  log:    quick.logEntry,
  score:  quick.scoreEntry,
  due:    quick.dueEntry,
  note:   quick.noteEntry,
  heat:   quick.heatReadout,
  avg:    quick.avgReadout,
  proj:   gradesView,
  tests:  quick.testsReadout,
  assign: quick.assignReadout,
  fade:   quick.fadeReadout,
  xp:     quick.xpReadout,
  pace:   quick.paceReadout,
  map:    territoryView,
  quests: questsView,
  plan:   plannerView,
  fpln:   deadlinesView,
  crew:   crewView,
  lib:    resourcesView,
  cfg:    settingsView,
  bkup:   settingsView,
};

/**
 * The whole application. One screen: the flight deck. Controls open the MCDU
 * over the lower half; nothing is ever replaced.
 */
export function deckView(mount, ctx, openId = null) {
  const { index, state } = ctx;
  const records = state.get('mastery');
  const sessions = state.get('sessions');
  const deadlines = state.get('deadlines');
  const x = state.get('xp');

  const ids = examinedNodeIds(index);
  const captured = mastery.subjectProgress(ids, records);
  const expected = courseElapsed(index.dpStart, index.examStart);
  const ratio = paceRatio(captured, expected);
  const daysToExam = Math.max(0, Math.ceil((Date.parse(index.examStart) - Date.now()) / DAY));

  const cutoff = Date.now() - 28 * DAY;
  const hoursPerWeek = sessions.filter(s => Date.parse(s.ts) >= cutoff)
    .reduce((a, s) => a + s.minutes, 0) / 60 / 4;
  const totalHours = Math.round(sessions.reduce((a, s) => a + s.minutes, 0) / 60);

  const nodesBySubject = {};
  for (const s of index.subjects) nodesBySubject[s.id] = nodesFor(index, s.id);

  const captions = ann.build({
    subjects: index.examined, nodesBySubject, records, sessions, deadlines,
    paceRatio: ratio, streak: x.streak,
  });
  const cautions = captions.filter(a => a.level === 'warning' || a.level === 'caution').length;
  const lvl = xp.levelFromXp(x.total);
  const capturedNodes = ids.filter(id => (records[id]?.level ?? 0) > 0).length;
  const fading = mastery.rescueQueue(ids, records);

  disposeDeck();
  live = createCockpit(mount, {
    hud: {
      hoursPerWeek, capturedPct: captured * 100, daysToExam, ratio,
      level: lvl.level, streak: x.streak.current,
      nodesLeft: ids.length - capturedNodes, totalHours,
      session: 'M28', cautionCount: cautions,
    },
    masterCaution: ann.masterCaution(captions),
    annunciators: captions,
    screens: buildScreens(ctx, { records, captured, fading, x, lvl }),
    panelBank: buildPanel(ctx, { records, sessions, fading, x, deadlines, ratio }),
    pedestal: buildPedestal(ctx),
  });

  mountMCDU(live.el);
  if (openId) press(ctx, openId);
}

/* ── the control panel ────────────────────────────────────── */

function buildPanel(ctx, s) {
  const { index } = ctx;
  const status = controlStatus(ctx, s);
  const bank = el('div', 'panelbank');

  for (const g of grouped(index)) {
    const box = el('div', 'pgroup');
    box.append(el('p', 'pgroup-label', g.group));
    const row = el('div', 'ctls');
    for (const c of g.controls) {
      const b = controlButton(c, status.get(c.id));
      b.onclick = () => { location.hash = `#/${c.id}`; };
      row.append(b);
    }
    box.append(row);
    bank.append(box);
  }
  return bank;
}

/** Which controls should have a lit LED, and what it says. */
function controlStatus(ctx, { records, sessions, fading, x, deadlines, ratio }) {
  const { index, state } = ctx;
  const now = Date.now();
  const m = new Map();

  if (fading.length) m.set('fade', { level: 'caution', note: `${fading.length}` });

  const soon = deadlines.filter(d => d.status !== 'done'
    && (Date.parse(d.due) - now) / DAY <= 14);
  const isTest = d => /test|mock|exam|paper|quiz/i.test(d.title);
  const t = soon.filter(isTest), a = soon.filter(d => !isTest(d));
  if (t.length) m.set('tests', { level: 'caution', note: `${t.length} soon` });
  if (a.length) m.set('assign', { level: 'caution', note: `${a.length} soon` });
  if (soon.some(d => Date.parse(d.due) < now)) m.set('fpln', { level: 'warning', note: 'overdue' });

  const q = state.get('quests');
  const openQ = [...(q.daily ?? []), ...(q.weekly ?? [])]
    .filter(z => !quests.isComplete(z, { sessions, records, now }));
  if (openQ.length) m.set('quests', { level: 'advisory', note: `${openQ.length} open` });

  if (!state.get('grades').length) m.set('avg', { level: 'advisory', note: 'no data' });
  if (ratio > 0 && ratio < 0.85) m.set('pace', { level: 'caution', note: 'behind' });

  const last = sessions.at(-1);
  if (!last || (now - Date.parse(last.ts)) / DAY >= 1) {
    m.set('log', { level: 'advisory', note: 'nothing today' });
  }

  const backup = state.get('settings').backupLastAt;
  if (!backup || (now - Date.parse(backup)) / DAY > 7) {
    m.set('bkup', { level: 'caution', note: 'overdue' });
  }

  for (const s of index.examined) {
    const t2 = ann.lastTouch(s.id, nodesFor(index, s.id), records, sessions);
    if (t2 === null || (now - t2) / DAY >= 10) {
      m.set(`subject:${s.id}`, { level: 'caution', note: 'cold' });
    }
  }
  return m;
}

/* ── pressing a control ───────────────────────────────────── */

export function press(ctx, id) {
  const { index } = ctx;
  const control = byId(index, id);
  if (!control) { closeMCDU(); return; }

  for (const b of document.querySelectorAll('.ctl')) b.removeAttribute('aria-current');
  const btn = [...document.querySelectorAll('.ctl')]
    .find(b => b.getAttribute('aria-label')?.startsWith(control.name + ':'));
  if (btn) btn.setAttribute('aria-current', 'page');

  if (control.id === 'timer') { openMCDU(control, body => timerScreen(body, ctx)); return; }

  if (control.kind === 'engine') {
    openMCDU(control, body => subjectDetailView(body, ctx, { id: control.subject.id }));
    return;
  }

  const render = RENDERERS[control.id];
  if (!render) { openMCDU(control, body => body.append(el('p', 'empty', 'Not wired yet.'))); return; }
  openMCDU(control, body => render(body, ctx));
}

/* ── the focus timer, as its own screen ───────────────────── */

function timerScreen(mount, ctx) {
  const { index, state } = ctx;
  const box = el('div', 'panel');
  box.innerHTML = '<p class="panel-h">Focus timer</p>';

  const pick = el('select', 'chip field');
  for (const s of index.subjects) {
    const o = el('option', null, s.level === 'CORE' ? s.short : `${s.short} ${s.level}`);
    o.value = s.id; pick.append(o);
  }
  const note = el('input', 'chip field row-grow');
  note.type = 'text'; note.placeholder = 'What are you working on?';

  const clock = el('div', 'timer-readout mono', '00:00');
  const go = el('button', 'chip chip-primary', 'Start');
  const stop = el('button', 'chip', 'Stop & log');
  stop.style.display = 'none';

  let startedAt = null, ticking = null;
  const tick = () => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  go.onclick = () => {
    startedAt = Date.now();
    go.style.display = 'none'; stop.style.display = '';
    clock.classList.add('running'); tick();
    ticking = setInterval(tick, 1000);
  };
  stop.onclick = () => {
    clearInterval(ticking);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const { earned, streak } = commitSession(state, {
      subjectId: pick.value, minutes, note: note.value.trim(), source: 'timer',
    });
    toast(`Logged ${minutes} min <b>+${earned} XP</b> · ${streak.current}-day streak`);
    clock.classList.remove('running'); clock.textContent = '00:00';
    stop.style.display = 'none'; go.style.display = '';
    note.value = '';
  };

  const r1 = el('div', 'row'); r1.append(pick, note);
  const r2 = el('div', 'row'); r2.append(go, stop);
  box.append(r1, clock, r2);
  mount.append(box);
}

/* ── the three MFD screens ────────────────────────────────── */

function buildScreens(ctx, { records, captured, fading, x, lvl }) {
  const { index } = ctx;
  const rows = index.examined.map(s => {
    const nodes = nodesFor(index, s.id);
    const pct = Math.round(mastery.subjectProgress(nodes.map(n => n.id), records) * 100);
    const cold = ann.lastTouch(s.id, nodes, records, ctx.state.get('sessions'));
    const isCold = cold === null || (Date.now() - cold) / DAY >= 10;
    return `<div class="egt-row${isCold ? ' cold' : ''}" style="--c:${subjectColor(s)}">
      <span class="egt-name">${esc(s.short)}</span>
      <span class="egt-bar"><span class="egt-fill" style="width:${pct}%"></span></span>
      <span class="egt-pct">${pct}%</span></div>`;
  }).join('');

  const ids = examinedNodeIds(index);
  const capturedNodes = ids.filter(id => (records[id]?.level ?? 0) > 0).length;

  return [
    { tag: 'ENG', title: 'Engines', href: '#/pace', color: 'var(--s1)',
      big: index.examined.length, unit: '',
      sub: `${fading.length} fading · ${capturedNodes} captured`,
      extra: `<div class="egt">${rows}</div>` },
    { tag: 'NAV', title: 'Territory', href: '#/map', color: 'var(--accent)',
      big: Math.round(captured * 100), unit: '%',
      sub: `${capturedNodes} of ${ids.length} nodes captured`,
      extra: `<div class="navmap">${navPreview(index, records)}</div>` },
    { tag: 'SYS', title: 'Systems', href: '#/xp', color: 'var(--s2)',
      big: lvl.level, unit: 'LV',
      sub: `${x.total.toLocaleString()} XP · ${x.streak.current}-day streak<br>
            ${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} to next`,
      extra: `<div class="egt"><div class="egt-row" style="--c:var(--accent-2)">
        <span class="egt-name">XP</span>
        <span class="egt-bar"><span class="egt-fill"
          style="width:${((lvl.into / lvl.need) * 100).toFixed(1)}%"></span></span>
        <span class="egt-pct">${Math.round((lvl.into / lvl.need) * 100)}%</span></div></div>` },
  ];
}

function navPreview(index, records) {
  const cx = 127, cy = 52, R = 40;
  const pts = index.examined.map((s, i) => {
    const a = (i / index.examined.length) * Math.PI * 2 - Math.PI / 2;
    const pct = mastery.subjectProgress(nodesFor(index, s.id).map(n => n.id), records);
    return { s, pct, x: cx + Math.cos(a) * R * 1.7, y: cy + Math.sin(a) * R };
  });
  const links = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}"
      y2="${q.y.toFixed(1)}" stroke="#1F2C3A" stroke-width="1"/>`;
  }).join('');
  const dots = pts.map(p => {
    const c = subjectColor(p.s);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(3.5 + p.pct * 7).toFixed(1)}"
      fill="${p.pct > 0 ? c : '#131C26'}" stroke="${c}" stroke-width="1.2"
      opacity="${(0.35 + p.pct * 0.65).toFixed(2)}"/>`;
  }).join('');
  return `<svg viewBox="0 0 254 104" preserveAspectRatio="xMidYMid meet">${links}${dots}
    <circle cx="${cx}" cy="${cy}" r="2" fill="var(--accent)"/></svg>`;
}

/* ── pedestal: throttle only; the timer lives on the panel ── */

function buildPedestal(ctx) {
  const { state } = ctx;
  const ped = el('div', 'pedestal');
  const target = 6;
  const cutoff = Date.now() - 7 * DAY;
  const week = state.get('sessions').filter(s => Date.parse(s.ts) >= cutoff)
    .reduce((a, s) => a + s.minutes, 0) / 60;

  const thr = el('div', 'thr');
  thr.innerHTML = `<span>Throttle</span>
    <span class="thr-track"><span class="thr-fill"
      style="width:${Math.min(100, (week / target) * 100).toFixed(0)}%"></span></span>
    <b>${week.toFixed(1)}h</b><span>/ ${target}h wk</span>`;

  const quickRow = el('div', 'row');
  for (const [id, label] of [['timer', 'Start timer'], ['log', 'Log session'], ['score', 'Add score']]) {
    const a = el('a', 'lever' + (id === 'timer' ? ' lever-go' : ''), label);
    a.href = `#/${id}`;
    quickRow.append(a);
  }
  ped.append(thr, quickRow);
  return ped;
}
