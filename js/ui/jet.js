import { el, esc } from './dom.js';
import { createStage } from './stage.js';
import { hoursOf, birdsActive } from './sky.js';
import { bankAngle, pitchOffset } from './pfd.js';

/**
 * The jet.
 *
 * A photoreal cockpit shell with everything live projected into it:
 * time-of-day effects on the canopy glass, HUD symbology on the combiner,
 * real data in the three MFDs, and labelled keys on the bezel rails.
 */

/* Bezel rails, measured against the shell image. The MFDs occupy
   x 34.15–42.9 / 44.95–54.5 / 56.70–66.05 at y 57.3–79.2, so the rails
   sit in the gaps between and above/below them. */
export const RAILS = {
  entry:    { x: 31.85, y: 57.6, w: 2.05, h: 2.65, gap: 0.4, n: 7, dir: 'v',
              legend: 'ENTRY',  lx: 31.85, ly: 56.4 },
  sysA:     { x: 42.95, y: 57.6, w: 1.9,  h: 3.8, gap: 0.5, n: 3, dir: 'v' },
  sysB:     { x: 54.55, y: 57.6, w: 1.9,  h: 3.8, gap: 0.5, n: 3, dir: 'v' },
  sysC:     { x: 66.15, y: 57.6, w: 2.05, h: 3.8, gap: 0.5, n: 3, dir: 'v',
              legend: 'SYS',    lx: 66.15, ly: 56.4 },
  readouts: { x: 34.15, y: 53.5, w: 3.19, h: 2.5, gap: 0.4, n: 9, dir: 'h',
              legend: 'READOUTS', lx: 34.15, ly: 52.3 },
  engines:  { x: 34.15, y: 80.0, w: 3.64, h: 2.5, gap: 0.4, n: 8, dir: 'h',
              legend: 'ENGINES',  lx: 34.15, ly: 83.4 },
};

/** Which rails each control group is dealt into, in order. */
export const GROUP_RAILS = {
  'Data entry': ['entry'],
  'Readouts':   ['readouts'],
  'Engines':    ['engines'],
  'Systems':    ['sysA', 'sysB', 'sysC'],
};

function railSlots(r) {
  const out = [];
  for (let i = 0; i < r.n; i++) {
    out.push(r.dir === 'v'
      ? { x: r.x, y: r.y + i * (r.h + r.gap), w: r.w, h: r.h }
      : { x: r.x + i * (r.w + r.gap), y: r.y, w: r.w, h: r.h });
  }
  return out;
}

/** Every slot on the panel, keyed by rail. */
export function slots() {
  return Object.values(RAILS).flatMap(railSlots);
}

/** The metal strip behind a rail, sized to enclose its keys with a margin. */
export function railBox(r) {
  const m = 0.35;
  return r.dir === 'v'
    ? { x: r.x - m, y: r.y - m, w: r.w + m * 2,
        h: r.n * r.h + (r.n - 1) * r.gap + m * 2 }
    : { x: r.x - m, y: r.y - m,
        w: r.n * r.w + (r.n - 1) * r.gap + m * 2, h: r.h + m * 2 };
}

export function createJet(mount, model) {
  const stage = el('div', 'stage');

  // 1 · airframe
  const shell = el('div', 'jet-shell');
  shell.dataset.depth = 'shell';
  stage.append(shell);

  // 2 · canopy glass. Deliberately no tint, no stars, no drifting bands —
  //     the windshield is glass and symbology, nothing else.
  const glass = el('div', 'jet-glass');
  glass.dataset.depth = 'sky';
  stage.append(glass);

  const vig = el('div', 'jet-vig');
  vig.dataset.depth = 'shell';
  stage.append(vig);

  // 3 · HUD on the combiner glass
  const hud = el('div', 'jet-hud');
  hud.dataset.depth = 'hud';
  hud.innerHTML = renderHUD(model.hud, model.hudFields, model.hudCustom);
  stage.append(hud);

  // 4 · live MFDs
  const mfds = el('div', 'jet-panel');
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

  // 5 · annunciators on the glareshield
  if (model.annunciators?.length) {
    const strip = el('div', 'jet-annun');
    strip.dataset.depth = 'panel';
    const mc = el('div', `jmc${model.masterCaution ? ' lit' : ''}`, 'MASTER CAUTION');
    strip.append(mc);
    for (const a of model.annunciators.slice(0, 4)) {
      const b = el('a', `jann jann-${a.level}`, a.code);
      b.href = a.href;
      b.title = a.detail;
      strip.append(b);
    }
    stage.append(strip);
  }

  // 6 · bezel rails and keys
  const keys = el('div', 'jet-keys');
  keys.dataset.depth = 'panel';

  for (const [name, r] of Object.entries(RAILS)) {
    const box = railBox(r);
    const strip = el('div', `rail ${r.dir}`);
    strip.style.cssText = `left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%`;
    keys.append(strip);
    if (r.legend) {
      const lg = el('div', 'rail-legend', r.legend);
      lg.style.cssText = `left:${r.lx}%;top:${r.ly}%`;
      keys.append(lg);
    }
  }

  for (const g of model.groups) {
    const pool = (GROUP_RAILS[g.group] ?? []).flatMap(n => railSlots(RAILS[n]));
    g.controls.forEach((c, i) => {
      const p = pool[i];
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
        setTimeout(() => b.classList.remove('pressed'), 140);
        location.hash = `#/${c.id}`;
      };
      keys.append(b);
    });
  }
  stage.append(keys);

  const hint = el('div', 'jet-hint', 'Move to look around · press a key');
  stage.append(hint);

  mount.append(stage);

  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const look = createStage(stage, { reduced });
  stage.addEventListener('pointerdown', () => stage.classList.add('touched'), { once: true });
  stage.addEventListener('pointermove', () => stage.classList.add('touched'), { once: true });

  const traffic = el('div', 'jet-traffic');
  traffic.style.cssText = 'position:absolute;inset:0 0 42% 0;overflow:hidden;pointer-events:none';
  glass.append(traffic);

  const spawn = () => {
    if (reduced || document.hidden) return;
    const h = hoursOf();
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
    traffic.append(n);
  };
  const spawner = reduced ? null : setInterval(spawn, 11000);

  return {
    el: stage,
    look,
    destroy() {
      if (spawner) clearInterval(spawner);
      look.destroy();
      stage.remove();
    },
  };
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

