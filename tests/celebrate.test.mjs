import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCelebrate } from '../js/ui/celebrate.js';
import { RANKS, rankFor } from '../js/models/road.js';

const opts = (held, lastRank) => ({ rank: rankFor(held), lastRank, ranks: RANKS });

test('the first run never celebrates', () => {
  assert.equal(shouldCelebrate(opts(38, null)), false);
  assert.equal(shouldCelebrate(opts(45, undefined)), false);
});

test('crossing a threshold upward celebrates', () => {
  assert.equal(shouldCelebrate(opts(34, 'Cruising')), true);
  assert.equal(shouldCelebrate(opts(45, 'Apex')), true);
});

test('the same rank never celebrates twice', () => {
  assert.equal(shouldCelebrate(opts(35, 'Climbing')), false);
  assert.equal(shouldCelebrate(opts(37, 'Climbing')), false);
});

test('a dropped score does not celebrate', () => {
  assert.equal(shouldCelebrate(opts(30, 'Stratosphere')), false);
});

test('an unrecognised stored rank stays quiet', () => {
  assert.equal(shouldCelebrate(opts(45, 'Wingman')), false);
});

test('every rank name is unique, or the ordering check is meaningless', () => {
  assert.equal(new Set(RANKS.map(r => r.name)).size, RANKS.length);
});
