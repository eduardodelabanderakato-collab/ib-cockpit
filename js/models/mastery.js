export const LEVELS = ['Untouched', 'Seen', 'Practiced', 'Solid', 'Mastered'];
export const MAX_LEVEL = 4;

/** Half-life in days per level. Index 0 is unused — an untouched node has nothing to forget. */
export const HALF_LIVES = [0, 5, 12, 30, 75];

export const THRESHOLDS = { fresh: 0.70, dimming: 0.40, fading: 0.20 };

const DAY = 86400000;

export function daysSince(lastTouched, now = Date.now()) {
  if (!lastTouched) return Infinity;
  return (now - Date.parse(lastTouched)) / DAY;
}

/** Ebbinghaus-style retention: halves once per half-life. */
export function freshness(level, days) {
  if (level <= 0) return 0;
  if (!isFinite(days)) return 0;
  return Math.pow(2, -days / HALF_LIVES[level]);
}

export function stateOf(level, days) {
  if (level <= 0) return 'untouched';
  const f = freshness(level, days);
  if (f >= THRESHOLDS.fresh) return 'fresh';
  if (f >= THRESHOLDS.dimming) return 'dimming';
  if (f >= THRESHOLDS.fading) return 'fading';
  return 'lapsed';
}

/** Continuous 0..4 mastery, so progress reflects decay rather than checkbox count. */
export function effectiveMastery(level, days) {
  if (level <= 0) return 0;
  return level - 1 + freshness(level, days);
}

export function emptyRecord() {
  return { level: 0, lastTouched: null, touches: 0 };
}

export function capture(record, now = Date.now()) {
  const r = record ?? emptyRecord();
  return {
    level: Math.min(MAX_LEVEL, r.level + 1),
    lastTouched: new Date(now).toISOString(),
    touches: r.touches + 1,
  };
}

/**
 * Demote a lapsed node by exactly one level. lastTouched is reset so a long
 * absence costs one level, not one per elapsed half-life.
 */
export function decay(record, now = Date.now()) {
  const r = record ?? emptyRecord();
  if (r.level <= 0) return r;
  if (stateOf(r.level, daysSince(r.lastTouched, now)) !== 'lapsed') return r;
  return {
    level: r.level - 1,
    lastTouched: new Date(now).toISOString(),
    touches: r.touches,
  };
}

export function decayAll(records, now = Date.now()) {
  const out = {};
  for (const [id, rec] of Object.entries(records)) out[id] = decay(rec, now);
  return out;
}

export function subjectProgress(nodeIds, records, now = Date.now()) {
  if (!nodeIds.length) return 0;
  let sum = 0;
  for (const id of nodeIds) {
    const r = records[id];
    sum += r ? effectiveMastery(r.level, daysSince(r.lastTouched, now)) : 0;
  }
  return sum / (MAX_LEVEL * nodeIds.length);
}

/** Fading nodes, worst freshness first — the "rescue" work queue. */
export function rescueQueue(nodeIds, records, now = Date.now()) {
  return nodeIds
    .map(id => {
      const r = records[id];
      if (!r || r.level <= 0) return null;
      const d = daysSince(r.lastTouched, now);
      if (stateOf(r.level, d) !== 'fading') return null;
      return { id, level: r.level, days: d, freshness: freshness(r.level, d) };
    })
    .filter(Boolean)
    .sort((a, b) => a.freshness - b.freshness);
}
