import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as quests from '../js/models/quests.js';
import * as grades from '../js/models/grades.js';
import * as recommend from '../js/models/recommend.js';
import * as crew from '../js/models/crew.js';
import { DAY } from './helpers.mjs';

const NOW = Date.parse('2027-03-01T12:00:00Z');
const ago = d => new Date(NOW - d * DAY).toISOString();

const SUBJECTS = [
  { id: 'physics-hl', short: 'Physics', name: 'Physics', level: 'HL' },
  { id: 'math-aa-hl', short: 'Math AA', name: 'Mathematics AA', level: 'HL' },
];
const NODES = {
  'physics-hl': [
    { id: 'physics-hl:A.1', code: 'A.1', title: 'Kinematics', phase: 'DP1',
      topicCode: 'A', topicTitle: 'Space, time and motion' },
    { id: 'physics-hl:A.2', code: 'A.2', title: 'Forces', phase: 'DP1',
      topicCode: 'A', topicTitle: 'Space, time and motion' },
  ],
  'math-aa-hl': [
    { id: 'math-aa-hl:1.1', code: '1.1', title: 'Sequences', phase: 'DP1',
      topicCode: '1', topicTitle: 'Number and algebra' },
  ],
};

// ── quests ───────────────────────────────────────────────────
test('quests are deterministic for a given day and differ across days', () => {
  const a = quests.generate({ date: '2027-03-01', subjects: SUBJECTS, nodesBySubject: NODES, now: NOW });
  const b = quests.generate({ date: '2027-03-01', subjects: SUBJECTS, nodesBySubject: NODES, now: NOW });
  const c = quests.generate({ date: '2027-03-02', subjects: SUBJECTS, nodesBySubject: NODES, now: NOW });
  assert.deepEqual(a.daily, b.daily, 'same day must not reroll');
  assert.notEqual(a.seed, c.seed);
});

test('a day always yields three daily quests and two weekly, none priced', () => {
  const q = quests.generate({ date: '2027-03-01', subjects: SUBJECTS, nodesBySubject: NODES, now: NOW });
  assert.equal(q.daily.length, 3);
  assert.equal(q.weekly.length, 2);
  for (const x of [...q.daily, ...q.weekly]) {
    assert.ok(x.target > 0 && x.label.length > 4, JSON.stringify(x));
    assert.equal(x.xp, undefined, 'missions carry no points');
  }
});

test('quests aim at the coldest subject rather than a random one', () => {
  const q = quests.generate({
    date: '2027-03-01', subjects: SUBJECTS, nodesBySubject: NODES,
    sessions: [{ subjectId: 'math-aa-hl', ts: ago(0), minutes: 60 }],
    now: NOW,
  });
  assert.equal(q.daily[0].subjectId, 'physics-hl');
  assert.match(q.daily[0].label, /Physics/);
});

test('a rescue quest only appears when something is actually fading', () => {
  const none = quests.generate({ date: '2027-03-01', subjects: SUBJECTS, nodesBySubject: NODES, now: NOW });
  assert.ok(!none.daily.some(q => q.type === 'rescue'));

  const fading = quests.generate({
    date: '2027-03-01', subjects: SUBJECTS, nodesBySubject: NODES,
    records: { 'physics-hl:A.1': { level: 3, lastTouched: ago(60), touches: 1 } },
    now: NOW,
  });
  assert.ok(fading.daily.some(q => q.type === 'rescue'));
});

test('study progress counts only the right subject and only today', () => {
  const q = { type: 'study', subjectId: 'physics-hl', target: 60, weekly: false };
  const sessions = [
    { subjectId: 'physics-hl', ts: ago(0), minutes: 25 },
    { subjectId: 'physics-hl', ts: ago(0), minutes: 20 },
    { subjectId: 'math-aa-hl', ts: ago(0), minutes: 90 },
    { subjectId: 'physics-hl', ts: ago(3), minutes: 90 },
  ];
  const date = new Date(NOW).getFullYear() + '-' +
    String(new Date(NOW).getMonth() + 1).padStart(2, '0') + '-' +
    String(new Date(NOW).getDate()).padStart(2, '0');
  assert.equal(quests.progressOf(q, { sessions, date, now: NOW }), 45);
  assert.equal(quests.isComplete(q, { sessions, date, now: NOW }), false);
});

test('a weekly quest counts the whole trailing week', () => {
  const q = { type: 'study', subjectId: null, target: 240, weekly: true };
  const sessions = [
    { subjectId: 'physics-hl', ts: ago(1), minutes: 120 },
    { subjectId: 'math-aa-hl', ts: ago(5), minutes: 130 },
    { subjectId: 'math-aa-hl', ts: ago(20), minutes: 300 },
  ];
  assert.equal(quests.progressOf(q, { sessions, now: NOW }), 250);
  assert.equal(quests.isComplete(q, { sessions, now: NOW }), true);
});

