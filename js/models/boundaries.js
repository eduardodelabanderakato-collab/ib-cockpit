import { DEFAULT_BOUNDARIES, gradeFor } from './grades.js';

/**
 * Grade boundaries.
 *
 * The projection is only as honest as these numbers, and they are NOT the same
 * across subjects — a 7 in Mathematics AA HL has historically sat far lower
 * than a 7 in a Language A course. Using one generic table, which is what the
 * app did until now, quietly mis-states every prediction.
 *
 * They also move every session, and May 2028's do not exist yet. So nothing is
 * hardcoded and nothing is guessed: the app ships the generic table as a
 * placeholder and lets you enter the real ones, which schools receive from the
 * IB after each session.
 */

/** A boundaries array is seven ascending percentage floors, starting at 0. */
export function isValid(b) {
  if (!Array.isArray(b) || b.length !== 7) return false;
  if (b[0] !== 0) return false;
  return b.every((v, i) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
    && (i === 0 || v > b[i - 1]));
}

/** Coerce user input into a valid set, or return null with the reason why. */
export function parse(values) {
  const nums = values.map(v => Number(String(v).trim()));
  if (nums.some(n => !Number.isFinite(n))) {
    return { ok: false, error: 'Every boundary must be a number.' };
  }
  const b = [0, ...nums.slice(1).map(n => Math.round(n * 10) / 10)];
  if (b.some(n => n < 0 || n > 100)) {
    return { ok: false, error: 'Boundaries are percentages, so 0 to 100.' };
  }
  for (let i = 1; i < b.length; i++) {
    if (b[i] <= b[i - 1]) {
      return { ok: false,
        error: `Grade ${i + 1} must be above grade ${i}. Got ${b[i]} after ${b[i - 1]}.` };
    }
  }
  return { ok: true, boundaries: b };
}

/** The set in force for a subject: yours if set, otherwise the placeholder. */
export function forSubject(settings, subjectId) {
  const own = settings?.boundaries?.[subjectId];
  return isValid(own) ? own : DEFAULT_BOUNDARIES;
}

export function isCustom(settings, subjectId) {
  return isValid(settings?.boundaries?.[subjectId]);
}

/** Every subject's set, ready to hand to project(). */
export function table(settings, subjects) {
  const out = {};
  for (const s of subjects) out[s.id] = forSubject(settings, s.id);
  return out;
}

/**
 * How much the boundaries matter: the grade a percentage earns under yours
 * versus under the placeholder. A difference here is the size of the lie the
 * generic table was telling.
 */
export function impact(pct, custom) {
  const generic = gradeFor(pct, DEFAULT_BOUNDARIES);
  const actual = gradeFor(pct, custom);
  return { generic, actual, shifted: generic !== actual };
}

/** Percentage window a grade occupies, for showing the band on screen. */
export function bandFor(grade, b = DEFAULT_BOUNDARIES) {
  const g = Math.min(7, Math.max(1, Math.round(grade)));
  return { from: b[g - 1], to: g === 7 ? 100 : b[g] };
}
