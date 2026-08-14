import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as xp from '../js/models/xp.js';

test('xpToNext follows the spec curve 500 + 250(n-1)', () => {
  assert.equal(xp.xpToNext(1), 500);
  assert.equal(xp.xpToNext(2), 750);
  assert.equal(xp.xpToNext(5), 1500);
});

test('cumulativeXp matches the sum of the curve', () => {
  assert.equal(xp.cumulativeXp(1), 0);
  assert.equal(xp.cumulativeXp(2), 500);
  assert.equal(xp.cumulativeXp(3), 1250);
  assert.equal(xp.cumulativeXp(5), 3500);
});

test('levelFromXp reports level, progress into it, and requirement', () => {
  assert.deepEqual(xp.levelFromXp(0),    { level: 1, into: 0,   need: 500 });
  assert.deepEqual(xp.levelFromXp(499),  { level: 1, into: 499, need: 500 });
  assert.deepEqual(xp.levelFromXp(500),  { level: 2, into: 0,   need: 750 });
  assert.deepEqual(xp.levelFromXp(3500), { level: 5, into: 0,   need: 1500 });
});

test('streakMultiplier rises to a 1.5x cap at 30 days', () => {
  assert.equal(xp.streakMultiplier(0), 1);
  assert.equal(xp.streakMultiplier(30), 1.5);
  assert.equal(xp.streakMultiplier(365), 1.5);
});

test('award scales the base value by the streak multiplier', () => {
  assert.equal(xp.award('study', { minutes: 60 }, 0), 60);
  assert.equal(xp.award('study', { minutes: 60 }, 30), 90);
  assert.equal(xp.award('capture', { level: 3 }, 0), 150);
  assert.equal(xp.award('rescue', {}, 0), 75);
  assert.equal(xp.award('gradeLog', {}, 0), 100);
  assert.equal(xp.award('firstNote', {}, 0), 25);
});

test('award rejects an unknown kind rather than silently returning zero', () => {
  assert.throws(() => xp.award('nonsense', {}, 0), /unknown xp award/i);
});

test('updateStreak increments on a consecutive day', () => {
  const s = xp.updateStreak({ current: 4, longest: 9, lastDay: '2026-09-01' }, '2026-09-02');
  assert.deepEqual(s, { current: 5, longest: 9, lastDay: '2026-09-02' });
});

test('updateStreak is idempotent within the same day', () => {
  const s = xp.updateStreak({ current: 4, longest: 9, lastDay: '2026-09-01' }, '2026-09-01');
  assert.deepEqual(s, { current: 4, longest: 9, lastDay: '2026-09-01' });
});

test('updateStreak resets after a missed day', () => {
  const s = xp.updateStreak({ current: 12, longest: 12, lastDay: '2026-09-01' }, '2026-09-04');
  assert.deepEqual(s, { current: 1, longest: 12, lastDay: '2026-09-04' });
});

test('updateStreak records a new longest', () => {
  const s = xp.updateStreak({ current: 9, longest: 9, lastDay: '2026-09-01' }, '2026-09-02');
  assert.equal(s.longest, 10);
});

test('updateStreak starts a streak from empty state', () => {
  const s = xp.updateStreak({ current: 0, longest: 0, lastDay: null }, '2026-09-02');
  assert.deepEqual(s, { current: 1, longest: 1, lastDay: '2026-09-02' });
});
