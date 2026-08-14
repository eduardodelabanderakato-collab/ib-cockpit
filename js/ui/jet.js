import { el, esc } from './dom.js';
import { createStage } from './stage.js';
import {
  hoursOf, paletteFor, sunPosition, moonPosition, starOpacity,
  birdsActive, starField, cloudBand,
} from './sky.js';
import { bankAngle, pitchOffset } from './pfd.js';

/**
 * The jet.
 *
 * A photoreal cockpit shell with everything live projected into it:
 * time-of-day effects on the canopy glass, HUD symbology on the combiner,
 * real data in the three MFDs, and labelled keys on the bezel rails.
 */

/* Bezel key rails, measured against the shell image. Each rail is a column or
   row of slots; controls are dealt into them in order. */
export const RAILS = [
  // left MFD — outer column, inner column
  { x: 31.05, y: 57.8, w: 2.5, h: 3.3, gap: 0.42, n: 5, dir: 'v' },
  { x: 43.35, y: 57.8, w: 2.5, h: 3.3, gap: 0.42, n: 5, dir: 'v' },
  // centre MFD — outer columns
  { x: 41.9,  y: 57.8, w: 2.5, h: 3.3, gap: 0.42, n: 5, dir: 'v', skip: true },
  // right MFD
  { x: 54.0,  y: 57.8, w: 2.5, h: 3.3, gap: 0.42, n: 5, dir: 'v' },
  { x: 66.4,  y: 57.8, w: 2.5, h: 3.3, gap: 0.42, n: 5, dir: 'v' },
  // top rail above the three screens
  { x: 34.4,  y: 53.2, w: 3.0, h: 2.6, gap: 0.5,  n: 9, dir: 'h' },
  // bottom rail beneath the three screens
  { x: 34.4,  y: 80.2, w: 3.0, h: 2.6, gap: 0.5,  n: 9, dir: 'h' },
];

/** Deal controls into rail slots, left rails first. */
export function slots() {
  const out = [];
  for (const r of RAILS) {
    if (r.skip) continue;
    for (let i = 0; i < r.n; i++) {
      out.push(r.dir === 'v'
        ? { x: r.x, y: r.y + i * (r.h + r.gap), w: r.w, h: r.h }
        : { x: r.x + i * (r.w + r.gap), y: r.y, w: r.w, h: r.h });
    }
  }
  return out;
}

