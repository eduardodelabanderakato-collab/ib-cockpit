import * as store from './store.js';

export const DEFAULTS = {
  meta:      { schema: store.SCHEMA, session: '2028-05', dpStart: '2026-08', targetPoints: 45 },
  mastery:   {},
  sessions:  [],
  notes:     {},
  notebook:  [],
  checks:    [],
  deadlines: [],
  grades:    [],
  quests:    { date: null, seed: 0, daily: [], weekly: [] },
  streak:    { current: 0, longest: 0, lastDay: null },
  runs:      [],
  crew:      {},
  settings:  { theme: 'glass', colorOverrides: {}, coachTone: 'honest', backupLastAt: null, phase: null },
};

export function createState() {
  const cache = {};
  const subs = new Map();

  for (const [k, v] of Object.entries(DEFAULTS)) {
    cache[k] = store.read(k, structuredClone(v));
  }
  migrate(cache);

  function get(key) { return cache[key]; }

  function set(key, value) {
    cache[key] = value;
    store.write(key, value);
    for (const fn of subs.get(key) ?? []) fn(value);
    for (const fn of subs.get('*') ?? []) fn(key, value);
  }

  /** Read-modify-write helper so callers never forget to persist. */
  function update(key, fn) {
    const draft = structuredClone(cache[key]);
    const next = fn(draft);
    set(key, next === undefined ? draft : next);
  }

  function subscribe(key, fn) {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(fn);
    return () => subs.get(key).delete(fn);
  }

  return { get, set, update, subscribe };
}

/**
 * Carry old saves forward.
 *
 * XP lived at `xp: { total, bySubject, streak }`. Killing it must not cost
 * anyone the streak that was nested inside it, so the streak is lifted out to
 * its own key and the rest is dropped. Runs before anything reads state, and is
 * a no-op once the old key is gone.
 */
export function migrate(cache) {
  const legacy = store.read('xp', null);
  if (!legacy) return cache;
  const s = legacy.streak;
  const blank = c => !c || (!c.current && !c.longest && !c.lastDay);
  if (s && blank(cache.streak)) {
    cache.streak = {
      current: Number(s.current) || 0,
      longest: Number(s.longest) || 0,
      lastDay: s.lastDay ?? null,
    };
    store.write('streak', cache.streak);
  }
  store.remove('xp');
  return cache;
}
