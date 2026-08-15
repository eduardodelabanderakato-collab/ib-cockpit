/**
 * The windshield.
 *
 * A layered, parallaxing sky whose colour follows the real local clock. Nothing
 * here is a static picture: the gradient, the sun's position, the tint on the
 * cloud deck, the stars and the city lights are all computed from the hour, and
 * every layer drifts at its own speed so the aircraft reads as moving.
 *
 * The pure functions below are DOM-free and tested. `createSky` is the engine.
 */

// ── palette keyframes ────────────────────────────────────────
// Each entry is an hour of the local day and the sky at that hour.
export const KEYFRAMES = [
  { h: 0.0,  zenith: '#050A18', upper: '#071026', horizon: '#0C1830',
    glow: '#2A3A63', cloudTop: '#1A2540', cloudShade: '#080E1C', haze: '#101B33' },
  { h: 4.6,  zenith: '#0B1436', upper: '#1B2350', horizon: '#4A3A62',
    glow: '#6B4A6E', cloudTop: '#3A3555', cloudShade: '#151830', haze: '#453A5E' },
  { h: 6.4,  zenith: '#1E3A6B', upper: '#4A6AA0', horizon: '#FFB27A',
    glow: '#FF9E5C', cloudTop: '#FFC9A0', cloudShade: '#5A4A63', haze: '#FFAE85' },
  { h: 8.5,  zenith: '#2C6FC4', upper: '#5C9BE0', horizon: '#BEDCF5',
    glow: '#FFE9B8', cloudTop: '#FFFFFF', cloudShade: '#9FB6CE', haze: '#D5E8F8' },
  { h: 12.5, zenith: '#1E63C8', upper: '#4A92E8', horizon: '#CFE6FA',
    glow: '#FFF6D8', cloudTop: '#FFFFFF', cloudShade: '#A8BED4', haze: '#E2F0FC' },
  { h: 16.5, zenith: '#2A6BC0', upper: '#5E9AD8', horizon: '#D8E4F0',
    glow: '#FFE2A8', cloudTop: '#FFF6E8', cloudShade: '#A0B4CC', haze: '#DCE9F5' },
  { h: 18.6, zenith: '#24487F', upper: '#6A7FB8', horizon: '#FFA867',
    glow: '#FF8A3C', cloudTop: '#FFCFA0', cloudShade: '#6B5570', haze: '#FFB489' },
  { h: 19.7, zenith: '#16244F', upper: '#4A4A80', horizon: '#FF7A4A',
    glow: '#FF5E30', cloudTop: '#FFA878', cloudShade: '#453A5C', haze: '#FF8A5E' },
  { h: 21.0, zenith: '#0A122E', upper: '#222B58', horizon: '#6E3A62',
    glow: '#A34A5A', cloudTop: '#5A4260', cloudShade: '#1E1E38', haze: '#5C3556' },
  { h: 24.0, zenith: '#050A18', upper: '#071026', horizon: '#0C1830',
    glow: '#2A3A63', cloudTop: '#1A2540', cloudShade: '#080E1C', haze: '#101B33' },
];

export const FIELDS = ['zenith', 'upper', 'horizon', 'glow', 'cloudTop', 'cloudShade', 'haze'];

/**
 * The clock the cockpit runs on.
 *
 * Brasília, not the device. You fly this from São Paulo, so the sun outside the
 * canopy should be the sun outside your window — including when you open it on
 * a laptop still set to another timezone, or a phone that has followed you
 * abroad. Brazil dropped daylight saving in 2019, but the zone is named rather
 * than hardcoded to −03:00 so it stays right if that ever changes again.
 */
export const ZONE = 'America/Sao_Paulo';

/** Wall-clock parts in `zone`, or the device's own clock if the zone is unknown. */
export function partsIn(d = new Date(), zone = ZONE) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const got = {};
    for (const { type, value } of f.formatToParts(d)) got[type] = value;
    // 24 is a legal formatToParts hour for midnight in some engines.
    const hour = Number(got.hour) % 24;
    return { hour, minute: Number(got.minute), second: Number(got.second) };
  } catch {
    return { hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
  }
}

