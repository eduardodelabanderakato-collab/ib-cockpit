import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pb from '../js/models/playbook.js';
import { gradeFor } from '../js/models/grades.js';

const DAY = 86400000;
const NOW = Date.parse('2027-03-10T09:00:00Z');
const ago = d => new Date(NOW - d * DAY).toISOString();
const SUBJECTS = [{ id: 'a', short: 'A' }, { id: 'b', short: 'B' }, { id: 'c', short: 'C' }];

test('the phase follows the two-year arc, not the calendar', () => {
  const arc = { dpStart: '2026-08', examStart: '2028-04-28' };
  assert.equal(pb.phaseOf({ ...arc, now: Date.parse('2026-10-01') }).phase, 'dp1');
  assert.equal(pb.phaseOf({ ...arc, now: Date.parse('2027-11-01') }).phase, 'dp2');
  assert.equal(pb.phaseOf({ ...arc, now: Date.parse('2028-04-01') }).phase, 'finals');
});

test('priorities invert across the arc — coursework early, retrieval late', () => {
  assert.ok(pb.WEIGHTS.dp1.coursework > pb.WEIGHTS.finals.coursework);
  assert.ok(pb.WEIGHTS.finals.retrieval > pb.WEIGHTS.dp1.retrieval);
  assert.ok(pb.WEIGHTS.finals.pastPapers > pb.WEIGHTS.dp1.pastPapers);
});

test('every principle states why, not just what', () => {
  for (const [k, p] of Object.entries(pb.PRINCIPLES)) {
    assert.ok(p.name && p.why.length > 30, `${k} does not justify itself`);
  }
});

test('weekly target divides real study hours across every subject', () => {
  assert.equal(pb.weeklyTarget(6, 12), 120);
  assert.equal(pb.weeklyTarget(6, 6), 60);
});

test('under-served subjects are ranked by how far behind they are', () => {
  const sessions = [
    { subjectId: 'a', ts: ago(1), minutes: 200 },
    { subjectId: 'b', ts: ago(2), minutes: 60 },
  ];
  // 3 subjects at 6 weekly hours is a 120-minute share each.
  const out = pb.underServed({ subjects: SUBJECTS, sessions, weeklyHours: 6, now: NOW });
  assert.equal(out[0].subject.id, 'c', 'zero minutes is furthest behind');
  assert.ok(!out.some(x => x.subject.id === 'a'), 'a is over its 120-minute share');
});

test('sessions outside the week do not count toward the share', () => {
  const out = pb.underServed({
    subjects: SUBJECTS, weeklyHours: 6, now: NOW,
    sessions: [{ subjectId: 'a', ts: ago(20), minutes: 600 }],
  });
  assert.ok(out.some(x => x.subject.id === 'a'));
});

test('contact ranks the coldest subject first and marks never-opened ones', () => {
  const out = pb.contact({
    subjects: SUBJECTS, nodesBySubject: { a: [], b: [], c: [] }, records: {},
    sessions: [{ subjectId: 'a', ts: ago(1), minutes: 30 },
               { subjectId: 'b', ts: ago(9), minutes: 30 }],
    now: NOW,
  });
  assert.equal(out[0].subject.id, 'c');
  assert.equal(out[0].ever, false);
  assert.equal(out.at(-1).subject.id, 'a');
});

test('a captured node counts as contact, not just a logged session', () => {
  const out = pb.contact({
    subjects: SUBJECTS,
    nodesBySubject: { a: [{ id: 'a:1' }], b: [], c: [] },
    records: { 'a:1': { level: 2, lastTouched: ago(0), touches: 1 } },
    sessions: [], now: NOW,
  });
  assert.ok(out.find(x => x.subject.id === 'a').days < 1);
});

test('only scores below target, and only unrevisited ones, count as unfixed', () => {
  const grades = [
    { subjectId: 'a', ts: ago(20), raw: 35, max: 100, paper: 'P2' },  // ~3
    { subjectId: 'b', ts: ago(20), raw: 90, max: 100, paper: 'P1' },  // 7
  ];
  const none = pb.unfixedErrors({ grades, sessions: [], targetGrade: 6, gradeFor, now: NOW });
  assert.equal(none.length, 1);
  assert.equal(none[0].g.subjectId, 'a');

  const fixed = pb.unfixedErrors({
    grades, targetGrade: 6, gradeFor, now: NOW,
    sessions: [{ subjectId: 'a', ts: ago(3), minutes: 30, note: 'redo P2 errors' }],
  });
  assert.equal(fixed.length, 0);
});

test('a review before the test does not count as fixing it', () => {
  const out = pb.unfixedErrors({
    grades: [{ subjectId: 'a', ts: ago(5), raw: 35, max: 100, paper: 'P2' }],
    sessions: [{ subjectId: 'a', ts: ago(20), minutes: 30, note: 'review' }],
    targetGrade: 6, gradeFor, now: NOW,
  });
  assert.equal(out.length, 1, 'the session predates the score');
});

test('interleaving is measured as distinct subjects touched today', () => {
  const localDay = d => d.toISOString().slice(0, 10);
  const today = localDay(new Date(NOW));
  const n = pb.spreadToday({
    sessions: [{ subjectId: 'a', ts: new Date(NOW).toISOString() },
               { subjectId: 'b', ts: new Date(NOW).toISOString() },
               { subjectId: 'a', ts: new Date(NOW).toISOString() }],
    today, localDay,
  });
  assert.equal(n, 2);
});

test('the rationale names the phase and the governing principle', () => {
  assert.match(pb.rationale('dp1', 'coursework'), /DP1/);
  assert.match(pb.rationale('finals', 'retrieval'), /exams close/i);
  assert.match(pb.rationale('dp2', 'weakest'), /weakest/i);
});
