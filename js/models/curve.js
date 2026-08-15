import { calibrate, drift, accuracy } from './recall.js';
import { HALF_LIVES } from './mastery.js';

/**
 * The forgetting curve in force right now: fitted from your own recall checks
 * where there is enough data, the shipped estimate everywhere else.
 *
 * Cached per checks-array identity so the fit is not recomputed on every render.
 */
let cache = { key: null, value: null };

export function curveFor(checks = []) {
  if (cache.key === checks) return cache.value;
  const { halfLives, detail } = calibrate(checks, HALF_LIVES);
  const value = { halfLives, detail, drift: drift(detail), accuracy: accuracy(checks) };
  cache = { key: checks, value };
  return value;
}

export function halfLivesFor(checks = []) {
  return curveFor(checks).halfLives;
}