test('refresh keeps today untouched but regenerates on a new day', () => {
  const args = { subjects: SUBJECTS, nodesBySubject: NODES, now: NOW };
  const day1 = quests.refresh(null, { ...args, date: '2027-03-01' });
  const same = quests.refresh(day1, { ...args, date: '2027-03-01' });
  assert.equal(same, day1, 'must return the identical object, not a regenerated one');
  const day2 = quests.refresh(day1, { ...args, date: '2027-03-02' });
  assert.notEqual(day2.seed, day1.seed);
});

test('weekly quests survive the daily roll inside the same week', () => {
  const args = { subjects: SUBJECTS, nodesBySubject: NODES, now: NOW };
  const mon = quests.refresh(null, { ...args, date: '2027-03-01' }); // a Monday
  const tue = quests.refresh(mon, { ...args, date: '2027-03-02' });
  assert.deepEqual(tue.weekly, mon.weekly);
  const nextWeek = quests.refresh(tue, { ...args, date: '2027-03-09' });
  assert.notDeepEqual(nextWeek.weekly, mon.weekly);
});

// ── grades ───────────────────────────────────────────────────
test('gradeFor maps percentages onto 1-7 and never leaves the range', () => {
  assert.equal(grades.gradeFor(0), 1);
  assert.equal(grades.gradeFor(11), 1);
  assert.equal(grades.gradeFor(12), 2);
  assert.equal(grades.gradeFor(82), 7);
  assert.equal(grades.gradeFor(100), 7);
  assert.equal(grades.gradeFor(-40), 1);
  assert.equal(grades.gradeFor(1000), 7);
});

test('prediction weights recent assessments far above old ones', () => {
  const rising = grades.predict([
    { ts: '2027-01-01', raw: 40, max: 100 },
    { ts: '2027-02-01', raw: 60, max: 100 },
    { ts: '2027-03-01', raw: 90, max: 100 },
  ]);
  assert.ok(rising.pct > 65, `expected the recent 90 to dominate, got ${rising.pct}`);
  assert.ok(rising.trend > 0);
  assert.equal(rising.count, 3);
});

test('prediction is order-independent of how entries are supplied', () => {
  const entries = [
    { ts: '2027-03-01', raw: 90, max: 100 },
    { ts: '2027-01-01', raw: 40, max: 100 },
    { ts: '2027-02-01', raw: 60, max: 100 },
  ];
  assert.equal(grades.predict(entries).pct, 71.6);
});

test('no assessments means no prediction, not a fabricated zero', () => {
  assert.equal(grades.predict([]), null);
});

test('weakestPaper finds the lowest-scoring component', () => {
  const w = grades.weakestPaper([
    { ts: '2027-01-01', raw: 80, max: 100, paper: 'Paper 1' },
    { ts: '2027-01-02', raw: 40, max: 100, paper: 'Paper 2' },
    { ts: '2027-02-02', raw: 50, max: 100, paper: 'Paper 2' },
  ]);
  assert.equal(w.paper, 'Paper 2');
  assert.equal(w.pct, 45);
});

test('the TOK/EE matrix matches the published grid, including the failing condition', () => {
  assert.equal(grades.coreBonus('A', 'A').points, 3);
  assert.equal(grades.coreBonus('A', 'C').points, 2);
  assert.equal(grades.coreBonus('C', 'C').points, 1);
  assert.equal(grades.coreBonus('D', 'D').points, 0);
  assert.equal(grades.coreBonus('E', 'A').fail, true);
  assert.equal(grades.coreBonus('A', 'E').fail, true);
  assert.equal(grades.coreBonus(null, 'A').known, false);
});

test('projection totals only what is known and reports what is not', () => {
  const p = grades.project({
    subjects: SUBJECTS,
    grades: [{ subjectId: 'physics-hl', ts: '2027-01-01', raw: 85, max: 100, paper: 'Paper 1' }],
    tok: 'A', ee: 'B', target: 42,
  });
  assert.equal(p.knownCount, 1);
  assert.equal(p.unknownCount, 1);
  assert.equal(p.bonus.points, 3);
  assert.equal(p.total, 7 + 3);
  assert.equal(p.gap, 10 - 42);
  assert.equal(p.weakest.subject.id, 'physics-hl');
});

test('the projection ceiling assumes sevens for unlogged subjects', () => {
  const p = grades.project({ subjects: SUBJECTS, grades: [], target: 45 });
  assert.equal(p.total, 0);
  assert.equal(p.ceiling, 2 * 7 + 3);
});

