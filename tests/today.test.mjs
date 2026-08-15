import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brief } from '../js/models/today.js';
import { buildIndex } from '../js/syllabus.js';

const NOW = Date.parse('2027-03-10T09:00:00Z');
const DAY = 86400000;
const ago = d => new Date(NOW - d * DAY).toISOString();
const ahead = d => new Date(NOW + d * DAY).toISOString();

function load() {
  const reg = JSON.parse(readFileSync('data/subjects.json', 'utf8'));
  const ids = [...reg.subjects.map(s => s.id), 'core'];
  const trees = ids.map(id => JSON.parse(readFileSync(`data/syllabus/${id}.json`, 'utf8')));
  return buildIndex(reg, trees);
}
const index = load();
const base = { index, expected: 0.3, now: NOW };

test('a deadline tomorrow outranks everything else', () => {
  const b = brief({
    ...base,
    deadlines: [{ title: 'Physics IA draft', due: ahead(1), status: 'open', subjectId: 'physics-hl' }],
    records: { 'math-aa-hl:1.1': { level: 3, lastTouched: ago(60), touches: 1 } },
  });
  assert.equal(b.items[0].kind, 'deadline');
  assert.match(b.headline, /Physics IA draft/);
  assert.equal(b.items[0].critical, true);
});

test('a deadline beyond a week is not today’s problem', () => {
  const b = brief({
    ...base,
    deadlines: [{ title: 'Mock', due: ahead(30), status: 'open' }],
    records: { 'math-aa-hl:1.1': { level: 3, lastTouched: ago(60), touches: 1 } },
  });
  assert.ok(!b.all.some(i => i.title === 'Mock'));
});

test('retrieval outranks opening new ground once every subject has contact', () => {
  // Every subject touched recently, one topic fading.
  const sessions = index.examined.map(s => ({ subjectId: s.id, ts: ago(1), minutes: 30 }));
  const b = brief({
    ...base, sessions,
    records: { 'math-aa-hl:1.1': { level: 3, lastTouched: ago(60), touches: 1 } },
  });
  const kinds = b.all.map(i => i.kind);
  assert.ok(kinds.indexOf('recall') < kinds.indexOf('study'),
    'testing yourself must beat covering new material');
  assert.ok(!kinds.includes('cold'), 'nothing is cold when every subject was touched yesterday');
});

test('recall names the worst topic and how cold it is', () => {
  const b = brief({
    ...base,
    records: { 'physics-hl:A.1': { level: 3, lastTouched: ago(62), touches: 1 } },
  });
  const r = b.items.find(i => i.kind === 'recall');
  assert.match(r.detail, /A\.1/);
  assert.match(r.detail, /62 days cold/);
});

test('the plan fits the time you actually have', () => {
  const short = brief({ ...base, budget: 30 });
  const long = brief({ ...base, budget: 180 });
  assert.ok(short.minutes <= 30, `got ${short.minutes}`);
  assert.ok(long.minutes >= short.minutes);
});

test('a critical deadline is kept even when it blows the budget', () => {
  const b = brief({
    ...base, budget: 5,
    deadlines: [{ title: 'TOK essay', due: ahead(0), status: 'open' }],
  });
  assert.ok(b.items.some(i => i.critical), 'must never be dropped for time');
});

test('a completed deadline never appears', () => {
  const b = brief({
    ...base,
    deadlines: [{ title: 'Done thing', due: ahead(1), status: 'done' }],
  });
  assert.ok(!b.all.some(i => i.title === 'Done thing'));
});

test('study picks never repeat a subject', () => {
  const b = brief({ ...base, budget: 240 });
  const subs = b.all.filter(i => i.kind === 'study').map(i => i.subject.id);
  assert.equal(new Set(subs).size, subs.length);
});

test('the streak prompt appears only when nothing has been logged', () => {
  const cold = brief({ ...base });
  assert.ok(cold.all.some(i => i.kind === 'streak'));

  const warm = brief({ ...base, sessions: [{ subjectId: 'physics-hl', ts: ago(0), minutes: 40 }] });
  assert.ok(!warm.all.some(i => i.kind === 'streak'));
  assert.equal(warm.loggedToday, 40);
});

