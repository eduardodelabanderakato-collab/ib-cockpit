import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ann from '../js/models/annunciators.js';
import { DAY } from './helpers.mjs';

const NOW = Date.parse('2027-03-01T12:00:00Z');
const ago = d => new Date(NOW - d * DAY).toISOString();
const ahead = d => new Date(NOW + d * DAY).toISOString();

const SUBJECTS = [
  { id: 'physics-hl', short: 'Physics', name: 'Physics' },
  { id: 'math-aa-hl', short: 'Math AA', name: 'Mathematics AA' },
];
const NODES = {
  'physics-hl': [{ id: 'physics-hl:A.1' }, { id: 'physics-hl:A.2' }],
  'math-aa-hl': [{ id: 'math-aa-hl:1.1' }],
};

/** Everything touched today, on pace, no deadlines — the quiet baseline. */
function quiet(overrides = {}) {
  return ann.build({
    subjects: SUBJECTS,
    nodesBySubject: NODES,
    records: {
      'physics-hl:A.1': { level: 2, lastTouched: ago(0), touches: 1 },
      'math-aa-hl:1.1': { level: 2, lastTouched: ago(0), touches: 1 },
    },
    sessions: [{ subjectId: 'physics-hl', ts: ago(0), minutes: 30 }],
    paceRatio: 1,
    streak: { current: 3 },
    now: NOW,
    ...overrides,
  });
}

test('a quiet cockpit reports a single nominal caption', () => {
  const list = quiet();
  assert.equal(list.length, 1);
  assert.equal(list[0].level, 'nominal');
  assert.equal(list[0].code, 'ALL SYSTEMS NOMINAL');
  assert.equal(ann.masterCaution(list), false);
});

test('a neglected subject raises a COLD caution naming it', () => {
  const list = quiet({
    records: {
      'physics-hl:A.1': { level: 2, lastTouched: ago(30), touches: 1 },
      'math-aa-hl:1.1': { level: 2, lastTouched: ago(0), touches: 1 },
    },
    sessions: [],
  });
  const cold = list.find(a => a.code === 'PHYSICS COLD');
  assert.ok(cold);
  assert.equal(cold.level, 'caution');
  assert.match(cold.detail, /30 days/);
  assert.equal(cold.href, '#/subject/physics-hl');
  assert.equal(ann.masterCaution(list), true);
});

test('a subject never opened says so rather than reporting Infinity days', () => {
  const list = ann.build({
    subjects: SUBJECTS, nodesBySubject: NODES, records: {}, sessions: [],
    paceRatio: 1, streak: { current: 1 }, now: NOW,
  });
  const cold = list.find(a => a.code === 'PHYSICS COLD');
  assert.match(cold.detail, /never been opened/);
  assert.ok(!/Infinity|NaN/.test(cold.detail));
});

test('fading nodes raise a counted caution', () => {
  const list = quiet({
    records: {
      // Solid, half-life 30d. 60 days => f = 0.25 => fading.
      'physics-hl:A.1': { level: 3, lastTouched: ago(60), touches: 1 },
      'math-aa-hl:1.1': { level: 2, lastTouched: ago(0), touches: 1 },
    },
    sessions: [{ subjectId: 'physics-hl', ts: ago(0), minutes: 30 }],
  });
  const f = list.find(a => a.code === '1 FADING');
  assert.ok(f);
  assert.equal(f.level, 'caution');
});

test('a deadline inside three days is a warning, not a caution', () => {
  const list = quiet({ deadlines: [{ title: 'Physics IA draft', due: ahead(2), status: 'open' }] });
  const d = list.find(a => a.level === 'warning');
  assert.ok(d);
  assert.match(d.code, /PHYSICS IA 2D/);
});

test('a deadline between four and fourteen days is a caution', () => {
  const list = quiet({ deadlines: [{ title: 'Physics IA draft', due: ahead(9), status: 'open' }] });
  const d = list.find(a => a.code.startsWith('PHYSICS IA'));
  assert.equal(d.level, 'caution');
});