// ── recommender ──────────────────────────────────────────────
test('a fading node outranks an untouched one and says why', () => {
  const out = recommend.rank({
    subjects: SUBJECTS, nodesBySubject: NODES,
    records: { 'physics-hl:A.1': { level: 3, lastTouched: ago(70), touches: 2 } },
    expected: 0.3, now: NOW, limit: 5,
  });
  assert.equal(out[0].node.id, 'physics-hl:A.1');
  assert.equal(out[0].reason, 'fading fastest');
});

test('something studied in the last day is pushed down the list', () => {
  const fresh = recommend.rank({
    subjects: SUBJECTS, nodesBySubject: NODES,
    records: { 'physics-hl:A.1': { level: 2, lastTouched: ago(0), touches: 1 } },
    expected: 0.3, now: NOW, limit: 5,
  });
  assert.notEqual(fresh[0].node.id, 'physics-hl:A.1');
});

test('an approaching deadline lifts that subject and names the reason', () => {
  const out = recommend.rank({
    subjects: SUBJECTS, nodesBySubject: NODES, records: {},
    deadlines: [{ subjectId: 'math-aa-hl', due: new Date(NOW + 3 * DAY).toISOString(), status: 'open' }],
    expected: 0.1, now: NOW, limit: 5,
  });
  assert.equal(out[0].subject.id, 'math-aa-hl');
  assert.equal(out[0].reason, 'assessment approaching');
});

test('the recommender respects a DP phase filter', () => {
  const nodes = {
    'physics-hl': [{ ...NODES['physics-hl'][0], phase: 'DP2' }],
    'math-aa-hl': NODES['math-aa-hl'],
  };
  const out = recommend.rank({
    subjects: SUBJECTS, nodesBySubject: nodes, records: {},
    expected: 0.3, phase: 'DP1', now: NOW, limit: 10,
  });
  assert.ok(out.every(r => r.node.phase === 'DP1'));
});

test('a session plan spreads across subjects and allocates time', () => {
  const plan = recommend.sessionPlan({
    subjects: SUBJECTS, nodesBySubject: NODES, records: {}, expected: 0.3, now: NOW,
  }, 60);
  assert.ok(plan.length >= 1 && plan.length <= 3);
  assert.equal(new Set(plan.map(p => p.subject.id)).size, plan.length, 'no repeated subjects');
  assert.ok(plan.every(p => p.minutes >= 10));
});

// ── crew ─────────────────────────────────────────────────────
test('every examined subject and the core have an agent with a real prompt', () => {
  for (const id of ['math-aa-hl', 'physics-hl', 'economics-hl', 'chemistry-sl',
                    'portugues-lal-sl', 'english-lal-sl', 'core', 'ee']) {
    const a = crew.agentFor(id);
    assert.ok(a, `missing agent for ${id}`);
    assert.ok(a.callsign && a.expertise.length >= 3);
    assert.ok(a.prompt.length > 300, `${id} prompt is too thin`);
  }
});

test('the science prompts pin the current guide and reject the retired one', () => {
  assert.match(crew.agentFor('physics-hl').prompt, /2023 guide/);
  assert.match(crew.agentFor('physics-hl').prompt, /never\s+the\s+retired\s+Topics\s+1–12/);
  assert.match(crew.agentFor('chemistry-sl').prompt, /Structure\s+1–3\s+and\s+Reactivity\s+1–3/);
  assert.match(crew.agentFor('chemistry-sl').prompt, /never\s+the\s+retired\s+Topics\s+1–11/);
});

test('the Portuguese agent briefs in Portuguese', () => {
  assert.match(crew.agentFor('portugues-lal-sl').prompt, /Responda sempre em português/);
});

test('a brief carries mastery, fading topics, recent sessions and scores', () => {
  const b = crew.buildBrief({
    subject: SUBJECTS[0],
    node: NODES['physics-hl'][0],
    nodes: NODES['physics-hl'],
    records: {
      'physics-hl:A.1': { level: 2, lastTouched: ago(4), touches: 3 },
      'physics-hl:A.2': { level: 3, lastTouched: ago(62), touches: 1 },
    },
    sessions: [{ subjectId: 'physics-hl', ts: ago(2), minutes: 45, note: 'SUVAT drills' }],
    grades: [{ subjectId: 'physics-hl', ts: '2027-02-01', raw: 55, max: 100, paper: 'Paper 2' }],
    question: 'Why does my projectile answer disagree with the markscheme?',
    now: NOW,
  });
  assert.match(b, /THRUST/);
  assert.match(b, /A\.1 Kinematics/);
  assert.match(b, /Practiced/);
  assert.match(b, /Currently fading/);
  assert.match(b, /A\.2 Forces/);
  assert.match(b, /SUVAT drills/);
  assert.match(b, /predicted \d\/7/);
  assert.match(b, /Paper 2/);
  assert.match(b, /markscheme\?$/);
});