/** Hour of day in `zone` as a fraction, 0 <= h < 24. */
export function hoursOf(d = new Date(), zone = ZONE) {
  const { hour, minute, second } = partsIn(d, zone);
  return hour + minute / 60 + second / 3600;
}

/** HH:MM in `zone`, zero-padded, for anywhere the time is shown as text. */
export function clockText(d = new Date(), zone = ZONE) {
  const { hour, minute } = partsIn(d, zone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Night, for anything that has to switch rather than fade: instrument flood
 * lighting, and the star field over the canopy.
 */
export function isNight(hours) {
  return sunAltitude(hours) < -0.05;
}

const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);

export function mixHex(a, b, t) {
  const p = clamp01(t);
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const r = Math.round(((A >> 16) & 255) + (((B >> 16) & 255) - ((A >> 16) & 255)) * p);
  const g = Math.round(((A >> 8) & 255) + (((B >> 8) & 255) - ((A >> 8) & 255)) * p);
  const bl = Math.round((A & 255) + ((B & 255) - (A & 255)) * p);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1).toUpperCase();
}

/** Smoothstep so dawn and dusk ease rather than ramp linearly. */
const ease = t => t * t * (3 - 2 * t);

export function paletteFor(hours) {
  const h = ((hours % 24) + 24) % 24;
  let lo = KEYFRAMES[0], hi = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (h >= KEYFRAMES[i].h && h <= KEYFRAMES[i + 1].h) {
      lo = KEYFRAMES[i]; hi = KEYFRAMES[i + 1]; break;
    }
  }
  const span = hi.h - lo.h;
  const t = span === 0 ? 0 : ease(clamp01((h - lo.h) / span));
  const out = {};
  for (const f of FIELDS) out[f] = mixHex(lo[f], hi[f], t);
  return out;
}

/** How high the sun sits: -1 at solar midnight, +1 at solar noon. */
export function sunAltitude(hours) {
  const h = ((hours % 24) + 24) % 24;
  return Math.sin(((h - 6) / 12) * Math.PI);
}

/**
 * Where to draw the sun on the windshield, in 0..1 across and down.
 * `visible` is false once it is meaningfully below the horizon.
 */
export function sunPosition(hours) {
  const h = ((hours % 24) + 24) % 24;
  const alt = sunAltitude(h);
  return {
    x: clamp01((h - 5) / 14),
    y: clamp01(0.92 - alt * 0.78),
    alt,
    visible: alt > -0.18,
  };
}

/** The moon rides the opposite arc and only shows when the sun is down. */
export function moonPosition(hours) {
  const s = sunPosition(hours + 12);
  return { ...s, visible: sunAltitude(hours) < 0.02 };
}

/** Stars ease in across the whole of dusk rather than snapping on at sunset. */
export function starOpacity(hours) {
  return clamp01((-sunAltitude(hours) - 0.05) / 0.55);
}

/** City lights read through cloud gaps, arriving a little later than the stars. */
export function cityOpacity(hours) {
  return clamp01((-sunAltitude(hours) - 0.12) / 0.5);
}

/** Exposure applied to the photographic cloud deck so it matches the hour. */
export function deckExposure(hours) {
  const alt = sunAltitude(hours);
  return {
    brightness: +(0.28 + 0.82 * clamp01((alt + 0.55) / 1.55)).toFixed(3),
    saturate: +(0.55 + 0.65 * clamp01((alt + 0.4) / 1.4)).toFixed(3),
    contrast: +(0.9 + 0.2 * clamp01((alt + 0.3) / 1.3)).toFixed(3),
  };
}

/**
 * How to light the cockpit photograph for this hour.
 *
 * The airframe is a single photograph with its own baked-in daylight, so the
 * scene cannot be re-lit properly — what it can be is graded. Exposure pulls
 * the whole frame down after sunset, and a wash in the hour's own sky colour
 * carries the hue, warm at dusk and deep blue at night. The wash is kept off
 * entirely in the middle of the day, where the photograph is already right and
 * anything added only muddies it.
 *
 * `flood` is the instrument lighting: nought by day, and by night the warm
 * panel glow you actually get in a dark cockpit.
 */
