import * as mastery from '../models/mastery.js';
import { halfLivesFor } from '../models/curve.js';
import * as xp from '../models/xp.js';
import * as ann from '../models/annunciators.js';
import * as quests from '../models/quests.js';
import { courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, esc, subjectColor, toast } from '../ui/dom.js';
import { createJet, DEFAULT_HUD } from '../ui/jet.js';
import { grouped, byId } from '../ui/controls.js';
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
import * as nudge from '../models/nudge.js';
import { brief } from '../models/today.js';
import { road, RANKS } from '../models/road.js';
import { checkRank } from '../ui/celebrate.js';
import * as B from '../models/boundaries.js';
import * as store from '../store.js';
import { notebookView } from './notebook.js';

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
  book:   notebookView,
  hud:    quick.hudEntry,
  heat:   quick.heatReadout,
  avg:    quick.avgReadout,
  proj:   gradesView,
  road:   quick.roadView,
  tests:  quick.testsReadout,
  assign: quick.assignReadout,
  fade:   quick.fadeReadout,
  today:  quick.todayView,
  terms:  quick.termsReadout,
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

  const hl = halfLivesFor(state.get('checks'));
  const ids = examinedNodeIds(index);
  const captured = mastery.subjectProgress(ids, records, Date.now(), hl);
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
  const fading = mastery.rescueQueue(ids, records, Date.now(), hl);

  disposeDeck();

  const hudData = {
    hoursPerWeek, capturedPct: captured * 100, daysToExam, ratio,
    level: lvl.level, streak: x.streak.current,
    nodesLeft: ids.length - capturedNodes, totalHours, cautionCount: cautions,
  };

  const screens = jetScreens(ctx, { records, captured, fading, x, ids, capturedNodes,
                                    sessions, deadlines, hl, expected });

  live = createJet(mount, {
    hud: hudData,
    hudFields: state.get('settings').hudFields ?? DEFAULT_HUD,
    hudCustom: state.get('settings').hudCustom ?? [],
    screens,
    groups: grouped(index),
    annunciators: captions,
    masterCaution: ann.masterCaution(captions),
    status: controlStatus(ctx, { records, sessions, fading, x, deadlines, ratio }),
    timeOverride: null,
  });

  // Below the cockpit, a real control surface for narrow screens. The bezel
  // keys are 8mm on a phone; hiding them left no way to log after a lesson.
  mount.append(buildTouchPanel(ctx,
    controlStatus(ctx, { records, sessions, fading, x, deadlines, ratio })));

  mountMCDU(live.el);

  // A rank is the only thing here worth interrupting for, and only on the way
  // up. Deferred a beat so it lands on a drawn cockpit, not a blank one.
  const board = screens.board;
  if (board) setTimeout(() => {
    const name = checkRank({
      rank: board.rank, held: board.held, ranks: RANKS,
      lastRank: state.get('settings').lastRank ?? null,
    });
    if (name && name !== state.get('settings').lastRank) {
      state.update('settings', st => { st.lastRank = name; });
    }
  }, 700);
  offerBackup(ctx, sessions);
  if (openId) press(ctx, openId);
}

/**
 * A backup offer, on a schedule rather than a permanent nag. An amber LED is a
 * reminder; this is the thing that actually saves two years of work.
 */
function offerBackup(ctx, sessions) {
  const { state } = ctx;
  const settings = state.get('settings');
  if (!nudge.backupDue({ backupLastAt: settings.backupLastAt,
                         sessionCount: sessions.length })) return;
  if (settings.backupDismissedDay === xp.localDay()) return;

  const age = nudge.backupAge({ backupLastAt: settings.backupLastAt });
  const bar = el('div', 'backup-offer');
  bar.innerHTML = `<span><b>Back up your data.</b> ${
    age === null
      ? `Nothing has ever been exported, and ${sessions.length} sessions live only in this browser.`
      : `Last export was ${age} days ago.`}</span>`;

  const go = el('button', 'chip chip-primary', 'Download backup');
  go.onclick = () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ib-cockpit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    state.update('settings', st => { st.backupLastAt = new Date().toISOString(); });
    toast('Backup downloaded');
    bar.remove();
  };
  const later = el('button', 'chip', 'Not now');
  later.onclick = () => {
    state.update('settings', st => { st.backupDismissedDay = xp.localDay(); });
    bar.remove();
  };
  bar.append(go, later);
  document.body.append(bar);
}

