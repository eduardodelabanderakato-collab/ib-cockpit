import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as streak from '../js/models/streak.js';

test('a first study day starts the streak at one', () => {
  const s = streak.updateStreak(streak.empty(), '2026-08-15');
  assert.deepEqual(s, { current: 1, longest: 1, lastDay: '2026-08-15' });
});

test('consecutive days extend it', () => {
  let s = streak.updateStreak(streak.empty(), '2026-08-15');
  s = streak.updateStreak(s, '2026-08-16');
  s = streak.updateStreak(s, '2026-08-17');
  assert.equal(s.current, 3);
  assert.equal(s.longest, 3);
});

test('logging twice in one day does not double-count', () => {
  let s = streak.updateStreak(streak.empty(), '2026-08-15');
  s = streak.updateStreak(s, '2026-08-15');
  assert.equal(s.current, 1);
});

test('a missed day resets the current streak but keeps the record', () => {
  let s = streak.updateStreak(streak.empty(), '2026-08-15');
  s = streak.updateStreak(s, '2026-08-16');
  s = streak.updateStreak(s, '2026-08-20');
  assert.equal(s.current, 1);
  assert.equal(s.longest, 2);
});

test('it survives a month boundary', () => {
  let s = streak.updateStreak(streak.empty(), '2026-08-31');
  s = streak.updateStreak(s, '2026-09-01');
  assert.equal(s.current, 2);
});

test('it survives a leap day', () => {
  let s = streak.updateStreak(streak.empty(), '2028-02-28');
  s = streak.updateStreak(s, '2028-02-29');
  s = streak.updateStreak(s, '2028-03-01');
  assert.equal(s.current, 3);
});

test('a null streak is treated as no streak, not a crash', () => {
  assert.equal(streak.updateStreak(null, '2026-08-15').current, 1);
  assert.equal(streak.updateStreak(undefined, '2026-08-15').current, 1);
});

test('localDay is the local calendar day, zero-padded', () => {
  assert.equal(streak.localDay(new Date(2026, 7, 5)), '2026-08-05');
  assert.equal(streak.localDay(new Date(2026, 11, 31)), '2026-12-31');
});

test('nothing here awards points — that is the road’s job', () => {
  assert.deepEqual(Object.keys(streak).sort(), ['empty', 'localDay', 'updateStreak']);
});
