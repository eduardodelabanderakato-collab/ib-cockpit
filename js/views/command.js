import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import * as ann from '../models/annunciators.js';
import { courseElapsed, paceRatio } from '../ui/pfd.js';
import { examinedNodeIds, nodesFor } from '../syllabus.js';
import { el, panel, esc, subjectColor, heatmap } from '../ui/dom.js';
import { createCockpit } from '../ui/cockpit.js';
import { commitSession } from './log.js';
import { toast } from '../ui/dom.js';

const DAY = 86400000;

let live = null;

/** Tear down the previous deck's timers before the router paints a new view. */
export function disposeCommand() {
  if (live) { live.destroy(); live = null; }
}

export function commandView(mount, ctx) {
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
  const hoursPerWeek = sessions
    .filter(s => Date.parse(s.ts) >= cutoff)
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

  disposeCommand();
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
    pedestal: buildPedestal(ctx),
  });

  // ── everything below the deck ─────────────────────────────
  mount.append(rescuePanel(index, records), activityPanel(sessions, x), crewPanel(index));
}

function buildScreens(ctx, { records, captured, fading, x, lvl }) {
  const { index } = ctx;

  // Left MFD — engine gauges, one per subject.
  const rows = index.examined.map(s => {
    const nodes = nodesFor(index, s.id);
    const pct = Math.round(mastery.subjectProgress(nodes.map(n => n.id), records) * 100);
    const cold = ann.lastTouch(s.id, nodes, records, ctx.state.get('sessions'));
    const isCold = cold === null || (Date.now() - cold) / DAY >= 10;
    return `<div class="egt-row${isCold ? ' cold' : ''}" style="--c:${subjectColor(s)}">
      <span class="egt-name">${esc(s.short)}</span>
      <span class="egt-bar"><span class="egt-fill" style="width:${pct}%"></span></span>
      <span class="egt-pct">${pct}%</span>
    </div>`;
  }).join('');

  // Centre MFD — a miniature of the territory map.
  const nav = navPreview(index, records);

  const totalNodes = examinedNodeIds(index).length;
  const capturedNodes = examinedNodeIds(index).filter(id => (records[id]?.level ?? 0) > 0).length;

  return [
    {
      tag: 'ENG', title: 'Subjects', href: '#/subjects', color: 'var(--s1)',
      big: index.examined.length, unit: '',
      sub: `${fading.length} fading · ${capturedNodes} captured`,
      extra: `<div class="egt">${rows}</div>`,
    },
    {
      tag: 'NAV', title: 'Territory', href: '#/territory', color: 'var(--accent)',
      big: Math.round(captured * 100), unit: '%',
      sub: `${capturedNodes} of ${totalNodes} nodes captured`,
      extra: `<div class="navmap">${nav}</div>`,
    },
    {
      tag: 'SYS', title: 'Systems', href: '#/log', color: 'var(--s2)',
      big: lvl.level, unit: 'LV',
      sub: `${x.total.toLocaleString()} XP · ${x.streak.current}-day streak<br>
            ${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} to next level`,
      extra: `<div class="egt"><div class="egt-row" style="--c:var(--accent-2)">
        <span class="egt-name">XP</span>
        <span class="egt-bar"><span class="egt-fill"
          style="width:${((lvl.into / lvl.need) * 100).toFixed(1)}%"></span></span>
        <span class="egt-pct">${Math.round((lvl.into / lvl.need) * 100)}%</span>
      </div></div>`,
    },
  ];
}

