import { el, esc } from './dom.js';
import { createWindshield } from './windshield.js';
import { bankAngle, pitchOffset } from './pfd.js';

const MID = 196;   // horizon line, vertical centre of the HUD
const TAPE_H = 176;

/**
 * Vertical tape (airspeed / altitude) drawn in HUD green.
 * `floor` clamps the scale so a percentage never shows negative graduations.
 */
function tape({ x, value, span, step, label, unit, align, floor = null }) {
  const parts = [];
  const dir = align === 'left' ? -1 : 1;
  const top = MID - TAPE_H / 2, bot = MID + TAPE_H / 2;

  parts.push(`<line class="stroke thin" x1="${x}" y1="${top}" x2="${x}" y2="${bot}"/>`);

  const first = Math.ceil((value - span / 2) / step) * step;
  for (let v = first; v <= value + span / 2 + 1e-9; v += step) {
    if (floor !== null && v < floor) continue;
    const y = MID - ((v - value) / span) * TAPE_H;
    if (y < top - 0.5 || y > bot + 0.5) continue;
    const major = Math.abs(v % (step * 2)) < 1e-6;
    parts.push(`<line class="stroke thin" x1="${x}" y1="${y.toFixed(1)}"
      x2="${x + dir * (major ? 12 : 6)}" y2="${y.toFixed(1)}"/>`);
    if (major) {
      parts.push(`<text x="${x + dir * 17}" y="${(y + 3.4).toFixed(1)}"
        text-anchor="${align === 'left' ? 'start' : 'end'}" class="lbl">${Math.round(v)}</text>`);
    }
  }

  const bw = 58, bx = align === 'left' ? x - bw : x;
  parts.push(`<rect class="box" x="${bx}" y="${MID - 13}" width="${bw}" height="26" rx="3"/>`);
  parts.push(`<text x="${bx + bw / 2}" y="${MID + 5}" text-anchor="middle" class="val">${
    value.toFixed(value < 100 ? 1 : 0)}</text>`);
  parts.push(`<text x="${x + dir * 4}" y="${top - 11}"
    text-anchor="${align === 'left' ? 'start' : 'end'}" class="lbl">${esc(label)}</text>`);
  parts.push(`<text x="${x + dir * 4}" y="${bot + 17}"
    text-anchor="${align === 'left' ? 'start' : 'end'}" class="lbl">${esc(unit)}</text>`);

  return parts.join('');
}

function hud({ hoursPerWeek, capturedPct, daysToExam, ratio, level, streak,
               nodesLeft, totalHours, session, cautionCount }) {
  const bank = bankAngle(ratio || 0);
  const y = MID + pitchOffset(hoursPerWeek) * 0.85;
  const behind = ratio > 0 && ratio < 0.85;

  // Pitch ladder rungs, mirrored either side of the centre gap.
  const ladder = [-66, -44, -22, 22, 44, 66].map(o => {
    const w = Math.abs(o) % 44 === 0 ? 30 : 18;
    return `<g opacity=".55">
      <line class="stroke thin" x1="${440 - w}" y1="${y + o}" x2="${440}" y2="${y + o}"/>
      <line class="stroke thin" x1="${560}" y1="${y + o}" x2="${560 + w}" y2="${y + o}"/>
    </g>`;
  }).join('');

  return `
  <svg class="hud" viewBox="0 0 1000 380" preserveAspectRatio="xMidYMid meet">
    <!-- top-left data block -->
    <text x="30" y="30" class="lbl">SESSION</text><text x="112" y="30" class="val">${esc(session)}</text>
    <text x="30" y="48" class="lbl">LEVEL</text><text x="112" y="48" class="val">${level}</text>
    <text x="30" y="66" class="lbl">STREAK</text><text x="112" y="66" class="val">${streak}D</text>

    <!-- top-right data block -->
    <text x="892" y="30" text-anchor="end" class="lbl">ETA DAYS</text>
    <text x="970" y="30" text-anchor="end" class="val">${daysToExam}</text>
    <text x="892" y="48" text-anchor="end" class="lbl">RANGE NODES</text>
    <text x="970" y="48" text-anchor="end" class="val">${nodesLeft}</text>
    <text x="892" y="66" text-anchor="end" class="lbl">FLIGHT TIME</text>
    <text x="970" y="66" text-anchor="end" class="val">${totalHours}h</text>

    <!-- mode annunciation -->
    <text x="330" y="30" class="lbl">AUTO</text>
    <text x="656" y="30" class="lbl">AP</text>
    ${cautionCount
      ? `<text x="500" y="30" text-anchor="middle" class="lbl warnf">${cautionCount} CAUTION</text>`
      : `<text x="500" y="30" text-anchor="middle" class="lbl">NOMINAL</text>`}

    <!-- attitude reference: banks with pace, pitches with study velocity.
         Split either side of the flight path marker like a real HUD. -->
    <g transform="rotate(${bank.toFixed(2)} 500 ${MID})">
      <line class="stroke" x1="366" y1="${y.toFixed(1)}" x2="452" y2="${y.toFixed(1)}"/>
      <line class="stroke" x1="548" y1="${y.toFixed(1)}" x2="634" y2="${y.toFixed(1)}"/>
      ${ladder}
    </g>

    <!-- fixed flight path marker -->
    <path class="stroke" d="M452 ${MID} h24 l24 20 l24 -20 h24" fill="none" stroke-width="2.4"/>
    <circle class="stroke" cx="500" cy="${MID}" r="2.8"/>

    ${tape({ x: 272, value: hoursPerWeek, span: 16, step: 2,
             label: 'AIRSPEED', unit: 'H/WK', align: 'left', floor: 0 })}
    ${tape({ x: 728, value: capturedPct, span: 40, step: 5,
             label: 'ALTITUDE', unit: '% CAPT', align: 'right', floor: 0 })}

    <!-- pace readout, tucked under the flight path marker -->
    <rect class="box ${behind ? 'warn' : ''}" x="440" y="${MID + 42}" width="120" height="24" rx="3"/>
    <text x="500" y="${MID + 59}" text-anchor="middle" class="val ${behind ? 'warnf' : ''}">${
      ratio > 0 ? Math.round(ratio * 100) + '% PACE' : 'PACE ---'}</text>
  </svg>`;
}