/**
 * HUD symbology. Glass and aiming marks — plus whatever lines you add yourself.
 */
export function renderHUD(d, fields = DEFAULT_HUD, custom = []) {
  const on = new Set(fields);
  const W = 300, H = 210, CX = W / 2, CY = 96;
  const p = [];

  // ── aiming reticle: always on the glass ──────────────────
  p.push(`<circle class="s t" cx="${CX}" cy="${CY}" r="26"/>`);
  p.push(`<circle class="s" cx="${CX}" cy="${CY}" r="2"/>`);
  for (const [x1, y1, x2, y2] of [
    [CX - 34, CY, CX - 20, CY], [CX + 20, CY, CX + 34, CY],
    [CX, CY - 34, CX, CY - 20], [CX, CY + 20, CX, CY + 34],
  ]) p.push(`<line class="s" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);

  if (on.has('horizon')) {
    const bank = bankAngle(d.ratio || 0);
    const y = CY + pitchOffset(d.hoursPerWeek) * 0.5;
    p.push(`<g transform="rotate(${bank.toFixed(2)} ${CX} ${CY})">
      <line class="s" x1="${CX - 108}" y1="${y}" x2="${CX - 40}" y2="${y}"/>
      <line class="s" x1="${CX + 40}" y1="${y}" x2="${CX + 108}" y2="${y}"/>
      ${[-40, -20, 20, 40].map(o => `<line class="s t" x1="${CX - 22}" y1="${y + o}"
        x2="${CX + 22}" y2="${y + o}"/>`).join('')}
    </g>`);
  }

  const col = (items, x, anchor) => items.forEach(([v, l], i) => {
    const y = 44 + i * 27;
    p.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" class="v">${esc(v)}</text>`);
    p.push(`<text x="${x}" y="${y + 11}" text-anchor="${anchor}" class="l">${esc(l)}</text>`);
  });

  const left = [];
  if (on.has('airspeed')) left.push([d.hoursPerWeek.toFixed(1), 'H/WK']);
  if (on.has('flightTime')) left.push([`${d.totalHours}`, 'HOURS']);
  if (on.has('level')) left.push([`${d.level}`, 'LEVEL']);
  col(left, 4, 'start');

  const right = [];
  if (on.has('altitude')) right.push([`${Math.round(d.capturedPct)}%`, 'CAPT']);
  if (on.has('range')) right.push([`${d.nodesLeft}`, 'RANGE']);
  if (on.has('streak')) right.push([`${d.streak}D`, 'STREAK']);
  col(right, W - 4, 'end');

  const bottom = [];
  if (on.has('eta')) bottom.push([`${d.daysToExam}D`, 'ETA', false]);
  if (on.has('pace')) bottom.push([d.ratio > 0 ? `${Math.round(d.ratio * 100)}%` : '---', 'PACE',
    d.ratio > 0 && d.ratio < 0.85]);
  if (on.has('caution') && d.cautionCount) bottom.push([`${d.cautionCount}`, 'CAUTION', true]);
  bottom.forEach(([v, l, warn], i) => {
    const x = bottom.length === 1 ? CX : 44 + i * ((W - 88) / (bottom.length - 1));
    p.push(`<text x="${x}" y="${H - 34}" text-anchor="middle"
      class="v ${warn ? 'w' : ''}">${esc(v)}</text>`);
    p.push(`<text x="${x}" y="${H - 23}" text-anchor="middle" class="l">${esc(l)}</text>`);
  });

  // ── your own lines, projected under the reticle ──────────
  custom.filter(Boolean).slice(0, 4).forEach((line, i) => {
    p.push(`<text x="${CX}" y="${CY + 46 + i * 14}" text-anchor="middle"
      class="cust">${esc(line)}</text>`);
  });

  p.push(`<text x="${CX}" y="14" text-anchor="middle" class="l">M28</text>`);

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${p.join('')}</svg>`;
}
