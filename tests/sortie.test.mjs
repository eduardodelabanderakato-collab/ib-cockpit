import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sortie from '../js/models/sortie.js';
import { localDay } from '../js/models/streak.js';

const DAY = 86400000;
const NOW = Date.parse('2027-03-01T12:00:00Z');

function fakeIndex() {
  const subjects = [
    { id: 'a', short: 'A', callsign: 'AAA' },
    { id: 'b', short: 'B', callsign: 'BBB' },
  ];
  const bySubject = new Map();
  const byId = new Map();
  for (const s of subjects) {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      id: `${s.id}:${i}`, code: `${s.id.toUpperCase()}.${i}`, title: `Node ${i}`,
      subjectId: s.id, topicCode: 'T', topicTitle: 'Topic',
    }));
    bySubject.set(s.id, { nodes });
    for (const n of nodes) byId.set(n.id, n);
  }
  return { subjects, examined: subjects, bySubject, byId };
}

const ago = d => new Date(NOW - d * DAY).toISOString();

/* ── sizing ── */

test('the hand is sized to the time you actually have', () => {
  assert.equal(sortie.sizeFor(25), 10);
  assert.equal(sortie.sizeFor(60), 20);
});

test('the hand never collapses to nothing or runs away', () => {
  assert.equal(sortie.sizeFor(0), sortie.MIN_TARGETS);
  assert.equal(sortie.sizeFor(-5), sortie.MIN_TARGETS);
  assert.equal(sortie.sizeFor(600), sortie.MAX_TARGETS);
  assert.equal(sortie.sizeFor(undefined), sortie.MIN_TARGETS);
});

test('the per-target clock is bounded however odd the budget', () => {
  for (const m of [0, 1, 25, 600, -3, undefined]) {
    const s = sortie.secondsFor(m, sortie.sizeFor(m));
    assert.ok(s >= 30 && s <= 240, `${m} min gave ${s}s`);
  }
});

/* ── dealing ── */

test('lost ground is dealt before fading, and both before new', () => {
  const index = fakeIndex();
  const records = {
    'a:0': { level: 1, lastTouched: ago(40), touches: 1 },  // lapsed
    'a:1': { level: 3, lastTouched: ago(40), touches: 1 },  // fading
  };
  // Both subjects studied today, so untouched nodes deal as `new` rather than
  // `cold` and the full priority ladder is actually exercised.
  const sessions = [{ subjectId: 'a', ts: ago(0) }, { subjectId: 'b', ts: ago(0) }];
  const hand = sortie.deal({ index, records, sessions, minutes: 60, now: NOW });
  assert.equal(hand.targets[0].node.id, 'a:0');
  assert.equal(hand.targets[0].kind, 'lapsed');

  const kinds = hand.targets.map(t => t.kind);
  assert.ok(kinds.includes('new'), `no new ground dealt at all: ${kinds.join(',')}`);
  assert.ok(kinds.indexOf('fading') < kinds.indexOf('new'),
    `fading should precede new: ${kinds.join(',')}`);

  // The ladder must hold globally, not just at the front of the hand.
  const ranks = kinds.map(k => sortie.KINDS[k].rank);
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y),
    `priority inverted somewhere: ${kinds.join(',')}`);
});

test('a hand spreads across subjects instead of emptying one', () => {
  const index = fakeIndex();
  const hand = sortie.deal({ index, records: {}, minutes: 25, now: NOW });
  const ids = new Set(hand.targets.map(t => t.subject.id));
  assert.equal(ids.size, 2, 'both subjects should appear');
  assert.notEqual(hand.targets[0].subject.id, hand.targets[1].subject.id);
});

test('a hand can be restricted to one subject', () => {
  const index = fakeIndex();
  const hand = sortie.deal({ index, records: {}, minutes: 25, now: NOW, subjectId: 'b' });
  assert.ok(hand.targets.length);
  assert.ok(hand.targets.every(t => t.subject.id === 'b'));
});

