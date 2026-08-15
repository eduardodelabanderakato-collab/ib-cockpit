import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/models/recall.js';
import * as m from '../js/models/mastery.js';

const obs = (days, outcome, level = 3) => ({ nodeId: 'x', level, days, outcome });

test('a check records what was asked and when', () => {
  const list = R.record([], { nodeId: 'physics-hl:A.1', level: 2, days: 12.34, outcome: 'yes' });
  assert.equal(list.length, 1);
  assert.equal(list[0].nodeId, 'physics-hl:A.1');
  assert.equal(list[0].days, 12.3);
  assert.ok(list[0].ts);
});

test('an unknown outcome is refused rather than silently stored', () => {
  assert.throws(() => R.record([], { nodeId: 'x', level: 1, days: 1, outcome: 'maybe' }),
    /unknown recall outcome/i);
});

test('the answer moves the level: yes up, roughly holds, no down', () => {
  assert.equal(R.applyOutcome(2, 'yes'), 3);
  assert.equal(R.applyOutcome(2, 'partly'), 2);
  assert.equal(R.applyOutcome(2, 'no'), 1);
});

test('the level never leaves its range', () => {
  assert.equal(R.applyOutcome(4, 'yes'), 4);
  assert.equal(R.applyOutcome(0, 'no'), 0);
});

test('too few checks and the shipped default is kept', () => {
  const e = R.estimateHalfLife([obs(10, 'yes'), obs(20, 'no')], 30);
  assert.equal(e.halfLife, 30);
  assert.equal(e.fitted, false);
  assert.equal(e.n, 2);
});

test('a fast forgetter gets a shorter half-life than the shipped 30 days', () => {
  // Remembers at a few days, gone by two weeks.
  const data = [
    obs(2, 'yes'), obs(3, 'yes'), obs(4, 'yes'), obs(5, 'partly'),
    obs(12, 'no'), obs(14, 'no'), obs(16, 'no'), obs(20, 'no'),
    obs(1, 'yes'), obs(18, 'no'), obs(2, 'yes'), obs(15, 'no'),
    obs(3, 'yes'), obs(22, 'no'), obs(4, 'yes'), obs(13, 'no'),
    obs(2, 'yes'), obs(25, 'no'), obs(3, 'yes'), obs(17, 'no'),
  ];
  const e = R.estimateHalfLife(data, 30);
  assert.equal(e.fitted, true);
  assert.ok(e.halfLife < 30, `expected under 30, got ${e.halfLife}`);
  assert.ok(e.halfLife >= 1);
});

test('a slow forgetter gets a longer one', () => {
  const data = Array.from({ length: 20 }, (_, i) =>
    obs(i < 10 ? 20 + i : 60 + i, i < 10 ? 'yes' : 'partly'));
  const e = R.estimateHalfLife(data, 12);
  assert.equal(e.fitted, true);
  assert.ok(e.halfLife > 12, `expected over 12, got ${e.halfLife}`);
});

test('a thin sample only nudges — shrinkage keeps it near the default', () => {
  const fast = Array.from({ length: 5 }, () => obs(40, 'no'));
  const e = R.estimateHalfLife(fast, 30);
  assert.equal(e.fitted, true);
  assert.ok(e.halfLife > e.raw, 'must be pulled back toward the shipped value');
  assert.ok(e.halfLife < 30);
});

test('calibrate returns one half-life per level and never a zero', () => {
  const { halfLives, detail } = R.calibrate([], m.HALF_LIVES);
  assert.deepEqual(halfLives, m.HALF_LIVES);
  assert.equal(detail.length, m.MAX_LEVEL);
  assert.ok(halfLives.slice(1).every(h => h >= 1));
});

test('a fitted curve actually changes what counts as fading', () => {
  // Solid (level 3), 40 days elapsed.
  const shipped = m.stateOf(3, 40);                       // half-life 30 -> dimming
  const fitted = m.stateOf(3, 40, [0, 5, 12, 10, 75]);    // half-life 10 -> lapsed
  assert.notEqual(shipped, fitted);
  assert.equal(fitted, 'lapsed');
});

test('the whole mastery surface accepts a fitted curve', () => {
  const hl = [0, 3, 6, 10, 20];
  const rec = { 'a': { level: 3, lastTouched: new Date(Date.now() - 40 * 86400000).toISOString(), touches: 1 } };
  assert.ok(m.subjectProgress(['a'], rec, Date.now(), hl)
          < m.subjectProgress(['a'], rec, Date.now()));
  assert.equal(m.decay(rec.a, Date.now(), hl).level, 2, 'demotes sooner on a faster curve');
});

test('drift reports how far the fitted curve has moved and which way', () => {
  const d = R.drift([
    { level: 1, fitted: true, halfLife: 3, shipped: 5, n: 20 },
    { level: 2, fitted: true, halfLife: 20, shipped: 12, n: 20 },
    { level: 3, fitted: false, halfLife: 30, shipped: 30, n: 1 },
  ]);
  assert.equal(d.moved, 2);
  assert.equal(d.faster, 1);
  assert.equal(d.slower, 1);
  assert.equal(d.total, 41);
});

test('accuracy summarises how well recent checks actually went', () => {
  const checks = [obs(1, 'yes'), obs(1, 'yes'), obs(1, 'no'), obs(1, 'partly')];
  const a = R.accuracy(checks);
  assert.equal(a.n, 4);
  assert.equal(a.held, 2);
  assert.equal(a.lost, 1);
  assert.equal(a.pct, 63);
  assert.equal(R.accuracy([]), null);
});
