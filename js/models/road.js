import { predict, coreBonus, DEFAULT_BOUNDARIES } from './grades.js';

/**
 * The road to 45.
 *
 * XP and levels were points bolted onto work — they went up whatever you did,
 * so they meant nothing. This is the actual board: 45 points, where each one
 * lives, which you currently hold, and exactly what the missing ones cost.
 *
 * Rank is tied to the projected diploma score rather than to activity, so it
 * only moves when the thing you actually care about moves.
 */

export const MAX_POINTS = 45;
export const SUBJECT_POINTS = 42;
export const BONUS_POINTS = 3;

/** Progression tied to the real goal, not to time served. */
export const RANKS = [
  { at: 0,  name: 'Grounded',   note: 'No assessments logged yet' },
  { at: 24, name: 'Airborne',   note: 'Above the diploma pass mark' },
  { at: 30, name: 'Cruising',   note: 'A solid diploma' },
  { at: 34, name: 'Climbing',   note: 'Strong — competitive most places' },
  { at: 38, name: 'High flight', note: 'Top decile territory' },
  { at: 41, name: 'Stratosphere', note: 'The range top universities notice' },
  { at: 44, name: 'Apex',       note: 'One point from perfect' },
  { at: 45, name: 'Perfect',    note: '45. Nothing left to take.' },
];

export function rankFor(points) {
  let hit = RANKS[0];
  for (const r of RANKS) if (points >= r.at) hit = r;
  const next = RANKS.find(r => r.at > points) ?? null;
  return { ...hit, next, toNext: next ? next.at - points : 0 };
}

/**
 * Every point on the board, accounted for.
 * @returns {{held, missing, segments, bonus, rank, unknown, cheapest}}
 */
export function road({ subjects, grades = [], tok = null, ee = null,
                       boundaries = {}, target = MAX_POINTS }) {
  const segments = subjects.map(s => {
    const mine = grades.filter(g => g.subjectId === s.id);
    const p = predict(mine, boundaries[s.id] ?? DEFAULT_BOUNDARIES);
    const grade = p?.grade ?? null;
    return {
      subject: s,
      grade,
      held: grade ?? 0,
      missing: grade === null ? 7 : 7 - grade,
      known: grade !== null,
      pct: p?.pct ?? null,
      trend: p?.trend ?? 0,
      /** The mark that would earn the next grade, under this subject's own table. */
      threshold: p ? nextThreshold(p.pct, boundaries[s.id] ?? DEFAULT_BOUNDARIES) : null,
      // What the next point costs, in the only terms that matter.
      next: grade === null
        ? 'Log a score to put this subject on the board'
        : grade >= 7 ? 'Maxed'
        : `${nextThreshold(p.pct, boundaries[s.id] ?? DEFAULT_BOUNDARIES)}% for a ${grade + 1}`,
    };
  });

  const bonus = coreBonus(tok, ee);
  const held = segments.reduce((a, s) => a + s.held, 0) + bonus.points;
  const unknown = segments.filter(s => !s.known).length;

  return {
    segments,
    bonus,
    held,
    missing: MAX_POINTS - held,
    // No ceiling field: held + every missing point is always 45 by
    // construction, so it would state nothing. `missing` is the real number.
    unknown,
    target,
    onTarget: held >= target,
    rank: rankFor(held),
    /** Where the cheapest next point is — the one to go after first. */
    cheapest: cheapestPoint(segments),
  };
}

/** The percentage that would earn the next grade up. */
export function nextThreshold(pct, boundaries = DEFAULT_BOUNDARIES) {
  for (const b of boundaries) if (b > pct) return b;
  return 100;
}

/**
 * The subject where one more point costs least: closest to its next boundary,
 * among subjects that are actually on the board. Uses each subject's own
 * threshold, so a custom boundary table changes which point is cheapest.
 */
export function cheapestPoint(segments) {
  const live = segments.filter(s => s.known && s.grade < 7 && s.pct !== null);
  if (!live.length) return null;
  return live
    .map(s => ({ ...s, gap: (s.threshold ?? nextThreshold(s.pct)) - s.pct }))
    .sort((a, b) => a.gap - b.gap)[0];
}