export function createJet(mount, model) {
  const stage = el('div', 'stage');

  // 1 · airframe
  const shell = el('div', 'jet-shell');
  shell.dataset.depth = 'shell';
  stage.append(shell);

  // 2 · canopy sky effects
  const sky = el('div', 'jet-sky');
  sky.dataset.depth = 'sky';
  sky.innerHTML = `
    <div class="jet-tint"></div>
    <div class="jet-glow"></div>
    <div class="jet-stars"></div>
    <div class="jet-sun"></div>
    <div class="jet-drift" style="--drift:150s"></div>
    <div class="jet-drift" style="--drift:64s;height:52%;opacity:.2"></div>
    <div class="jet-traffic"></div>`;
  stage.append(sky);
  sky.querySelector('.jet-stars').style.backgroundImage = starField(240, 11);
  sky.querySelectorAll('.jet-drift')[0].style.backgroundImage = cloudBand(5, 16, 0.5);
  sky.querySelectorAll('.jet-drift')[1].style.backgroundImage = cloudBand(23, 10, 0.34);

  // 3 · HUD on the combiner glass
  const hud = el('div', 'jet-hud');
  hud.dataset.depth = 'hud';
  hud.innerHTML = renderHUD(model.hud, model.hudFields);
  stage.append(hud);

  // 4 · live MFDs
  const mfds = el('div');
  mfds.dataset.depth = 'panel';
  for (const s of model.screens) {
    const d = el('div', `jet-mfd mfd-${s.slot}`);
    d.innerHTML = `<h4>${esc(s.tag)}</h4>
      <div class="big">${s.big}<span style="font-size:.5em">${esc(s.unit ?? '')}</span></div>
      <div class="sub">${s.sub}</div>
      ${s.bars ? `<div class="bars">${s.bars}</div>` : ''}`;
    d.title = s.title;
    d.onclick = () => { location.hash = `#/${s.opens}`; };
    mfds.append(d);
  }
  stage.append(mfds);

  // 5 · bezel keys
  const keys = el('div', 'jet-keys');
  keys.dataset.depth = 'panel';
  const positions = slots();
  model.controls.forEach((c, i) => {
    const p = positions[i];
    if (!p) return;
    const st = model.status.get(c.id);
    const b = el('button', 'jkey');
    b.type = 'button';
    b.style.cssText = `left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%`;
    b.dataset.tip = st ? `${c.name} — ${c.tip} (${st.note})` : `${c.name} — ${c.tip}`;
    b.setAttribute('aria-label', `${c.name}: ${c.tip}`);
    b.dataset.control = c.id;
    b.innerHTML = `${esc(c.code)}<span class="jled${st ? ' ' + st.level : ''}"></span>`;
    b.onclick = () => {
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 130);
      location.hash = `#/${c.id}`;
    };
    keys.append(b);
  });
  stage.append(keys);

  const hint = el('div', 'jet-hint', 'Move to look around · press a key');
  stage.append(hint);

  mount.append(stage);

  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const look = createStage(stage, { reduced });
  stage.addEventListener('pointerdown', () => stage.classList.add('touched'), { once: true });
  stage.addEventListener('pointermove', () => stage.classList.add('touched'), { once: true });

  const paint = () => paintSky(sky, model.timeOverride);
  paint();
  const timer = setInterval(paint, 15000);

  const spawn = () => {
    if (reduced || document.hidden) return;
    const h = model.timeOverride ?? hoursOf();
    if (!birdsActive(h) || Math.random() > 0.5) return;
    const n = el('div', 'flyby bird');
    n.innerHTML = `<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <path class="w1" d="M10 20 q8 -8 16 0 q8 -8 16 0"/>
        <path class="w2" d="M52 26 q7 -7 14 0 q7 -7 14 0"/>
        <path class="w3" d="M88 16 q6 -6 12 0 q6 -6 12 0"/></g></svg>`;
    n.style.top = `${18 + Math.random() * 36}%`;
    n.style.setProperty('--scale', (0.3 + Math.random() * 0.5).toFixed(2));
    n.style.setProperty('--dur', `${14 + Math.random() * 12}s`);
    n.style.setProperty('--rise', `${(Math.random() * 6 - 3).toFixed(1)}vh`);
    n.addEventListener('animationend', () => n.remove(), { once: true });
    sky.querySelector('.jet-traffic').append(n);
  };
  const spawner = reduced ? null : setInterval(spawn, 11000);

  return {
    el: stage,
    look,
    repaintSky: paint,
    destroy() {
      clearInterval(timer);
      if (spawner) clearInterval(spawner);
      look.destroy();
      stage.remove();
    },
  };
}

/** Recolour the photographic sky for the hour rather than replacing it. */
function paintSky(sky, override) {
  const h = override ?? hoursOf();
  const p = paletteFor(h);
  const sun = sunPosition(h);
  const moon = moonPosition(h);
  const body = sun.visible ? sun : moon;

  // The photo already has a good sky. Tint it toward the hour rather than
  // repainting it — heavy multiply turns midday into a bruise.
  sky.querySelector('.jet-tint').style.background =
    `linear-gradient(to bottom, ${p.zenith} 0%, ${p.upper} 45%, ${p.horizon} 100%)`;
  sky.querySelector('.jet-tint').style.opacity =
    (0.18 + 0.34 * (1 - Math.min(1, Math.max(0, (sun.alt + 1) / 2)))).toFixed(3);

  sky.querySelector('.jet-glow').style.background =
    `radial-gradient(90% 60% at ${(body.x * 100).toFixed(1)}% ${(body.y * 100).toFixed(1)}%,
      color-mix(in srgb, ${p.glow} 60%, transparent) 0%, transparent 58%)`;
  sky.querySelector('.jet-glow').style.opacity = body.visible ? '0.85' : '0.2';

  sky.querySelector('.jet-stars').style.opacity = starOpacity(h).toFixed(3);

  const sunEl = sky.querySelector('.jet-sun');
  sunEl.style.left = `${(body.x * 100).toFixed(1)}%`;
  sunEl.style.top = `${(body.y * 100).toFixed(1)}%`;
  sunEl.style.opacity = body.visible ? '1' : '0';
  sunEl.style.setProperty('--body-light', sun.visible ? p.glow : '#C8D8FF');
}

/* ── HUD symbology, only the fields you asked for ─────────── */

