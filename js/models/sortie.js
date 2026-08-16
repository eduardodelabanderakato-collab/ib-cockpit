import * as mastery from './mastery.js';
import { OUTCOMES } from './recall.js';

/**
 * The sortie: studying itself, as a run.
 *
 * Everything else here measures study after the fact. This is the study — a
 * hand of targets dealt from what you are actually forgetting, a clock on each
 * one, and a result at the end you can beat next time.
 *
 * The clock is the point. Retrieval practice works because it is effortful and
 * because you commit to an answer before checking; a list of topics with no
 * pressure lets you look at a title, think "yeah, I know that", and tick it.
 * A target that expires is scored as a miss whether you knew it or not, which
 * is the first thing in this whole app that can actually go against you.
 *
 * No question bank is invented here. The prompt is the real syllabus node and a
 * real IB command term, and what you produce against it is judged by you — the
 * same self-graded retrieval the recall checks already use, but timed and
 * scored as one continuous run.
 */

/** What a target is worth. A miss is worth nothing; nothing is subtracted. */
export const SCORE = { yes: 3, partly: 1, no: 0, expired: 0 };

/** Seconds a single target is allowed before it expires. */
export const DEFAULT_SECONDS = 90;
export const MIN_TARGETS = 3;
export const MAX_TARGETS = 20;

/** Roughly how long one target takes, including the thinking you do off-screen. */
export const MINUTES_PER_TARGET = 2.5;

export function sizeFor(minutes) {
  const n = Math.round((Number(minutes) || 0) / MINUTES_PER_TARGET);
  return Math.max(MIN_TARGETS, Math.min(MAX_TARGETS, n));
}

/**
 * How hard the clock presses.
 *
 * Spreading the budget evenly is the sane default, but a long budget over few
 * targets gives you four minutes to remember one definition, which is no
 * pressure at all. Fixed paces let you choose a real drill.
 */
export const PACES = [
  { id: 'budget', label: 'By budget', seconds: null, note: 'Split the time evenly' },
  { id: 'steady', label: '90s',  seconds: 90, note: 'Enough to work something through' },
  { id: 'brisk',  label: '60s',  seconds: 60, note: 'Recall, not derivation' },
  { id: 'rapid',  label: '30s',  seconds: 30, note: 'Cold recall only. It will hurt' },
];

export function paceById(id) {
  return PACES.find(p => p.id === id) ?? PACES[0];
}

export function secondsFor(minutes, size, pace = 'budget') {
  const fixed = paceById(pace).seconds;
  if (fixed) return fixed;
  if (!size) return DEFAULT_SECONDS;
  const per = Math.round(((Number(minutes) || 0) * 60) / size);
  return Math.max(30, Math.min(240, per || DEFAULT_SECONDS));
}

/**
 * Where each target came from, worst first.
 *
 * `lapsed` leads because ground you have completely lost is the most expensive
 * thing on the board, and `new` comes last because opening fresh syllabus is
 * the one thing you can always do and never the most urgent.
 */
export const KINDS = {
  lapsed: { label: 'LOST',    rank: 0, note: 'You have lost this one — take it back' },
  fading: { label: 'FADING',  rank: 1, note: 'Slipping. Catch it before it goes' },
  cold:   { label: 'COLD',    rank: 2, note: 'This subject has not been touched in a while' },
  new:    { label: 'NEW',     rank: 3, note: 'Fresh ground' },
};

/**
 * Deal a hand.
 *
 * @returns {{targets:Array, size:number, seconds:number, minutes:number}}
 */
export function deal({ index, records = {}, sessions = [], minutes = 25,
                       halfLives, now = Date.now(), subjectId = null,
                       pace = 'budget' } = {}) {
  const subjects = index.examined.filter(s => !subjectId || s.id === subjectId);
  const size = sizeFor(minutes);
  const seen = new Set();
  const pool = [];

  const lastTouched = new Map();
  for (const s of sessions) {
    const t = Date.parse(s.ts);
    if (Number.isFinite(t)) lastTouched.set(s.subjectId, Math.max(lastTouched.get(s.subjectId) ?? 0, t));
  }

  for (const s of subjects) {
    const nodes = index.bySubject?.get(s.id)?.nodes ?? [];
    const ids = nodes.map(n => n.id);
    const cold = ((now - (lastTouched.get(s.id) ?? 0)) / 86400000) >= 7;

    for (const item of mastery.rescueQueue(ids, records, now, halfLives)) {
      const n = index.byId.get(item.id);
      if (!n || seen.has(n.id)) continue;
      seen.add(n.id);
      pool.push({
        node: n, subject: s, kind: item.state, level: item.level,
        days: item.days, freshness: item.freshness,
      });
    }

    for (const n of nodes) {
      if (seen.has(n.id)) continue;
      const rec = records[n.id];
      const level = rec?.level ?? 0;
      // Anything already captured and still fresh is not worth a target.
      if (level > 0) continue;
      seen.add(n.id);
      pool.push({
        node: n, subject: s, kind: cold ? 'cold' : 'new', level: 0,
        days: Infinity, freshness: 0,
      });
    }
  }

  pool.sort((a, b) =>
    (KINDS[a.kind].rank - KINDS[b.kind].rank) || (a.freshness - b.freshness));

  // Spread across subjects rather than emptying the worst one first: six
  // subjects all count towards 45, and a run that only ever drills Physics is
  // how the other five go cold.
  //
  // Interleaved *inside* each priority band, never across them. Round-robining
  // the whole pool at once lets one subject's untouched nodes jump ahead of
  // another's fading ones, which inverts the entire point of the queue: you
  // would be opening new ground while ground you already hold slips away.
  const targets = [];
  for (const kind of Object.keys(KINDS).sort((a, b) => KINDS[a].rank - KINDS[b].rank)) {
    const band = pool.filter(t => t.kind === kind);
    if (band.length) targets.push(...interleave(band, t => t.subject.id));
    if (targets.length >= size) break;
  }
  targets.length = Math.min(targets.length, size);

  return {
    targets, size: targets.length, minutes, pace,
    seconds: secondsFor(minutes, targets.length, pace),
  };
}