test('a deadline beyond fourteen days is silent', () => {
  const list = quiet({ deadlines: [{ title: 'Physics IA draft', due: ahead(40), status: 'open' }] });
  assert.ok(!list.some(a => a.code.startsWith('PHYSICS IA')));
});

test('a completed deadline never annunciates', () => {
  const list = quiet({ deadlines: [{ title: 'Physics IA draft', due: ahead(1), status: 'done' }] });
  assert.equal(list[0].level, 'nominal');
});

test('an overdue deadline reports how late it is', () => {
  const list = quiet({ deadlines: [{ title: 'TOK essay', due: ago(5), status: 'open' }] });
  const d = list.find(a => a.code.includes('OVERDUE'));
  assert.equal(d.level, 'warning');
  assert.match(d.detail, /5 day/);
});

test('falling below the pace floor raises BEHIND PACE', () => {
  assert.ok(quiet({ paceRatio: 0.5 }).some(a => a.code === 'BEHIND PACE'));
  assert.ok(!quiet({ paceRatio: 0.9 }).some(a => a.code === 'BEHIND PACE'));
});

test('running ahead is an advisory, never a caution', () => {
  const list = quiet({ paceRatio: 1.4 });
  const a = list.find(x => x.code === 'AHEAD OF PLAN');
  assert.equal(a.level, 'advisory');
  assert.equal(ann.masterCaution(list), false);
});

test('a lost streak is advisory only, and silent for a brand new user', () => {
  assert.ok(quiet({ streak: { current: 0 } }).some(a => a.code === 'STREAK LOST'));
  const fresh = quiet({ streak: { current: 0 }, sessions: [] });
  assert.ok(!fresh.some(a => a.code === 'STREAK LOST'));
});

test('captions are sorted with the most severe first', () => {
  const list = quiet({
    deadlines: [{ title: 'TOK essay', due: ahead(1), status: 'open' }],
    paceRatio: 0.4,
    streak: { current: 0 },
  });
  const levels = list.map(a => ann.LEVELS[a.level]);
  assert.deepEqual(levels, [...levels].sort((a, b) => b - a));
  assert.equal(ann.worst(list).level, 'warning');
});

test('the aircraft never reports a failure state, only cautions', () => {
  const list = quiet({
    records: {}, sessions: [], paceRatio: 0.01, streak: { current: 0 },
    deadlines: [{ title: 'Everything', due: ago(90), status: 'open' }],
  });
  assert.ok(list.length > 0);
  assert.ok(list.every(a => ['warning', 'caution', 'advisory', 'nominal'].includes(a.level)));
  assert.ok(!list.some(a => /crash|fail|stall/i.test(a.code)));
});

test('many cold subjects collapse into one counted caption', () => {
  const list = ann.build({
    subjects: SUBJECTS, nodesBySubject: NODES, records: {}, sessions: [],
    paceRatio: 1, streak: { current: 1 }, now: NOW,
  });
  // Two cold subjects stay individually named.
  assert.ok(list.some(a => a.code === 'PHYSICS COLD'));
  assert.ok(list.some(a => a.code === 'MATH AA COLD'));

  const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, short: `S${i}`, name: `Sub ${i}` }));
  const wide = ann.build({
    subjects: six, nodesBySubject: {}, records: {}, sessions: [],
    paceRatio: 1, streak: { current: 1 }, now: NOW,
  });
  const collapsed = wide.find(a => a.code === '6 SUBJECTS COLD');
  assert.ok(collapsed, 'expected a collapsed caption');
  assert.equal(collapsed.level, 'caution');
  assert.ok(!wide.some(a => a.code === 'S0 COLD'));
  assert.match(collapsed.detail, /S0, S1/);
});

test('the glareshield never shows more captions than it can display', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, short: `S${i}`, name: `Sub ${i}` }));
  const list = ann.build({
    subjects: six, nodesBySubject: {}, records: {}, sessions: [],
    deadlines: [{ title: 'TOK essay', due: ahead(2), status: 'open' }],
    paceRatio: 0.3, streak: { current: 0 }, now: NOW,
  });
  assert.ok(list.length <= 6, `got ${list.length} captions`);
});
