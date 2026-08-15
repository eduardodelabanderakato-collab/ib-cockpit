import { test } from 'node:test';
import assert from 'node:assert/strict';
import { road, rankFor, nextThreshold, MAX_POINTS } from '../js/models/road.js';
import * as R from '../js/models/road.js';

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

/* ── ground held vs points held ── */

test('backedGrade climbs with coverage and never exceeds 7', () => {
  assert.equal(R.backedGrade(0), 1);
  assert.equal(R.backedGrade(0.06), 2);
  assert.equal(R.backedGrade(0.5), 5);
  assert.equal(R.backedGrade(0.78), 7);
  assert.equal(R.backedGrade(1), 7);
});

test('capturesToBack is zero once the coverage is already there', () => {
  assert.equal(R.capturesToBack(0.9, 50, 7), 0);
  assert.equal(R.capturesToBack(0.5, 50, 4), 0);
});

test('capturesToBack counts the units a capture actually adds', () => {
  // 50 nodes, coverage 0.58, aiming for the 0.78 a 7 needs:
  // (0.78 - 0.58) * 4 * 50 = 40 units, and one capture is one unit.
  assert.equal(R.capturesToBack(0.58, 50, 7), 40);
});

test('one capture drops the count by exactly one', () => {
  const nodes = 40, need = R.BACKING[6];
  const before = R.capturesToBack(need - 10 / (4 * nodes), nodes, 7);
  const after = R.capturesToBack(need - 9 / (4 * nodes), nodes, 7);
  assert.equal(before - after, 1);
});

test('a subject with no nodes cannot be short of captures', () => {
  assert.equal(R.capturesToBack(0, 0, 7), 0);
});

const SUBJECTS = [
  { id: 'a', short: 'A' }, { id: 'b', short: 'B' },
];

function boardOf(grades) {
  return R.road({ subjects: SUBJECTS, grades, tok: 'A', ee: 'A' });
}

test('ground separates what you score from what you have covered', () => {
  const board = boardOf([
    { subjectId: 'a', raw: 90, max: 100, ts: '2027-01-01' },
    { subjectId: 'b', raw: 90, max: 100, ts: '2027-01-01' },
  ]);
  // Both score a 7; only A has the syllabus underneath it.
  const g = R.ground(board, id => id === 'a'
    ? { coverage: 0.85, nodes: 40 }
    : { coverage: 0.20, nodes: 40 });

  const a = g.segments.find(s => s.subject.id === 'a');
  const b = g.segments.find(s => s.subject.id === 'b');
  assert.equal(a.backs, 7);
  assert.equal(b.backs, 3);
  assert.equal(a.exposure, 0);
  assert.equal(b.exposure, 4, 'scoring a 7 on a third of the course is exposure');
  assert.equal(g.held, 17, '7 + 7 + 3 bonus');
  assert.equal(g.backed, 13, '7 + 3 + 3 bonus');
  assert.equal(g.exposed, 4);
});

test('coverage ahead of scores reads as unconverted, not exposure', () => {
  const board = boardOf([{ subjectId: 'a', raw: 45, max: 100, ts: '2027-01-01' }]);
  const g = R.ground(board, id => id === 'a'
    ? { coverage: 0.85, nodes: 40 }
    : { coverage: 0, nodes: 0 });
  const a = g.segments.find(s => s.subject.id === 'a');
  assert.equal(a.grade, 4);
  assert.equal(a.backs, 7);
  assert.equal(a.exposure, -3);
  assert.equal(g.unconverted, 3);
  assert.equal(a.route, 'paper', 'the ground is held; the next point is on the paper');
});

test('a thin subject routes the next point through the map, not the paper', () => {
  const board = boardOf([{ subjectId: 'a', raw: 45, max: 100, ts: '2027-01-01' }]);
  const g = R.ground(board, () => ({ coverage: 0.10, nodes: 40 }));
  const a = g.segments.find(s => s.subject.id === 'a');
  assert.equal(a.aiming, 5);
  assert.equal(a.route, 'ground');
  assert.ok(a.captures > 0);
});

test('the front line is the fewest captures, not the lowest grade', () => {
  const board = boardOf([
    { subjectId: 'a', raw: 45, max: 100, ts: '2027-01-01' },
    { subjectId: 'b', raw: 30, max: 100, ts: '2027-01-01' },
  ]);
  const g = R.ground(board, id => id === 'a'
    ? { coverage: 0.41, nodes: 20 }   // one unit short of the 0.42 a 5 needs
    : { coverage: 0.05, nodes: 200 }); // far further from the 0.28 a 4 needs
  assert.equal(g.front.subject.id, 'a');
  assert.ok(g.front.captures < g.segments.find(s => s.subject.id === 'b').captures);
});

test('a board with nothing captured anywhere still reports a front', () => {
  const board = boardOf([{ subjectId: 'a', raw: 45, max: 100, ts: '2027-01-01' }]);
  const g = R.ground(board, () => ({ coverage: 0, nodes: 30 }));
  assert.ok(g.front);
  assert.equal(g.front.subject.id, 'a');
});

test('unknown subjects aim for a 1 and are not counted as exposed', () => {
  const board = boardOf([]);
  const g = R.ground(board, () => ({ coverage: 0, nodes: 30 }));
  for (const s of g.segments) {
    assert.equal(s.known, false);
    assert.equal(s.exposure, 0);
    assert.equal(s.aiming, 1);
  }
  assert.equal(g.exposed, 0);
});