/** A small constellation of the six subjects, lit in proportion to capture. */
function navPreview(index, records) {
  const cx = 127, cy = 52, R = 40;
  const pts = index.examined.map((s, i) => {
    const a = (i / index.examined.length) * Math.PI * 2 - Math.PI / 2;
    const nodes = nodesFor(index, s.id);
    const pct = mastery.subjectProgress(nodes.map(n => n.id), records);
    return { s, pct, x: cx + Math.cos(a) * R * 1.7, y: cy + Math.sin(a) * R };
  });

  const links = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}"
      x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="#1F2C3A" stroke-width="1"/>`;
  }).join('');

  const dots = pts.map(p => {
    const r = 3.5 + p.pct * 7;
    const c = subjectColor(p.s);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"
      fill="${p.pct > 0 ? c : '#131C26'}" stroke="${c}" stroke-width="1.2"
      opacity="${(0.35 + p.pct * 0.65).toFixed(2)}"/>`;
  }).join('');

  return `<svg viewBox="0 0 254 104" preserveAspectRatio="xMidYMid meet">
    ${links}${dots}
    <circle cx="${cx}" cy="${cy}" r="2" fill="var(--accent)"/>
  </svg>`;
}

/** Throttle, timer and quick actions. */
function buildPedestal(ctx) {
  const { state } = ctx;
  const ped = el('div', 'pedestal');

  const target = 6; // hours per week considered full throttle
  const cutoff = Date.now() - 7 * DAY;
  const thisWeek = state.get('sessions')
    .filter(s => Date.parse(s.ts) >= cutoff)
    .reduce((a, s) => a + s.minutes, 0) / 60;
  const pctThrottle = Math.min(100, (thisWeek / target) * 100);

  const thr = el('div', 'thr');
  thr.innerHTML = `<span>Throttle</span>
    <span class="thr-track"><span class="thr-fill" style="width:${pctThrottle.toFixed(0)}%"></span></span>
    <b>${thisWeek.toFixed(1)}h</b><span>/ ${target}h wk</span>`;

  const clock = el('div', 'ped-clock mono', '00:00');
  const go = el('button', 'lever lever-go', 'Start');
  const stop = el('button', 'lever lever-stop', 'Stop & log');
  stop.disabled = true;
  stop.style.display = 'none';

  const pick = el('select', 'lever');
  for (const s of ctx.index.subjects) {
    const o = el('option', null, s.level === 'CORE' ? s.short : `${s.short} ${s.level}`);
    o.value = s.id;
    pick.append(o);
  }

  let startedAt = null, ticking = null;
  const tick = () => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${
      String(s % 60).padStart(2, '0')}`;
  };

  go.onclick = () => {
    startedAt = Date.now();
    go.style.display = 'none';
    stop.style.display = '';
    stop.disabled = false;
    clock.classList.add('running');
    tick();
    ticking = setInterval(tick, 1000);
  };

  stop.onclick = () => {
    clearInterval(ticking);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const { earned, streak } = commitSession(state, {
      subjectId: pick.value, minutes, note: '', source: 'timer',
    });
    toast(`Logged ${minutes} min <b>+${earned} XP</b> · ${streak.current}-day streak`);
    clock.classList.remove('running');
    clock.textContent = '00:00';
    stop.style.display = 'none';
    go.style.display = '';
    location.hash = '#/';
    location.reload();
  };

  const nav = el('a', 'lever', 'Full log');
  nav.href = '#/log';

  ped.append(thr, pick, clock, go, stop, nav);
  return ped;
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

function crewPanel(index) {
  const p = panel('Crew', 'briefings land in the next build');
  const strip = el('div', 'crew');
  for (const s of index.subjects) {
    const a = el('div', 'agent');
    a.style.setProperty('--c', subjectColor(s));
    a.innerHTML = `<i>${esc(s.callsign.slice(0, 2))}</i><span>${esc(s.callsign)}</span>`;
    a.title = s.name;
    strip.append(a);
  }
  p.append(strip);
  return p;
}

/**
 * The subject you have neglected longest. "Touched" means either a logged study
 * session or a captured node — capturing without logging time still counts.
 */
export function coldestSubject(index, records, sessions, now = Date.now()) {
  let coldest = null;
  for (const s of index.examined) {
    const t = ann.lastTouch(s.id, nodesFor(index, s.id), records, sessions);
    const days = t === null ? Infinity : (now - t) / DAY;
    if (!coldest || days > coldest.days) coldest = { s, days };
  }
  return coldest;
}