export function sceneGrade(hours) {
  const alt = sunAltitude(hours);
  const p = paletteFor(hours);

  // Its own exposure curve rather than deckExposure's. That one grades a
  // synthetic cloud layer that carries no light of its own; this one grades a
  // photograph of a sunlit deck, which stays luminous well past sunset and only
  // really goes dark once the sun is properly down.
  const day = ease(clamp01((alt + 0.35) / 0.7));
  const night = clamp01((-alt - 0.05) / 0.5);
  const dusk = clamp01(1 - Math.abs(alt) / 0.4);

  return {
    brightness: +(0.32 + 0.78 * day).toFixed(3),
    saturate: +(0.62 + 0.56 * day).toFixed(3),
    contrast: +(0.94 + 0.16 * day).toFixed(3),
    wash: night > dusk ? p.zenith : p.horizon,
    washAlpha: +Math.max(night * 0.62, dusk * 0.5).toFixed(3),
    flood: +night.toFixed(3),
  };
}

/** Birds keep civilised hours: dawn through dusk, never at night. */
export function birdsActive(hours) {
  return sunAltitude(hours) > -0.05;
}

// ── deterministic scatter helpers ────────────────────────────
function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Star tile. Emitted at its natural pixel size and tiled 1:1 by the CSS so the
 * dots stay round — a percentage background-size would stretch them into streaks.
 */
export const STAR_TILE = { w: 420, h: 260 };

export function starField(count = 220, seed = 11) {
  const r = prng(seed);
  const { w, h } = STAR_TILE;
  const dots = [];
  for (let i = 0; i < count; i++) {
    const x = (r() * w).toFixed(1);
    const y = (r() * h).toFixed(1);
    const rad = (r() * 0.85 + 0.35).toFixed(2);
    const o = (r() * 0.65 + 0.35).toFixed(2);
    dots.push(`<circle cx="${x}" cy="${y}" r="${rad}" fill="#fff" opacity="${o}"/>`);
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"
    viewBox="0 0 ${w} ${h}">${dots.join('')}</svg>`);
}

export const CITY_TILE = { w: 520, h: 150 };

/** Clustered warm pinpricks — a city grid seen from altitude. */
export function cityField(clusters = 16, seed = 29) {
  const r = prng(seed);
  const { w, h } = CITY_TILE;
  const out = [];
  for (let c = 0; c < clusters; c++) {
    const cx = r() * w, cy = r() * h;
    const n = 14 + Math.floor(r() * 30);
    const spread = 10 + r() * 34;
    for (let i = 0; i < n; i++) {
      const x = (cx + (r() - 0.5) * spread * 2.2).toFixed(1);
      const y = (cy + (r() - 0.5) * spread * 0.55).toFixed(1);
      const rad = (r() * 0.85 + 0.35).toFixed(2);
      const warm = r() > 0.78 ? '#FFF1C4' : '#FFC98A';
      out.push(`<circle cx="${x}" cy="${y}" r="${rad}" fill="${warm}" opacity="${
        (0.35 + r() * 0.65).toFixed(2)}"/>`);
    }
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"
    viewBox="0 0 ${w} ${h}">${out.join('')}</svg>`);
}

/** Soft cloud bank used for the drifting mid and near layers. */
export function cloudBand(seed = 5, blobs = 14, opacity = 0.5) {
  const r = prng(seed);
  const out = [];
  for (let i = 0; i < blobs; i++) {
    const cx = r() * 100, cy = 40 + r() * 55;
    const rx = 6 + r() * 16, ry = 1.6 + r() * 4.4;
    out.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"
      rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#fff"
      opacity="${(opacity * (0.35 + r() * 0.65)).toFixed(2)}"/>`);
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"
    preserveAspectRatio="none"><defs><filter id="b" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="1.1"/></filter></defs>
    <g filter="url(#b)">${out.join('')}</g></svg>`);
}

export function svgUri(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;
}
