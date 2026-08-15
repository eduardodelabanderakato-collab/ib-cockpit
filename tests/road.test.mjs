import { test } from 'node:test';
import assert from 'node:assert/strict';
import { road, rankFor, nextThreshold, MAX_POINTS } from '../js/models/road.js';

const S = [
  { id: 'a', short: 'A' }, { id: 'b', short: 'B' }, { id: 'c', short: 'C' },
  { id: 'd', short: 'D' }, { id: 'e', short: 'E' }, { id: 'f', short: 'F' },
];
const g = (id, raw) => ({ subjectId: id, ts: '2027-01-01', raw, max: 100 });

test('nothing logged means nothing held, and every point still available', () => {
  const r = road({ subjects: S });
  assert.equal(r.held, 0);
  assert.equal(r.missing, MAX_POINTS);
  assert.equal(r.unknown, 6);
  assert.equal(r.rank.name, 'Grounded');
});

test('the board accounts for exactly 45 points', () => {
  const r = road({
    subjects: S, grades: S.map(s => g(s.id, 90)), tok: 'A', ee: 'A',
  });
  assert.equal(r.held, 45);
  assert.equal(r.missing, 0);
  assert.equal(r.rank.name, 'Perfect');
  assert.equal(r.onTarget, true);
});

test('rank tracks the projected score, not activity', () => {
  assert.equal(rankFor(0).name, 'Grounded');
  assert.equal(rankFor(24).name, 'Airborne');
  assert.equal(rankFor(38).name, 'High flight');
  assert.equal(rankFor(44).name, 'Apex');
  assert.equal(rankFor(45).name, 'Perfect');
});

test('rank says how far the next one is', () => {
  const r = rankFor(36);
  assert.equal(r.name, 'Climbing');
  assert.equal(r.next.at, 38);
  assert.equal(r.toNext, 2);
});

test('the top rank has nothing beyond it', () => {
  assert.equal(rankFor(45).next, null);
  assert.equal(rankFor(45).toNext, 0);
});

test('each segment states what the next point actually costs', () => {
  const r = road({ subjects: S, grades: [g('a', 60)] });
  const a = r.segments.find(s => s.subject.id === 'a');
  assert.equal(a.grade, 5);
  assert.match(a.next, /67% for a 6/);
});

test('an unlogged subject says how to get on the board', () => {
  const r = road({ subjects: S });
  assert.match(r.segments[0].next, /Log a score/);
});

test('a maxed subject says so rather than inventing a target', () => {
  const r = road({ subjects: S, grades: [g('a', 95)] });
  assert.equal(r.segments[0].grade, 7);
  assert.equal(r.segments[0].next, 'Maxed');
  assert.equal(r.segments[0].missing, 0);
});

test('the cheapest next point is the one closest to its boundary', () => {
  const r = road({
    subjects: S,
    grades: [g('a', 66), g('b', 41)],   // a is 1% off a 6; b is 12% off a 5
  });
  assert.equal(r.cheapest.subject.id, 'a');
  assert.ok(r.cheapest.gap < 2);
});

test('there is no cheapest point when nothing is on the board', () => {
  assert.equal(road({ subjects: S }).cheapest, null);
});

test('the core bonus counts toward the board', () => {
  const none = road({ subjects: S, grades: [g('a', 90)] });
  const some = road({ subjects: S, grades: [g('a', 90)], tok: 'A', ee: 'A' });
  assert.equal(some.held - none.held, 3);
});

test('held and missing always account for exactly 45', () => {
  for (const grades of [[], [g('a', 60)], S.map(s => g(s.id, 75))]) {
    const r = road({ subjects: S, grades, tok: 'B', ee: 'C' });
    assert.equal(r.held + r.missing, 45);
  }
});
