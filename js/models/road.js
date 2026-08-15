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

/* ─────────────────── ground held vs points held ─────────────────── */

/**
 * How much of a course your coverage has to reach before a grade is *backed*.
 * Index i is the fraction needed for a grade of i+1, on the same 0–1 scale as
 * mastery.subjectProgress — so 0.78 means an average of 3.1 out of 4 across
 * every node, decayed for what you have since forgotten.
 *
 * These are a stated heuristic, not a prediction, and the UI says so. The point
 * is not to forecast your grade — `predict` already does that from real scores.
 * It is to answer a question scores cannot: is there enough syllabus underneath
 * the mark you are getting, or are you one unseen topic away from losing it.
 */
export const BACKING = [0, 0.06, 0.16, 0.28, 0.42, 0.58, 0.78];

/** The highest grade a given coverage backs. */
export function backedGrade(coverage) {
  let g = 1;
  for (let i = 0; i < BACKING.length; i++) if (coverage >= BACKING[i]) g = i + 1;
  return Math.min(7, g);
}

/**
 * Captures still needed to back a grade.
 *
 * Coverage is a mean of effective mastery over `nodeCount` nodes, each worth up
 * to 4. One capture of a node you have not just done adds almost exactly one of
 * those units — a first visit takes it to Seen and fresh, a repeat visit moves
 * it up a level and resets the decay. So the shortfall in units *is* the number
 * of captures, which is why this number ticks down by one every time you take a
 * node on the map.
 */
export function capturesToBack(coverage, nodeCount, grade) {
  const need = BACKING[Math.min(7, Math.max(1, grade)) - 1];
  if (!nodeCount) return 0;
  const gap = need - coverage;
  // Both sides are sums of fractions, so an exact hit lands a hair either side
  // of zero. Without the slack, being precisely on a threshold rounds up and
  // reports one more capture than the model actually asks for.
  if (gap <= EPS) return 0;
  return Math.ceil(gap * 4 * nodeCount - EPS);
}

const EPS = 1e-9;

/**
 * The board again, with the ground underneath it.
 *
 * `held` is what your scores say. `backed` is what your syllabus coverage
 * supports. They are different questions and they move for different reasons:
 * sitting a paper moves `held`, capturing a topic moves `backed`. A subject
 * where backed sits below held is a subject you are getting away with.
 *
 * @param coverage {(subjectId:string) => {coverage:number, nodes:number}}
 */
export function ground(board, coverage) {
  const segments = board.segments.map(s => {
    const { coverage: cov = 0, nodes = 0 } = coverage(s.subject.id) ?? {};
    const backs = nodes ? backedGrade(cov) : 0;
    const aiming = Math.min(7, (s.known ? s.grade : 0) + 1);
    return {
      ...s,
      coverage: cov,
      nodes,
      backs,
      /** Positive when your scores are ahead of your coverage. */
      exposure: s.known ? s.grade - backs : 0,
      captures: capturesToBack(cov, nodes, aiming),
      aiming,
      /** Where the next point actually has to come from. */
      route: capturesToBack(cov, nodes, aiming) > 0 ? 'ground' : 'paper',
    };
  });

  const backed = segments.reduce((a, s) => a + s.backs, 0) + board.bonus.points;
  return {
    ...board,
    segments,
    backed,
    /** Points your scores claim but your coverage does not yet support. */
    exposed: segments.reduce((a, s) => a + Math.max(0, s.exposure), 0),
    /** Points sitting in ground you hold but have not converted on a paper. */
    unconverted: segments.reduce((a, s) => a + Math.max(0, s.backs - s.held), 0),
    /** The subject where the fewest captures back the next grade. */
    front: frontLine(segments),
  };
}

/** The cheapest advance on the map: fewest captures to back the next grade. */
export function frontLine(segments) {
  const live = segments.filter(s => s.nodes && s.captures > 0 && s.aiming <= 7);
  if (!live.length) return null;
  return [...live].sort((a, b) => a.captures - b.captures)[0];
}