/* ── touch panel: the phone's version of the bezel ─────────── */

function buildTouchPanel(ctx, status) {
  const { index } = ctx;
  const bank = el('div', 'touchpanel');

  for (const g of grouped(index)) {
    const box = el('div', 'tp-group');
    box.append(el('p', 'tp-label', g.group));
    const row = el('div', 'tp-keys');
    for (const c of g.controls) {
      const st = status.get(c.id);
      const b = el('button', 'tp-key');
      b.type = 'button';
      b.dataset.control = c.id;
      if (c.subject) b.style.setProperty('--c',
        c.subject.colorKey === 'accent' ? 'var(--accent)' : `var(--${c.subject.colorKey})`);
      b.innerHTML = `<span class="tp-code">${esc(c.code)}</span>
        <span class="tp-name">${esc(c.name)}</span>
        ${st ? `<span class="tp-note ${st.level}">${esc(st.note)}</span>` : ''}`;
      b.onclick = () => { location.hash = `#/${c.id}`; };
      row.append(b);
    }
    box.append(row);
    bank.append(box);
  }
  return bank;
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

/** Upper-case and truncate for the small MFD screens. */
function clip(v, n) {
  const t = String(v ?? '').toUpperCase();
  return t.length > n ? t.slice(0, n - 1) + '\u2026' : t;
}

function jetScreens(ctx, extra) {
  const { index } = ctx;
  const { records, captured, fading, x, ids, capturedNodes } = extra;

  const bars = index.examined.map(s2 => {
    const pct = Math.round(mastery.subjectProgress(
      nodesFor(index, s2.id).map(n => n.id), records) * 100);
    return `<div class="bar" style="--c:${subjectColor(s2)}"><i style="width:${pct}%"></i></div>`;
  }).join('');

  // The centre screen answers the only question that changes behaviour.
  const settings = ctx.state.get('settings');
  const r45 = road({
    subjects: index.examined,
    grades: ctx.state.get('grades'),
    tok: settings.tokGrade ?? null,
    ee: settings.eeGrade ?? null,
    boundaries: B.table(settings, index.examined),
    target: ctx.state.get('meta').targetPoints ?? 45,
  });

  const today = brief({
    index, records, sessions: extra.sessions, deadlines: extra.deadlines,
    questState: ctx.state.get('quests'), checks: ctx.state.get('checks'),
    halfLives: extra.hl, expected: extra.expected,
    budget: ctx.state.get('settings').dailyBudget ?? 60,
  });

  const screens = [
    { slot: 'l', tag: 'ENG', title: 'Engines — subject capture', opens: 'pace',
      big: `${Math.round(captured * 100)}`, unit: '%',
      sub: `${fading.length} FADING`, bars },
    { slot: 'c', tag: 'TODAY', title: today.headline, opens: 'today',
      big: today.done ? '\u2713' : `${today.items.length}`,
      unit: today.done ? '' : 'TO DO',
      sub: `${clip(today.headline, 32)}<br>${today.minutes} MIN PLANNED` },
    // The right screen is the game board: the score, and the rank it earns.
    { slot: 'r', tag: 'ROAD', title: `Road to 45 — ${r45.rank.name}`, opens: 'road',
      big: `${r45.held}`, unit: '/45',
      sub: `${r45.rank.name.toUpperCase()}<br>${r45.rank.next
        ? `+${r45.rank.toNext} FOR ${r45.rank.next.name.toUpperCase()}`
        : `${x.streak.current}D STREAK`}`,
      bars: `<div class="bar" style="--c:#7CFFC4"><i style="width:${
        ((r45.held / 45) * 100).toFixed(1)}%"></i></div>` },
  ];
  screens.board = r45;
  return screens;
}


/* ── pedestal: throttle only; the timer lives on the panel ── */