export const HUD_FIELDS = {
  airspeed:   { label: 'AIRSPEED', name: 'Airspeed — study hours per week' },
  altitude:   { label: 'ALTITUDE', name: 'Altitude — syllabus captured' },
  eta:        { label: 'ETA',      name: 'ETA — days to first exam' },
  level:      { label: 'LEVEL',    name: 'Level' },
  streak:     { label: 'STREAK',   name: 'Day streak' },
  pace:       { label: 'PACE',     name: 'Pace against the calendar' },
  range:      { label: 'RANGE',    name: 'Range — syllabus nodes left' },
  flightTime: { label: 'HOURS',    name: 'Flight time — total hours studied' },
  horizon:    { label: 'HORIZON',  name: 'Attitude horizon that banks with pace' },
  caution:    { label: 'CAUTION',  name: 'Caution count' },
};

export const DEFAULT_HUD = ['horizon', 'airspeed', 'altitude', 'eta', 'pace'];

export function renderHUD(d, fields = DEFAULT_HUD) {
  const on = new Set(fields);
  const W = 260, H = 200, CX = W / 2, CY = 104;
  const parts = [];

  if (on.has('horizon')) {
    const bank = bankAngle(d.ratio || 0);
    const y = CY + pitchOffset(d.hoursPerWeek) * 0.5;
    parts.push(`<g transform="rotate(${bank.toFixed(2)} ${CX} ${CY})">
      <line class="s" x1="${CX - 82}" y1="${y}" x2="${CX - 26}" y2="${y}"/>
      <line class="s" x1="${CX + 26}" y1="${y}" x2="${CX + 82}" y2="${y}"/>
      ${[-34, -17, 17, 34].map(o => `<line class="s t" x1="${CX - 16}" y1="${y + o}"
        x2="${CX + 16}" y2="${y + o}"/>`).join('')}
    </g>`);
    parts.push(`<path class="s" d="M${CX - 24} ${CY} h12 l12 10 l12 -10 h12" fill="none"/>`);
  }

  // left column
  const left = [];
  if (on.has('airspeed')) left.push([d.hoursPerWeek.toFixed(1), 'H/WK']);
  if (on.has('flightTime')) left.push([`${d.totalHours}`, 'HOURS']);
  if (on.has('level')) left.push([`${d.level}`, 'LEVEL']);
  left.forEach(([v, l], i) => {
    const y = 52 + i * 26;
    parts.push(`<text x="6" y="${y}" class="v">${esc(v)}</text>`);
    parts.push(`<text x="6" y="${y + 10}" class="l">${esc(l)}</text>`);
  });

  // right column
  const right = [];
  if (on.has('altitude')) right.push([`${Math.round(d.capturedPct)}%`, 'CAPT']);
  if (on.has('range')) right.push([`${d.nodesLeft}`, 'RANGE']);
  if (on.has('streak')) right.push([`${d.streak}D`, 'STREAK']);
  right.forEach(([v, l], i) => {
    const y = 52 + i * 26;
    parts.push(`<text x="${W - 6}" y="${y}" text-anchor="end" class="v">${esc(v)}</text>`);
    parts.push(`<text x="${W - 6}" y="${y + 10}" text-anchor="end" class="l">${esc(l)}</text>`);
  });

  // bottom row
  const bottom = [];
  if (on.has('eta')) bottom.push([`${d.daysToExam}D`, 'ETA']);
  if (on.has('pace')) bottom.push([d.ratio > 0 ? `${Math.round(d.ratio * 100)}%` : '---', 'PACE']);
  if (on.has('caution') && d.cautionCount) bottom.push([`${d.cautionCount}`, 'CAUTION']);
  bottom.forEach(([v, l], i) => {
    const x = bottom.length === 1 ? CX : 30 + i * ((W - 60) / (bottom.length - 1));
    const warn = l === 'PACE' && d.ratio > 0 && d.ratio < 0.85 || l === 'CAUTION';
    parts.push(`<text x="${x}" y="${H - 30}" text-anchor="middle"
      class="v ${warn ? 'w' : ''}">${esc(v)}</text>`);
    parts.push(`<text x="${x}" y="${H - 20}" text-anchor="middle" class="l">${esc(l)}</text>`);
  });

  parts.push(`<text x="${CX}" y="18" text-anchor="middle" class="l">M28</text>`);

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
