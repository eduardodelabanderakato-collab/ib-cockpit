import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/models/boundaries.js';
import { DEFAULT_BOUNDARIES, gradeFor, project } from '../js/models/grades.js';

test('a valid set is seven ascending floors starting at zero', () => {
  assert.equal(B.isValid(DEFAULT_BOUNDARIES), true);
  assert.equal(B.isValid([0, 10, 20, 30, 40, 50, 60]), true);
});

test('invalid sets are rejected rather than silently used', () => {
  assert.equal(B.isValid([0, 10, 20]), false, 'wrong length');
  assert.equal(B.isValid([5, 10, 20, 30, 40, 50, 60]), false, 'must start at 0');
  assert.equal(B.isValid([0, 10, 10, 30, 40, 50, 60]), false, 'must ascend');
  assert.equal(B.isValid([0, 10, 20, 30, 40, 50, 120]), false, 'over 100');
  assert.equal(B.isValid(null), false);
  assert.equal(B.isValid('nope'), false);
});

test('parse explains exactly which boundary is wrong', () => {
  const bad = B.parse([0, 12, 25, 20, 53, 67, 82]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Grade 4 must be above grade 3/);
  assert.match(bad.error, /20 after 25/);
});

test('parse rejects non-numbers and out-of-range percentages', () => {
  assert.match(B.parse([0, 12, 'x', 40, 53, 67, 82]).error, /number/i);
  assert.match(B.parse([0, 12, 25, 40, 53, 67, 140]).error, /0 to 100/);
});

test('parse accepts a good set and always pins grade 1 at zero', () => {
  const r = B.parse([99, 14, 27, 42, 55, 69, 84]);
  assert.equal(r.ok, true);
  assert.equal(r.boundaries[0], 0);
  assert.deepEqual(r.boundaries, [0, 14, 27, 42, 55, 69, 84]);
});

test('a subject falls back to the placeholder until you set your own', () => {
  const settings = { boundaries: { 'math-aa-hl': [0, 9, 19, 30, 41, 53, 66] } };
  assert.deepEqual(B.forSubject(settings, 'math-aa-hl'), [0, 9, 19, 30, 41, 53, 66]);
  assert.deepEqual(B.forSubject(settings, 'physics-hl'), DEFAULT_BOUNDARIES);
  assert.deepEqual(B.forSubject({}, 'physics-hl'), DEFAULT_BOUNDARIES);
  assert.equal(B.isCustom(settings, 'math-aa-hl'), true);
  assert.equal(B.isCustom(settings, 'physics-hl'), false);
});

test('a corrupt stored set is ignored rather than breaking the projection', () => {
  const settings = { boundaries: { 'math-aa-hl': [0, 90, 10] } };
  assert.deepEqual(B.forSubject(settings, 'math-aa-hl'), DEFAULT_BOUNDARIES);
});

test('impact names the grade the generic table was getting wrong', () => {
  // 66% is a 5 on the generic table but a 7 where the boundaries run lower.
  const low = [0, 9, 19, 30, 41, 53, 66];
  assert.equal(gradeFor(66, DEFAULT_BOUNDARIES), 5);
  const i = B.impact(66, low);
  assert.equal(i.generic, 5);
  assert.equal(i.actual, 7);
  assert.equal(i.shifted, true);
});

test('impact reports no shift when the tables agree', () => {
  assert.equal(B.impact(90, DEFAULT_BOUNDARIES).shifted, false);
});

test('bandFor gives the window a grade occupies, with 7 open to the top', () => {
  assert.deepEqual(B.bandFor(7), { from: 82, to: 100 });
  assert.deepEqual(B.bandFor(1), { from: 0, to: 12 });
  assert.deepEqual(B.bandFor(99), B.bandFor(7));
});

test('per-subject boundaries actually change the projection out of 45', () => {
  const subjects = [{ id: 'math-aa-hl', short: 'Math' }, { id: 'physics-hl', short: 'Phys' }];
  const grades = [
    { subjectId: 'math-aa-hl', ts: '2027-01-01', raw: 66, max: 100 },
    { subjectId: 'physics-hl', ts: '2027-01-01', raw: 66, max: 100 },
  ];
  const generic = project({ subjects, grades });
  const withOwn = project({ subjects, grades,
    boundaries: B.table({ boundaries: { 'math-aa-hl': [0, 9, 19, 30, 41, 53, 66] } }, subjects) });

  assert.equal(generic.total, 10, 'two 5s under the generic table');
  assert.equal(withOwn.total, 12, 'Math becomes a 7 under its real boundaries');
});
