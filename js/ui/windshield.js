import {
  hoursOf, paletteFor, sunPosition, moonPosition, starOpacity, cityOpacity,
  deckExposure, birdsActive, starField, cityField, cloudBand,
} from './sky.js';

const REDUCED = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const BIRD = `<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <path class="w1" d="M10 20 q8 -8 16 0 q8 -8 16 0"/>
    <path class="w2" d="M52 26 q7 -7 14 0 q7 -7 14 0"/>
    <path class="w3" d="M88 16 q6 -6 12 0 q6 -6 12 0"/>
  </g></svg>`;

/**
 * Builds the living windshield inside `mount` and keeps it in step with the clock.
 * Returns a handle so the view can tear it down on navigation.
 */
export function createWindshield(mount) {
  const root = document.createElement('div');
  root.className = 'wsky';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="wsky-grad"></div>
    <div class="wsky-stars"></div>
    <div class="wsky-body">
      <div class="wsky-glow"></div>
      <div class="wsky-disc"></div>
    </div>
    <div class="wsky-cities drift drift-slowest"></div>
    <div class="wsky-deck drift drift-slow"></div>
    <div class="wsky-mid drift drift-mid"></div>
    <div class="wsky-near drift drift-fast"></div>
    <div class="wsky-haze"></div>
    <div class="wsky-traffic"></div>`;
  mount.append(root);

  const q = s => root.querySelector(s);
  const stars = q('.wsky-stars');
  const cities = q('.wsky-cities');
  const mid = q('.wsky-mid');
  const near = q('.wsky-near');
  const traffic = q('.wsky-traffic');

  stars.style.backgroundImage = starField(240, 11);
  cities.style.backgroundImage = cityField(18, 29);
  mid.style.backgroundImage = cloudBand(5, 16, 0.55);
  near.style.backgroundImage = cloudBand(23, 10, 0.38);

  let override = null;
  const reduced = REDUCED();
  if (reduced) root.classList.add('is-still');

  function currentHours() {
    return override ?? hoursOf();
  }

  function paint() {
    const h = currentHours();
    const p = paletteFor(h);
    const sun = sunPosition(h);
    const moon = moonPosition(h);
    const body = sun.visible ? sun : moon;
    const exp = deckExposure(h);

    root.style.setProperty('--sky-zenith', p.zenith);
    root.style.setProperty('--sky-upper', p.upper);
    root.style.setProperty('--sky-horizon', p.horizon);
    root.style.setProperty('--sky-glow', p.glow);
    root.style.setProperty('--sky-cloud', p.cloudTop);
    root.style.setProperty('--sky-shade', p.cloudShade);
    root.style.setProperty('--sky-haze', p.haze);

    stars.style.opacity = starOpacity(h).toFixed(3);
    cities.style.opacity = (cityOpacity(h) * 0.8).toFixed(3);

    // The moon borrows none of the sunset's colour — it reads cool and small.
    const bodyEl = q('.wsky-body');
    const disc = q('.wsky-disc');
    const glowEl = q('.wsky-glow');
    const light = sun.visible ? p.glow : '#C8D8FF';

    bodyEl.style.opacity = body.visible ? '1' : '0';
    bodyEl.style.left = `${(body.x * 100).toFixed(2)}%`;
    bodyEl.style.top = `${(body.y * 100).toFixed(2)}%`;
    bodyEl.style.setProperty('--body-light', light);
    disc.style.background = sun.visible ? light : '#EEF3FF';
    disc.style.width = disc.style.height = sun.visible ? '46px' : '22px';
    glowEl.style.width = glowEl.style.height = sun.visible ? '420px' : '170px';

    q('.wsky-deck').style.filter =
      `brightness(${exp.brightness}) saturate(${exp.saturate}) contrast(${exp.contrast})`;

    // Cloud layers take the hour's light so they never look pasted on.
    for (const layer of [mid, near]) {
      layer.style.filter = `brightness(${exp.brightness}) saturate(${exp.saturate})`;
    }
  }

  // ── traffic: birds by day, a rare high contrail any time ────
  function spawn() {
    if (reduced || document.hidden) return;
    const h = currentHours();
    const isBird = birdsActive(h) && Math.random() < 0.72;

    const n = document.createElement('div');
    if (isBird) {
      n.className = 'flyby bird';
      n.innerHTML = BIRD;
      n.style.top = `${28 + Math.random() * 34}%`;
      n.style.setProperty('--scale', (0.35 + Math.random() * 0.75).toFixed(2));
      n.style.setProperty('--dur', `${13 + Math.random() * 12}s`);
      n.style.setProperty('--rise', `${(Math.random() * 8 - 4).toFixed(1)}vh`);
    } else {
      n.className = 'flyby jet';
      n.style.top = `${6 + Math.random() * 18}%`;
      n.style.setProperty('--dur', `${26 + Math.random() * 16}s`);
      n.style.setProperty('--rise', '0vh');
    }
    n.addEventListener('animationend', () => n.remove(), { once: true });
    traffic.append(n);
  }

  paint();
  const paintTimer = setInterval(paint, 15000);
  const spawnTimer = reduced ? null : setInterval(() => {
    if (Math.random() < 0.55) spawn();
  }, 9000);
  if (!reduced) setTimeout(spawn, 1200);

  const onVisible = () => { if (!document.hidden) paint(); };
  document.addEventListener('visibilitychange', onVisible);

  return {
    el: root,
    /** Pass an hour 0..24 to fly to a time of day, or null to rejoin the real clock. */
    setTime(h) { override = h; paint(); },
    getTime() { return currentHours(); },
    repaint: paint,
    destroy() {
      clearInterval(paintTimer);
      if (spawnTimer) clearInterval(spawnTimer);
      document.removeEventListener('visibilitychange', onVisible);
      root.remove();
    },
  };
}