/** Round-robin across groups, preserving each group's internal order. */
export function interleave(items, keyOf) {
  const groups = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const lists = [...groups.values()];
  const out = [];
  for (let i = 0; out.length < items.length; i++) {
    let moved = false;
    for (const l of lists) {
      if (i < l.length) { out.push(l[i]); moved = true; }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Which IB command term to demand, rotated so the same node asks a different
 * question each time it comes up. Terms are the official glossary shipped in
 * data/command-terms.json; nothing here is invented.
 */
export function promptFor(target, terms, spin = 0) {
  if (!terms?.length) return null;
  const key = `${target.node.id}:${target.level}:${spin}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  // Higher mastery earns a harder assessment objective.
  const tier = Math.min(terms.length - 1, Math.max(0, Math.floor((target.level - 1) / 1.5)));
  const band = terms[tier] ?? terms[0];
  return { term: band.terms[h % band.terms.length], ao: band.ao, demand: band.demand };
}

/** A blank run, ready to fly. */
export function start(hand, now = Date.now()) {
  return {
    startedAt: now, at: 0, results: [],
    size: hand.size, seconds: hand.seconds, minutes: hand.minutes,
  };
}

/** Record one target's outcome and advance. `outcome` may also be 'expired'. */
export function answer(run, outcome, now = Date.now()) {
  const key = outcome === 'expired' ? 'expired' : outcome;
  if (!(key in SCORE)) throw new Error(`Unknown sortie outcome: ${outcome}`);
  return {
    ...run,
    at: run.at + 1,
    results: [...run.results, { outcome: key, at: now }],
  };
}

export function isOver(run) {
  return run.at >= run.size;
}

export function current(run, hand) {
  return isOver(run) ? null : hand.targets[run.at];
}

/**
 * Score a finished run.
 *
 * `accuracy` counts expired targets against you. A run where the clock beat you
 * six times is not a 100% run, and reporting it as one would be the same lie as
 * XP was.
 */
export function score(run) {
  const r = run.results ?? [];
  const count = o => r.filter(x => x.outcome === o).length;
  const hits = count('yes'), grazes = count('partly');
  const misses = count('no'), expired = count('expired');
  const points = r.reduce((a, x) => a + SCORE[x.outcome], 0);
  const possible = run.size * SCORE.yes;
  return {
    hits, grazes, misses, expired,
    answered: r.length,
    points, possible,
    /** 0–1, where 1 is every target recalled cold inside the clock. */
    ratio: possible ? points / possible : 0,
    accuracy: r.length ? (hits + grazes * 0.5) / r.length : 0,
    seconds: Math.round(((r.at(-1)?.at ?? run.startedAt) - run.startedAt) / 1000),
  };
}

/** How the run reads. Thresholds are deliberately unkind at the top. */
export const GRADES = [
  { at: 0.00, name: 'Aborted',  note: 'The clock won. Fly it again shorter.' },
  { at: 0.35, name: 'Scrappy',  note: 'You got through it. Most of it did not stick.' },
  { at: 0.55, name: 'Solid',    note: 'A real run. This is what most days should look like.' },
  { at: 0.75, name: 'Clean',    note: 'Almost everything came back cold.' },
  { at: 0.92, name: 'Perfect',  note: 'Every target, inside the clock. Deal a harder hand.' },
];

export function gradeOf(ratio) {
  let hit = GRADES[0];
  for (const g of GRADES) if (ratio >= g.at) hit = g;
  return hit;
}

/** A run worth storing, flattened for the history. */
export function toRecord(run, hand, now = Date.now()) {
  const s = score(run);
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now).toISOString(),
    size: run.size, minutes: run.minutes,
    hits: s.hits, grazes: s.grazes, misses: s.misses, expired: s.expired,
    points: s.points, possible: s.possible,
    ratio: +s.ratio.toFixed(4),
    grade: gradeOf(s.ratio).name,
    subjectIds: [...new Set(hand.targets.slice(0, run.results.length)
      .map(t => t.subject.id))],
  };
}

/** The run to beat: most points, then best ratio. Ties go to the older run. */
export function best(history = []) {
  if (!history.length) return null;
  return history.reduce((a, b) =>
    (b.points > a.points || (b.points === a.points && b.ratio > a.ratio)) ? b : a);
}

export function isBest(record, history = []) {
  const b = best(history.filter(r => r.id !== record.id));
  if (!b) return history.length > 1;
  return record.points > b.points
    || (record.points === b.points && record.ratio > b.ratio);
}

/** Runs flown today, for the daily rhythm the streak alone cannot show. */
export function flownOn(history, day, localDay) {
  return history.filter(r => localDay(new Date(r.ts)) === day).length;
}

export { OUTCOMES };
