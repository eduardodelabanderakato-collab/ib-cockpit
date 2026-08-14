import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import { renderPFD, courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, panel, esc, subjectColor, heatmap } from '../ui/dom.js';
import { subjectGauges } from './subject.js';

const DAY = 86400000;

export function commandView(mount, ctx) {
  const { index, state } = ctx;
  const records = state.get('mastery');
  const sessions = state.get('sessions');
  const x = state.get('xp');

  const ids = examinedNodeIds(index);
  const captured = mastery.subjectProgress(ids, records);
  const expected = courseElapsed(index.dpStart, index.examStart);
  const daysToExam = Math.max(0, Math.ceil((Date.parse(index.examStart) - Date.now()) / DAY));

  const cutoff = Date.now() - 28 * DAY;
  const hoursPerWeek = sessions
    .filter(s => Date.parse(s.ts) >= cutoff)
    .reduce((a, s) => a + s.minutes, 0) / 60 / 4;

  // ── primary flight display ────────────────────────────────
  const pfd = panel('Primary flight display');
  pfd.insertAdjacentHTML('beforeend',
    renderPFD({ captured, expected, hoursPerWeek, daysToExam }));
  mount.append(pfd);

  // ── xp rail ───────────────────────────────────────────────
  const lvl = xp.levelFromXp(x.total);
  const rail = el('div', 'panel');
  rail.innerHTML = `
    <div class="xp">
      <span class="xp-lvl">LEVEL<b>${lvl.level}</b></span>
      <div class="xp-track"><div class="xp-fill" style="width:${(lvl.into / lvl.need) * 100}%"></div></div>
      <span class="xp-num">${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} XP
        · ${x.total.toLocaleString()} total</span>
    </div>`;
  mount.append(rail);

  // ── master caution ────────────────────────────────────────
  mount.append(coachPanel(index, records, sessions, captured, expected));

  // ── engine gauges ─────────────────────────────────────────
  mount.append(subjectGauges(ctx));

  // ── rescue queue + heatmap ────────────────────────────────
  const lower = el('div', 'grid-2');
  lower.append(rescuePanel(index, records), activityPanel(sessions, x));
  mount.append(lower);

  // ── crew ──────────────────────────────────────────────────
  const crew = panel('Crew', 'brief them in Claude');
  const strip = el('div', 'crew');
  for (const s of index.subjects) {
    const a = el('div', 'agent');
    a.style.setProperty('--c', subjectColor(s));
    a.innerHTML = `<i>${esc(s.callsign.slice(0, 2))}</i><span>${esc(s.callsign)}</span>`;
    a.title = `${s.name} — briefing arrives in Plan 2`;
    strip.append(a);
  }
  crew.append(strip);
  mount.append(crew);
}

/** Brutally honest, as specified: worst true thing first. */
function coachPanel(index, records, sessions, captured, expected) {
  const p = el('div', 'alert');
  const lines = [];

  const fading = mastery.rescueQueue(examinedNodeIds(index), records);
  if (fading.length) {
    const worst = index.byId.get(fading[0].id);
    lines.push(`<b>${fading.length} topic${fading.length > 1 ? 's are' : ' is'} fading.</b>
      ${esc(worst.title)} hasn't been touched in ${Math.round(fading[0].days)} days.`);
  }

  const coldest = coldestSubject(index, records, sessions);
  if (coldest && coldest.days > 7) {
    lines.push(coldest.days === Infinity
      ? `<b>You have never touched ${esc(coldest.s.short)}.</b>`
      : `<b>You haven't opened ${esc(coldest.s.short)} in ${Math.round(coldest.days)} days.</b>`);
  }

  const ratio = paceRatio(captured, expected);
  if (expected > 0 && ratio < 0.95) {
    lines.push(`You are <b>${Math.round((1 - ratio) * 100)}% behind pace</b> for this point in the DP.`);
  }

  if (!lines.length) {
    p.classList.add('ok');
    p.innerHTML = `<div class="alert-t"><b>On pace. Nothing is fading.</b>
      <span>Keep flying.</span></div>`;
    return p;
  }

  p.innerHTML = `<div class="alert-t">${lines.join(' ')}</div>`;
  return p;
}

/**
 * The subject you have neglected longest. "Touched" means either a logged study
 * session or a captured node — capturing without logging time still counts.
 */
export function coldestSubject(index, records, sessions, now = Date.now()) {
  let coldest = null;
  for (const s of index.examined) {
    let latest = 0;
    for (const v of sessions) {
      if (v.subjectId === s.id) latest = Math.max(latest, Date.parse(v.ts));
    }
    for (const n of nodesFor(index, s.id)) {
      const t = records[n.id]?.lastTouched;
      if (t) latest = Math.max(latest, Date.parse(t));
    }
    const days = latest ? (now - latest) / DAY : Infinity;
    if (!coldest || days > coldest.days) coldest = { s, days };
  }
  return coldest;
}

function rescuePanel(index, records) {
  const p = panel('Rescue queue', 'decaying fastest');
  const queue = mastery.rescueQueue(examinedNodeIds(index), records).slice(0, 8);

  if (!queue.length) {
    p.append(el('p', 'empty', 'Nothing is fading. Capture some nodes and come back in a week.'));
    return p;
  }

  for (const item of queue) {
    const n = index.byId.get(item.id);
    const s = index.subjects.find(v => v.id === n.subjectId);
    const a = el('a', 'node');
    a.href = `#/subject/${n.subjectId}`;
    a.dataset.state = 'fading';
    a.style.setProperty('--c', subjectColor(s));
    a.style.textDecoration = 'none';
    a.innerHTML = `
      <span class="node-pip"></span>
      <span class="node-code">${esc(n.code)}</span>
      <span class="node-title">${esc(n.title)}</span>
      <span class="node-lvl">${Math.round(item.days)}d</span>`;
    p.append(a);
  }
  return p;
}

function activityPanel(sessions, x) {
  const p = panel('Study heatmap', '45 weeks');
  p.insertAdjacentHTML('beforeend', heatmap(sessions, 45));
  const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
  const todayMin = sessions
    .filter(s => xp.localDay(new Date(s.ts)) === xp.localDay())
    .reduce((a, s) => a + s.minutes, 0);
  const st = el('div', 'streak');
  st.innerHTML = `<b>${x.streak.current}</b><span>day streak · longest ${x.streak.longest}
    · ${(totalMin / 60).toFixed(1)}h total · ${todayMin}m today</span>`;
  p.append(st);
  return p;
}