test('a brief for an untouched topic says so rather than inventing history', () => {
  const b = crew.buildBrief({
    subject: SUBJECTS[0], node: NODES['physics-hl'][0], nodes: NODES['physics-hl'],
    records: {}, sessions: [], grades: [], now: NOW,
  });
  assert.match(b, /never studied/);
  assert.ok(!/NaN|Infinity|undefined/.test(b));
});

// ── IB 1–7 entry ─────────────────────────────────────────────
test('a logged IB grade maps to the midpoint of its band, not its floor', () => {
  for (let g = 1; g <= 7; g++) {
    const pct = grades.pctForGrade(g);
    assert.equal(grades.gradeFor(pct), g, `grade ${g} did not round-trip`);
  }
  assert.ok(grades.pctForGrade(6) > grades.DEFAULT_BOUNDARIES[5],
    'a 6 should sit above the 6 boundary, not on it');
});

test('pctForGrade clamps nonsense input into 1-7', () => {
  assert.equal(grades.pctForGrade(0), grades.pctForGrade(1));
  assert.equal(grades.pctForGrade(99), grades.pctForGrade(7));
  assert.equal(grades.pctForGrade(6.4), grades.pctForGrade(6));
});

test('grades entered as 1-7 and as raw marks predict together', () => {
  const p = grades.predict([
    { ts: '2027-01-01', raw: 30, max: 100 },
    { ts: '2027-02-01', raw: grades.pctForGrade(7), max: 100 },
  ]);
  assert.equal(p.count, 2);
  assert.ok(p.trend > 0);
});

// ── assessment weight ────────────────────────────────────────
test('an unweighted entry behaves exactly as before', () => {
  const e = [
    { ts: '2027-01-01', raw: 40, max: 100 },
    { ts: '2027-02-01', raw: 60, max: 100 },
    { ts: '2027-03-01', raw: 90, max: 100 },
  ];
  assert.equal(grades.predict(e).pct, 71.6);
  assert.equal(grades.predict(e).weighted, false);
});

test('a heavier assessment pulls the prediction toward itself', () => {
  const light = grades.predict([
    { ts: '2027-01-01', raw: 90, max: 100 },
    { ts: '2027-02-01', raw: 40, max: 100 },
  ]);
  const heavy = grades.predict([
    { ts: '2027-01-01', raw: 90, max: 100, weight: 5 },
    { ts: '2027-02-01', raw: 40, max: 100, weight: 1 },
  ]);
  assert.ok(heavy.pct > light.pct, 'the weighted 90 must count for more');
  assert.equal(heavy.weighted, true);
});

test('weight cannot invert recency on its own — both still apply', () => {
  const p = grades.predict([
    { ts: '2027-01-01', raw: 100, max: 100, weight: 1 },
    { ts: '2027-03-01', raw: 50, max: 100, weight: 1 },
  ]);
  assert.ok(p.pct < 75, 'the recent 50 still dominates equal weights');
});

test('a zero-weighted assessment is excluded from the prediction', () => {
  const withZero = grades.predict([
    { ts: '2027-01-01', raw: 90, max: 100, weight: 1 },
    { ts: '2027-02-01', raw: 10, max: 100, weight: 0 },
  ]);
  const without = grades.predict([{ ts: '2027-01-01', raw: 90, max: 100 }]);
  assert.equal(withZero.pct, without.pct);
  assert.equal(withZero.count, 2, 'it is still logged, just not counted');
});

test('everything weighted zero falls back rather than dividing by zero', () => {
  const p = grades.predict([
    { ts: '2027-01-01', raw: 40, max: 100, weight: 0 },
    { ts: '2027-02-01', raw: 80, max: 100, weight: 0 },
  ]);
  assert.ok(Number.isFinite(p.pct));
  assert.ok(!Number.isNaN(p.grade));
});

test('a nonsense weight is ignored, not trusted', () => {
  assert.equal(grades.weightOf({ weight: -3 }), 1);
  assert.equal(grades.weightOf({ weight: 'heavy' }), 1);
  assert.equal(grades.weightOf({}), 1);
  assert.equal(grades.weightOf({ weight: 2.5 }), 2.5);
});

test('weights flow through to the projection out of 45', () => {
  const subjects = [{ id: 'physics-hl', short: 'Phys' }];
  const light = grades.project({ subjects, grades: [
    { subjectId: 'physics-hl', ts: '2027-01-01', raw: 90, max: 100 },
    { subjectId: 'physics-hl', ts: '2027-02-01', raw: 30, max: 100 },
  ]});
  const heavy = grades.project({ subjects, grades: [
    { subjectId: 'physics-hl', ts: '2027-01-01', raw: 90, max: 100, weight: 8 },
    { subjectId: 'physics-hl', ts: '2027-02-01', raw: 30, max: 100, weight: 1 },
  ]});
  assert.ok(heavy.total > light.total);
});
