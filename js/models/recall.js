import { HALF_LIVES, MAX_LEVEL } from './mastery.js';

/**
 * Recall checks, and half-lives that learn.
 *
 * Until now mastery was self-reported: you clicked a node and the app believed
 * you. Everything downstream — decay, the rescue queue, the recommender, the
 * projection — rested on that click.
 *
 * A recall check asks one question when a topic comes up for rescue: could you
 * do this cold, right now? The answer sets the level, and the record of answers
 * is used to fit YOUR forgetting curve rather than the one I guessed.
 */

export const OUTCOMES = {
  yes:    { score: 1,   label: 'Yes, cold',   delta: +1, note: 'Solid — level up' },
  partly: { score: 0.5, label: 'Roughly',     delta: 0,  note: 'Held, but shaky — level kept' },
  no:     { score: 0,   label: 'No',          delta: -1, note: 'Gone — level dropped' },
};

/** Below this many checks at a level, keep trusting the shipped default. */
export const MIN_OBSERVATIONS = 5;

/** Plausible half-lives to search over, in days. */
const GRID = Array.from({ length: 200 }, (_, i) => i + 1);

export function isOutcome(v) {
  return Object.prototype.hasOwnProperty.call(OUTCOMES, v);
}

/** Append a check. Pure: returns a new list. */
export function record(checks, { nodeId, level, days, outcome, now = Date.now() }) {
  if (!isOutcome(outcome)) throw new Error(`Unknown recall outcome: ${outcome}`);
  return [...checks, {
    nodeId,
    level,
    days: Math.max(0, Math.round(days * 10) / 10),
    outcome,
    ts: new Date(now).toISOString(),
  }];
}

/** What the check does to the node's level. */
export function applyOutcome(level, outcome) {
  const o = OUTCOMES[outcome];
  if (!o) return level;
  return Math.max(0, Math.min(MAX_LEVEL, level + o.delta));
}

/**
 * Fit a half-life to observations by least squares against the retention model
 * P(recall) = 2^(-days / h).
 *
 * Shrunk toward the shipped default in proportion to how little data there is,
 * so a handful of checks nudges the curve rather than replacing it.
 */
export function estimateHalfLife(observations, fallback, minN = MIN_OBSERVATIONS) {
  const obs = observations.filter(o => Number.isFinite(o.days) && isOutcome(o.outcome));
  if (obs.length < minN) return { halfLife: fallback, n: obs.length, fitted: false };

  let best = fallback, bestErr = Infinity;
  for (const h of GRID) {
    let err = 0;
    for (const o of obs) {
      const predicted = Math.pow(2, -o.days / h);
      const actual = OUTCOMES[o.outcome].score;
      err += (predicted - actual) ** 2;
    }
    if (err < bestErr) { bestErr = err; best = h; }
  }

  // Shrinkage: full weight on the fit only once there is a decent sample.
  const w = Math.min(1, obs.length / (minN * 4));
  const blended = Math.round(best * w + fallback * (1 - w));
  return { halfLife: Math.max(1, blended), n: obs.length, fitted: true, raw: best };
}

/**
 * Half-lives per mastery level, fitted from this user's own checks.
 * @returns {{halfLives:number[], detail:Array}}
 */
export function calibrate(checks = [], defaults = HALF_LIVES) {
  const halfLives = [...defaults];
  const detail = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const obs = checks.filter(c => c.level === level);
    const est = estimateHalfLife(obs, defaults[level]);
    halfLives[level] = est.halfLife;
    detail.push({ level, ...est, shipped: defaults[level] });
  }
  return { halfLives, detail };
}

/** How far the fitted curve has moved from the shipped one. */
export function drift(detail) {
  const moved = detail.filter(d => d.fitted && d.halfLife !== d.shipped);
  return {
    moved: moved.length,
    total: detail.reduce((a, d) => a + d.n, 0),
    faster: moved.filter(d => d.halfLife < d.shipped).length,
    slower: moved.filter(d => d.halfLife > d.shipped).length,
  };
}

/** Recent accuracy, for telling you how well you are actually holding things. */
export function accuracy(checks, lastN = 30) {
  const recent = checks.slice(-lastN);
  if (!recent.length) return null;
  const score = recent.reduce((a, c) => a + OUTCOMES[c.outcome].score, 0);
  return {
    n: recent.length,
    pct: Math.round((score / recent.length) * 100),
    held: recent.filter(c => c.outcome === 'yes').length,
    lost: recent.filter(c => c.outcome === 'no').length,
  };
}
