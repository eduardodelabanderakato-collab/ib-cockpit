import * as mastery from './mastery.js';

/**
 * What to study right now.
 *
 * Every node is scored on five competing pressures. The dominant term becomes
 * the human-readable reason, so the recommendation always explains itself.
 * Weights live here so they can be tuned once real behaviour exists.
 */
export const WEIGHTS = {
  // Decay outweighs everything else on purpose: rescuing a topic you are
  // actively forgetting is worth more before an exam than opening new ground.
  decay: 1.8,
  deadline: 1.2,
  weakness: 1.0,
  neglect: 0.8,
  pacing: 0.6,
  recency: -0.5,
};

const DAY = 86400000;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export const REASONS = {
  decay: 'fading fastest',
  deadline: 'assessment approaching',
  weakness: 'weakest subject',
  neglect: 'longest neglected',
  pacing: 'behind the calendar',
  recency: 'just studied',
};

/**
 * @returns {Array<{node, score:number, reason:string, terms:object}>}
 */
export function rank({ subjects, nodesBySubject, records = {}, sessions = [],
                       deadlines = [], expected = 0, phase = null,
                       now = Date.now(), limit = 5 }) {
  // Per-subject context computed once.
  const ctx = new Map();
  for (const s of subjects) {
    const nodes = nodesBySubject[s.id] ?? [];
    const ids = nodes.map(n => n.id);
    const progress = mastery.subjectProgress(ids, records, now);

    let latest = 0;
    for (const v of sessions) if (v.subjectId === s.id) latest = Math.max(latest, Date.parse(v.ts));
    for (const n of nodes) {
      const t = records[n.id]?.lastTouched;
      if (t) latest = Math.max(latest, Date.parse(t));
    }
    const neglectDays = latest ? (now - latest) / DAY : 60;

    const soonest = deadlines
      .filter(d => d.status !== 'done' && d.subjectId === s.id)
      .map(d => (Date.parse(d.due) - now) / DAY)
      .filter(d => d > -30)
      .sort((a, b) => a - b)[0];

    ctx.set(s.id, {
      progress,
      neglect: clamp01(neglectDays / 21),
      weakness: clamp01(1 - progress / Math.max(0.05, expected || 0.05)) * 0.5
              + clamp01(1 - progress) * 0.5,
      deadline: soonest === undefined ? 0 : clamp01((30 - soonest) / 30),
      pacing: clamp01((expected - progress) / Math.max(0.05, expected || 0.05)),
    });
  }

  const scored = [];
  for (const s of subjects) {
    const c = ctx.get(s.id);
    for (const n of nodesBySubject[s.id] ?? []) {
      if (phase && n.phase !== phase) continue;
      const rec = records[n.id];
      const level = rec?.level ?? 0;
      const days = mastery.daysSince(rec?.lastTouched, now);

      // A node you have never opened has nothing to decay; its pull comes from
      // pacing and subject weakness instead.
      const decay = level > 0 ? 1 - mastery.freshness(level, days) : 0;
      const recency = level > 0 && days < 1 ? 1 : 0;

      const terms = {
        decay: WEIGHTS.decay * decay,
        deadline: WEIGHTS.deadline * c.deadline,
        weakness: WEIGHTS.weakness * c.weakness,
        neglect: WEIGHTS.neglect * c.neglect,
        pacing: WEIGHTS.pacing * c.pacing,
        recency: WEIGHTS.recency * recency,
      };
      const score = Object.values(terms).reduce((a, b) => a + b, 0);

      const dominant = Object.entries(terms)
        .filter(([k]) => k !== 'recency')
        .sort((a, b) => b[1] - a[1])[0][0];

      scored.push({ node: n, subject: s, score: +score.toFixed(4),
                    reason: REASONS[dominant], terms });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A short plan for one sitting, spread across subjects rather than stacked. */
export function sessionPlan(args, minutes = 60) {
  const picks = rank({ ...args, limit: 24 });
  const out = [];
  const used = new Set();
  for (const p of picks) {
    if (used.has(p.subject.id)) continue;
    used.add(p.subject.id);
    out.push(p);
    if (out.length >= 3) break;
  }
  const slice = Math.max(10, Math.round(minutes / Math.max(1, out.length) / 5) * 5);
  return out.map(p => ({ ...p, minutes: slice }));
}
