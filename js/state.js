import * as store from './store.js';

export const DEFAULTS = {
  meta:      { schema: store.SCHEMA, session: '2028-05', dpStart: '2026-08', targetPoints: 45 },
  mastery:   {},
  sessions:  [],
  notes:     {},
  deadlines: [],
  grades:    [],
  quests:    { date: null, seed: 0, daily: [], weekly: [] },
  xp:        { total: 0, bySubject: {}, streak: { current: 0, longest: 0, lastDay: null } },
  crew:      {},
  settings:  { theme: 'glass', colorOverrides: {}, coachTone: 'honest', backupLastAt: null, phase: null },
};

export function createState() {
  const cache = {};
  const subs = new Map();

  for (const [k, v] of Object.entries(DEFAULTS)) {
    cache[k] = store.read(k, structuredClone(v));
  }

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
