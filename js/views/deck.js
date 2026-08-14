import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import * as ann from '../models/annunciators.js';
import * as quests from '../models/quests.js';
import { courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, esc, subjectColor, toast } from '../ui/dom.js';
import { createJet, DEFAULT_HUD } from '../ui/jet.js';
import { grouped, byId, allControls } from '../ui/controls.js';
import { mountMCDU, open as openMCDU, close as closeMCDU } from '../ui/mcdu.js';
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

  const hudData = {
    hoursPerWeek, capturedPct: captured * 100, daysToExam, ratio,
    level: lvl.level, streak: x.streak.current,
    nodesLeft: ids.length - capturedNodes, totalHours, cautionCount: cautions,
  };

  live = createJet(mount, {
    hud: hudData,
    hudFields: state.get('settings').hudFields ?? DEFAULT_HUD,
    screens: jetScreens(ctx, { records, captured, fading, x, lvl, ids, capturedNodes }),
    controls: allControls(index),
    status: controlStatus(ctx, { records, sessions, fading, x, deadlines, ratio }),
    timeOverride: null,
  });

  mountMCDU(live.el);
  if (openId) press(ctx, openId);
}

/* ── the control panel ────────────────────────────────────── */


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

  for (const b of document.querySelectorAll('.jkey')) b.removeAttribute('aria-current');
  const btn = document.querySelector(`.jkey[data-control="${CSS.escape(id)}"]`);
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

function jetScreens(ctx, { records, captured, fading, x, lvl, ids, capturedNodes }) {
  const { index } = ctx;

  const bars = index.examined.map(s2 => {
    const pct = Math.round(mastery.subjectProgress(
      nodesFor(index, s2.id).map(n => n.id), records) * 100);
    return `<div class="bar" style="--c:${subjectColor(s2)}"><i style="width:${pct}%"></i></div>`;
  }).join('');

  return [
    { slot: 'l', tag: 'ENG', title: 'Engines — subject capture', opens: 'pace',
      big: `${Math.round(captured * 100)}`, unit: '%',
      sub: `${fading.length} FADING`, bars },
    { slot: 'c', tag: 'NAV', title: 'Navigation — territory', opens: 'map',
      big: `${capturedNodes}`, unit: '',
      sub: `OF ${ids.length} NODES<br>${index.examined.length} SUBJECTS` },
    { slot: 'r', tag: 'SYS', title: 'Systems — level and streak', opens: 'xp',
      big: `${lvl.level}`, unit: 'LV',
      sub: `${x.total.toLocaleString()} XP<br>${x.streak.current}D STREAK`,
      bars: `<div class="bar" style="--c:#7CFFC4"><i style="width:${
        ((lvl.into / lvl.need) * 100).toFixed(1)}%"></i></div>` },
  ];
}


/* ── pedestal: throttle only; the timer lives on the panel ── */