test('a quiet day says so instead of inventing work', () => {
  // Everything captured today, nothing due, something already logged.
  const records = {};
  for (const n of index.examined.flatMap(s => index.bySubject.get(s.id).nodes)) {
    records[n.id] = { level: 4, lastTouched: ago(0), touches: 1 };
  }
  const b = brief({
    ...base, records,
    sessions: [{ subjectId: 'physics-hl', ts: ago(0), minutes: 60 }],
    expected: 0.1,
  });
  assert.ok(!b.all.some(i => i.kind === 'recall'));
  assert.ok(!b.all.some(i => i.kind === 'streak'));
});

test('open missions are surfaced with their labels', () => {
  const b = brief({
    ...base,
    questState: { daily: [{ id: 'q1', type: 'study', subjectId: 'physics-hl',
                            target: 45, weekly: false, label: 'Log 45 min in Physics' }] },
  });
  const q = b.all.find(i => i.kind === 'quest');
  assert.match(q.detail, /Log 45 min in Physics/);
  assert.equal(q.minutes, 0, 'missions are completed by doing other things');
});

test('every item can be acted on', () => {
  const b = brief({
    ...base, budget: 240,
    deadlines: [{ title: 'X', due: ahead(2), status: 'open' }],
    records: { 'physics-hl:A.1': { level: 3, lastTouched: ago(60), touches: 1 } },
  });
  assert.ok(b.items.length > 0);
  for (const i of b.items) {
    assert.match(i.href, /^#\//, `${i.kind} has no destination`);
    assert.ok(i.title && i.detail, `${i.kind} is missing text`);
    assert.ok(Number.isFinite(i.minutes));
  }
});

test('the fitted curve changes what today asks for', () => {
  const records = { 'physics-hl:A.1': { level: 3, lastTouched: ago(38), touches: 1 } };
  const shipped = brief({ ...base, records });
  const fast = brief({ ...base, records, halfLives: [0, 2, 5, 8, 20] });
  assert.ok(!shipped.all.some(i => i.kind === 'recall'), 'still fresh on the shipped curve');
  assert.ok(fast.all.some(i => i.kind === 'recall'), 'already fading on a faster curve');
});


test('a subject nobody has opened outranks a single fading topic', () => {
  const b = brief({
    ...base,
    records: { 'math-aa-hl:1.1': { level: 3, lastTouched: ago(60), touches: 1 } },
  });
  assert.equal(b.items[0].kind, 'cold',
    'six subjects all count — the untouched one is the 40-to-45 gap');
});

test('every objective explains the principle behind it', () => {
  const b = brief({
    ...base, budget: 240,
    deadlines: [{ title: 'IA', due: ahead(2), status: 'open' }],
    records: { 'physics-hl:A.1': { level: 3, lastTouched: ago(60), touches: 1 } },
    grades: [{ subjectId: 'physics-hl', ts: ago(20), raw: 40, max: 100, paper: 'Paper 2' }],
  });
  for (const i of b.items) {
    assert.ok(i.principle, `${i.kind} has no principle`);
    assert.ok(i.why && i.why.length > 25, `${i.kind} does not explain itself`);
  }
  assert.ok(b.rationale.length > 30);
});

test('an unfixed low score is surfaced as the cheapest marks available', () => {
  const b = brief({
    ...base, budget: 240,
    grades: [{ subjectId: 'physics-hl', ts: ago(20), raw: 35, max: 100, paper: 'Paper 2' }],
  });
  const fix = b.all.find(i => i.kind === 'errors');
  assert.ok(fix, 'a 3/7 never revisited must appear');
  assert.match(fix.detail, /never revisited/);
});

test('a score already revisited is not nagged about again', () => {
  const b = brief({
    ...base, budget: 240,
    grades: [{ subjectId: 'physics-hl', ts: ago(20), raw: 35, max: 100, paper: 'Paper 2' }],
    sessions: [{ subjectId: 'physics-hl', ts: ago(5), minutes: 40, note: 'fixed paper 2 mistakes' }],
  });
  assert.ok(!b.all.some(i => i.kind === 'errors'));
});

test('past papers appear in DP2 and not in DP1', () => {
  const dp1 = brief({ ...base, budget: 240 });
  assert.equal(dp1.phase, 'dp1');
  assert.ok(!dp1.all.some(i => i.kind === 'papers'), 'timed papers are not a DP1 priority');

  const late = brief({ ...base, budget: 240, now: Date.parse('2028-01-10T09:00:00Z') });
  assert.notEqual(late.phase, 'dp1');
  assert.ok(late.all.some(i => i.kind === 'papers'));
});

test('the plan states its own reasoning', () => {
  const b = brief({ ...base });
  assert.match(b.rationale, /DP1|DP2|exams close/);
});