test('a node is never dealt twice in one hand', () => {
  const index = fakeIndex();
  const records = { 'a:0': { level: 2, lastTouched: ago(60), touches: 3 } };
  const hand = sortie.deal({ index, records, minutes: 60, now: NOW });
  const ids = hand.targets.map(t => t.node.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ground you hold and have not forgotten is left alone', () => {
  const index = fakeIndex();
  const records = {};
  for (const s of ['a', 'b']) {
    for (let i = 0; i < 8; i++) records[`${s}:${i}`] = { level: 4, lastTouched: ago(0), touches: 5 };
  }
  const hand = sortie.deal({ index, records, minutes: 25, now: NOW });
  assert.equal(hand.targets.length, 0, 'nothing fading and nothing unopened');
});

test('an untouched subject deals as cold, not as new', () => {
  const index = fakeIndex();
  const hand = sortie.deal({
    index, records: {}, minutes: 25, now: NOW,
    sessions: [{ subjectId: 'a', ts: ago(0) }],
  });
  const a = hand.targets.find(t => t.subject.id === 'a');
  const b = hand.targets.find(t => t.subject.id === 'b');
  assert.equal(a.kind, 'new', 'studied today');
  assert.equal(b.kind, 'cold', 'never touched');
});

/* ── flying it ── */

test('a run walks the hand and then ends', () => {
  const index = fakeIndex();
  const hand = sortie.deal({ index, minutes: 10, now: NOW });
  let run = sortie.start(hand, NOW);
  assert.equal(sortie.isOver(run), false);
  assert.equal(sortie.current(run, hand), hand.targets[0]);
  for (let i = 0; i < hand.size; i++) run = sortie.answer(run, 'yes', NOW + i * 1000);
  assert.equal(sortie.isOver(run), true);
  assert.equal(sortie.current(run, hand), null);
});

test('an unknown outcome is refused rather than scored as zero', () => {
  const hand = sortie.deal({ index: fakeIndex(), minutes: 10, now: NOW });
  assert.throws(() => sortie.answer(sortie.start(hand, NOW), 'maybe'), /Unknown sortie outcome/);
});

test('answering does not mutate the previous run', () => {
  const hand = sortie.deal({ index: fakeIndex(), minutes: 10, now: NOW });
  const a = sortie.start(hand, NOW);
  const b = sortie.answer(a, 'yes', NOW);
  assert.equal(a.at, 0);
  assert.equal(a.results.length, 0);
  assert.equal(b.at, 1);
});

/* ── scoring ── */

test('a perfect run scores everything and grades Perfect', () => {
  const hand = sortie.deal({ index: fakeIndex(), minutes: 10, now: NOW });
  let run = sortie.start(hand, NOW);
  for (let i = 0; i < hand.size; i++) run = sortie.answer(run, 'yes', NOW + i * 1000);
  const s = sortie.score(run);
  assert.equal(s.ratio, 1);
  assert.equal(s.points, hand.size * 3);
  assert.equal(sortie.gradeOf(s.ratio).name, 'Perfect');
});

test('a run the clock won is not reported as accurate', () => {
  const hand = sortie.deal({ index: fakeIndex(), minutes: 10, now: NOW });
  let run = sortie.start(hand, NOW);
  run = sortie.answer(run, 'yes', NOW);
  for (let i = 1; i < hand.size; i++) run = sortie.answer(run, 'expired', NOW + i * 1000);
  const s = sortie.score(run);
  assert.equal(s.expired, hand.size - 1);
  assert.equal(s.accuracy, 1 / hand.size,
    'an expired target must count in the denominator, not be quietly dropped');

  // The same single hit, with the rest simply not attempted, would read as a
  // flawless run if expiry were ignored.
  let cheat = sortie.start(hand, NOW);
  cheat = sortie.answer(cheat, 'yes', NOW);
  assert.equal(sortie.score(cheat).accuracy, 1);
  assert.ok(s.accuracy < sortie.score(cheat).accuracy);
  assert.equal(sortie.gradeOf(s.ratio).name, 'Aborted');
});

test('a half-remembered run lands between the two', () => {
  const hand = sortie.deal({ index: fakeIndex(), minutes: 10, now: NOW });
  let run = sortie.start(hand, NOW);
  for (let i = 0; i < hand.size; i++) {
    run = sortie.answer(run, i % 2 ? 'yes' : 'partly', NOW + i * 1000);
  }
  const s = sortie.score(run);
  assert.ok(s.ratio > 0.35 && s.ratio < 0.92, s.ratio);
});

test('every grade band is reachable and ordered', () => {
  let prev = -1;
  for (const g of sortie.GRADES) {
    assert.ok(g.at > prev, `${g.name} is out of order`);
    assert.equal(sortie.gradeOf(g.at).name, g.name);
    prev = g.at;
  }
  assert.equal(sortie.gradeOf(1).name, 'Perfect');
  assert.equal(sortie.gradeOf(0).name, 'Aborted');
});

/* ── prompts ── */

const TERMS = [
  { ao: 'AO1', demand: 'Recall.', terms: ['Define', 'State'] },
  { ao: 'AO2', demand: 'Apply.', terms: ['Explain', 'Analyse'] },
  { ao: 'AO3', demand: 'Judge.', terms: ['Evaluate', 'Justify'] },
];

test('a prompt uses a real command term and is stable for the same spin', () => {
  const t = { node: { id: 'a:0' }, level: 1 };
  const p = sortie.promptFor(t, TERMS, 0);
  assert.ok(TERMS.flatMap(x => x.terms).includes(p.term));
  assert.deepEqual(sortie.promptFor(t, TERMS, 0), p, 'same spin must be stable');
});

test('the same node asks something different next time round', () => {
  const t = { node: { id: 'a:0' }, level: 2 };
  const seen = new Set();
  for (let spin = 0; spin < 12; spin++) seen.add(sortie.promptFor(t, TERMS, spin).term);
  assert.ok(seen.size > 1, 'a fixed prompt is a flashcard you have memorised');
});

test('higher mastery is asked a harder objective', () => {
  const low = sortie.promptFor({ node: { id: 'x' }, level: 1 }, TERMS, 0);
  const high = sortie.promptFor({ node: { id: 'x' }, level: 4 }, TERMS, 0);
  assert.equal(low.ao, 'AO1');
  assert.ok(high.ao !== 'AO1', `level 4 should not still be recall, got ${high.ao}`);
});

test('no command terms means no invented prompt', () => {
  assert.equal(sortie.promptFor({ node: { id: 'x' }, level: 1 }, [], 0), null);
  assert.equal(sortie.promptFor({ node: { id: 'x' }, level: 1 }, null, 0), null);
});

/* ── history ── */

const rec = (points, ratio, id = String(points)) => ({ id, points, ratio, ts: '2027-03-01T12:00:00Z' });

test('the run to beat is the highest score', () => {
  assert.equal(sortie.best([rec(10, 0.5), rec(24, 0.8), rec(18, 0.9)]).points, 24);
  assert.equal(sortie.best([]), null);
});

test('a tie on points is broken by how clean the run was', () => {
  assert.equal(sortie.best([rec(24, 0.7, 'x'), rec(24, 0.95, 'y')]).id, 'y');
});

test('a new personal best is recognised, and a worse run is not', () => {
  const history = [rec(10, 0.5, 'old'), rec(24, 0.8, 'new')];
  assert.equal(sortie.isBest(history[1], history), true);
  assert.equal(sortie.isBest(history[0], history), false);
});

test('the very first run is not announced as beating anything', () => {
  const only = rec(12, 0.6, 'first');
  assert.equal(sortie.isBest(only, [only]), false);
});

test('runs are counted per local day', () => {
  const history = [
    { ts: new Date(2027, 2, 1, 9).toISOString() },
    { ts: new Date(2027, 2, 1, 20).toISOString() },
    { ts: new Date(2027, 2, 2, 9).toISOString() },
  ];
  assert.equal(sortie.flownOn(history, '2027-03-01', localDay), 2);
  assert.equal(sortie.flownOn(history, '2027-03-03', localDay), 0);
});

test('a stored run carries what it needs to be compared later', () => {
  const index = fakeIndex();
  const hand = sortie.deal({ index, minutes: 10, now: NOW });
  let run = sortie.start(hand, NOW);
  for (let i = 0; i < hand.size; i++) run = sortie.answer(run, 'yes', NOW + i * 1000);
  const r = sortie.toRecord(run, hand, NOW);
  for (const k of ['id', 'ts', 'size', 'points', 'possible', 'ratio', 'grade', 'subjectIds']) {
    assert.ok(k in r, `missing ${k}`);
  }
  assert.equal(r.grade, 'Perfect');
  assert.ok(r.subjectIds.length);
});

test('a run abandoned early only records what was actually flown', () => {
  const index = fakeIndex();
  const hand = sortie.deal({ index, minutes: 60, now: NOW });
  let run = sortie.start(hand, NOW);
  run = sortie.answer(run, 'yes', NOW);
  run = sortie.answer(run, 'no', NOW + 1000);
  const r = sortie.toRecord(run, hand, NOW);
  assert.equal(r.hits, 1);
  assert.equal(r.misses, 1);
  assert.ok(r.subjectIds.length <= 2);
});

/* ── how hard the clock presses ── */

test('a fixed pace overrides the budget split', () => {
  assert.equal(sortie.secondsFor(60, 4, 'rapid'), 30);
  assert.equal(sortie.secondsFor(60, 4, 'brisk'), 60);
  assert.equal(sortie.secondsFor(60, 4, 'steady'), 90);
});

test('the budget pace still splits the time evenly', () => {
  assert.equal(sortie.secondsFor(10, 4, 'budget'), 150);
  assert.equal(sortie.secondsFor(10, 4), 150, 'budget is the default');
});

test('an unknown pace falls back to the budget rather than to no clock', () => {
  assert.equal(sortie.secondsFor(10, 4, 'nonsense'), 150);
  assert.equal(sortie.paceById('nonsense').id, 'budget');
});

test('every pace is reachable and none of them is untimed', () => {
  for (const p of sortie.PACES) {
    const s = sortie.secondsFor(25, 10, p.id);
    assert.ok(s >= 30 && s <= 240, `${p.id} gave ${s}s`);
  }
});

test('the dealt hand carries the pace it was dealt at', () => {
  const hand = sortie.deal({ index: fakeIndex(), minutes: 60, pace: 'rapid', now: NOW });
  assert.equal(hand.pace, 'rapid');
  assert.equal(hand.seconds, 30);
  assert.equal(sortie.start(hand, NOW).seconds, 30);
});
