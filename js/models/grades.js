/**
 * Grades, predictions and the projection out of 45.
 *
 * Predicted grades use an exponentially weighted moving average so a recent
 * mock counts far more than a test from a year ago, without throwing the
 * older data away entirely.
 */

/** Default 1–7 boundaries as percentage floors. Overridable per subject. */
export const DEFAULT_BOUNDARIES = [0, 12, 25, 40, 53, 67, 82];

export const ALPHA = 0.4;

/**
 * The representative percentage for an IB grade, used when you log the grade
 * itself rather than a raw mark. Takes the midpoint of that grade's band so a
 * reported 6 does not read as a bare-minimum 6.
 */
export function pctForGrade(grade, boundaries = DEFAULT_BOUNDARIES) {
  const g = Math.min(7, Math.max(1, Math.round(grade)));
  const lo = boundaries[g - 1];
  const hi = g === 7 ? 100 : boundaries[g];
  return +((lo + hi) / 2).toFixed(1);
}

export function gradeFor(pct, boundaries = DEFAULT_BOUNDARIES) {
  let g = 1;
  for (let i = 0; i < boundaries.length; i++) if (pct >= boundaries[i]) g = i + 1;
  return Math.min(7, Math.max(1, g));
}

/**
 * Exponentially weighted mean percentage, oldest first.
 *
 * Weights are built from the newest entry backwards and normalised, rather than
 * seeding the accumulator with the oldest value — seeding leaves the first
 * assessment holding (1-alpha)^(n-1) of the total, which for a handful of tests
 * makes the result almost indistinguishable from a plain average.
 */
export function ewma(values, alpha = ALPHA) {
  if (!values.length) return null;
  let num = 0, den = 0, w = alpha;
  for (let i = values.length - 1; i >= 0; i--) {
    num += values[i] * w;
    den += w;
    w *= (1 - alpha);
  }
  return num / den;
}

export function pctOf(entry) {
  if (!entry.max) return null;
  return (entry.raw / entry.max) * 100;
}

/** How much an assessment counts. A mock is worth more than a quiz. */
export const DEFAULT_WEIGHT = 1;

export function weightOf(entry) {
  const w = Number(entry?.weight);
  return Number.isFinite(w) && w >= 0 ? w : DEFAULT_WEIGHT;
}

/**
 * Weighted, recency-decayed mean. Each assessment carries two weights: how
 * recent it is, and how much it counts. A mock sat last term should outrank a
 * quiz sat yesterday, and only an explicit weight can say so.
 */
export function weightedMean(points, alpha = ALPHA) {
  if (!points.length) return null;
  let num = 0, den = 0, recency = alpha;
  for (let i = points.length - 1; i >= 0; i--) {
    const w = recency * points[i].weight;
    num += points[i].pct * w;
    den += w;
    recency *= (1 - alpha);
  }
  // Everything weighted zero carries no information; fall back to recency alone.
  return den > 0 ? num / den : ewma(points.map(p => p.pct), alpha);
}

/**
 * Predicted grade for one subject from its logged assessments.
 * @returns {{pct:number, grade:number, count:number, trend:number,
 *            weighted:boolean}|null}
 */
export function predict(entries, boundaries = DEFAULT_BOUNDARIES) {
  const points = [...entries]
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .map(e => ({ pct: pctOf(e), weight: weightOf(e) }))
    .filter(p => p.pct !== null);
  if (!points.length) return null;

  const pct = weightedMean(points);
  const half = Math.max(1, Math.floor(points.length / 2));
  const early = weightedMean(points.slice(0, half));
  return {
    pct: +pct.toFixed(1),
    grade: gradeFor(pct, boundaries),
    count: points.length,
    trend: +(pct - early).toFixed(1),
    weighted: points.some(p => p.weight !== DEFAULT_WEIGHT),
  };
}

/** The weakest paper within a subject, by mean percentage. */
export function weakestPaper(entries) {
  const byPaper = new Map();
  for (const e of entries) {
    const p = pctOf(e);
    if (p === null) continue;
    const k = e.paper || 'Overall';
    if (!byPaper.has(k)) byPaper.set(k, []);
    byPaper.get(k).push(p);
  }
  let worst = null;
  for (const [paper, list] of byPaper) {
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    if (!worst || mean < worst.pct) worst = { paper, pct: +mean.toFixed(1), count: list.length };
  }
  return worst;
}

/**
 * The IB TOK/EE bonus matrix. Rows are TOK grades, columns EE grades.
 * An E in either is a failing condition for the diploma, not a points value.
 */
export const BONUS_MATRIX = {
  A: { A: 3, B: 3, C: 2, D: 2, E: 'F' },
  B: { A: 3, B: 2, C: 1, D: 1, E: 'F' },
  C: { A: 2, B: 1, C: 1, D: 0, E: 'F' },
  D: { A: 2, B: 1, C: 0, D: 0, E: 'F' },
  E: { A: 'F', B: 'F', C: 'F', D: 'F', E: 'F' },
};

export function coreBonus(tok, ee) {
  if (!tok || !ee) return { points: 0, fail: false, known: false };
  const row = BONUS_MATRIX[String(tok).toUpperCase()];
  const v = row?.[String(ee).toUpperCase()];
  if (v === undefined) return { points: 0, fail: false, known: false };
  if (v === 'F') return { points: 0, fail: true, known: true };
  return { points: v, fail: false, known: true };
}

/**
 * Full projection out of 45.
 * Subjects with no logged assessment contribute nothing and are listed as
 * unknown rather than silently assumed.
 */
export function project({ subjects, grades, tok = null, ee = null, target = 45,
                          boundaries = {} }) {
  const perSubject = subjects.map(s => {
    const entries = grades.filter(g => g.subjectId === s.id);
    const p = predict(entries, boundaries[s.id] ?? DEFAULT_BOUNDARIES);
    return {
      subject: s,
      ...(p ?? { pct: null, grade: null, count: 0, trend: 0 }),
      weakest: weakestPaper(entries),
    };
  });

  const known = perSubject.filter(p => p.grade !== null);
  const subjectPoints = known.reduce((a, p) => a + p.grade, 0);
  const bonus = coreBonus(tok, ee);
  const total = subjectPoints + bonus.points;

  const weakest = known.length
    ? known.reduce((a, b) => (b.grade < a.grade ? b : a))
    : null;

  return {
    perSubject,
    knownCount: known.length,
    unknownCount: perSubject.length - known.length,
    subjectPoints,
    bonus,
    total,
    /** Best case if every unlogged subject came in at 7. */
    ceiling: total + (perSubject.length - known.length) * 7 + (bonus.known ? 0 : 3),
    target,
    gap: total - target,
    weakest,
  };
}