/**
 * Builds the flight deck. Returns a handle so the router can destroy the
 * windshield's timers when you navigate away.
 */
export function createCockpit(mount, model) {
  const deck = el('div', 'deck');

  // ── windshield ────────────────────────────────────────────
  const ws = el('div', 'ws');
  deck.append(ws);
  const windshield = createWindshield(ws);
  ws.insertAdjacentHTML('beforeend', hud(model.hud));
  ws.append(el('div', 'ws-roof'), el('div', 'ws-frame'), el('div', 'ws-vig'));

  // ── glareshield annunciators ─────────────────────────────
  const glare = el('div', 'glare');
  const mc = el('div', `mcaution${model.masterCaution ? ' lit' : ''}`, 'MASTER CAUTION');
  glare.append(mc);
  for (const a of model.annunciators.slice(0, 6)) {
    const b = el('a', `ann ann-${a.level}`, a.code);
    b.href = a.href;
    b.title = a.detail;
    glare.append(b);
  }
  deck.append(glare);

  // ── MFD bank ──────────────────────────────────────────────
  const mfds = el('div', 'mfds');
  for (const s of model.screens) {
    const a = el('a', 'mfd');
    a.href = s.href;
    a.style.setProperty('--mc', s.color);
    a.innerHTML = `
      <div class="mfd-h"><b>${esc(s.tag)}</b>${esc(s.title)}</div>
      <div class="mfd-big">${s.big}<small>${esc(s.unit ?? '')}</small></div>
      <div class="mfd-sub">${s.sub}</div>
      ${s.extra ?? ''}`;
    mfds.append(a);
  }
  deck.append(mfds);

  // ── control panel ─────────────────────────────────────────
  if (model.panelBank) deck.append(model.panelBank);

  // ── pedestal ──────────────────────────────────────────────
  deck.append(model.pedestal);

  // ── time-of-day scrubber ─────────────────────────────────
  const tod = el('div', 'tod');
  const label = el('b', 'mono', '');
  const range = el('input');
  range.type = 'range'; range.min = '0'; range.max = '23.9'; range.step = '0.1';
  const live = el('button', 'lever', 'Live');
  const fmt = h => `${String(Math.floor(h)).padStart(2, '0')}:${
    String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

  const syncLabel = () => { label.textContent = fmt(windshield.getTime()); };
  range.value = String(windshield.getTime());
  syncLabel();
  range.oninput = () => { windshield.setTime(Number(range.value)); syncLabel(); };
  live.onclick = () => {
    windshield.setTime(null);
    range.value = String(windshield.getTime());
    syncLabel();
  };
  tod.append(el('span', null, 'Time of day'), range, label, live);
  deck.append(tod);

  mount.append(deck);
  return { el: deck, windshield, destroy: () => windshield.destroy() };
}
