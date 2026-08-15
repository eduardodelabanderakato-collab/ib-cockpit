import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { score, buildEntries, search } from '../js/ui/palette.js';
import { buildIndex } from '../js/syllabus.js';

function load() {
  const reg = JSON.parse(readFileSync('data/subjects.json', 'utf8'));
  const ids = [...reg.subjects.map(s => s.id), 'core'];
  return buildIndex(reg, ids.map(i =>
    JSON.parse(readFileSync(`data/syllabus/${i}.json`, 'utf8'))));
}
const index = load();
const entries = buildEntries({ index });
const titles = q => search(entries, q).map(e => e.title);

test('an exact name wins outright', () => {
  assert.equal(score('today', 'Today'), 1000);
  assert.ok(score('tod', 'Today') > score('tod', 'Notebook'));
});

test('typing plain words finds the control', () => {
  assert.match(titles('notebook')[0], /Notebook/);
  assert.match(titles('windshield')[0], /Windshield/);
  assert.match(titles('backup')[0], /Backup/);
});

test('a subsequence finds it without typing it out', () => {
  assert.ok(score('gradav', 'Grade average') > 0, 'gradav should reach Grade average');
  assert.equal(score('zzz', 'Grade average'), -1, 'nonsense must not match');
});

test('every syllabus topic is reachable by name', () => {
  const hit = titles('kinematics');
  assert.ok(hit.some(t => /Kinematics/i.test(t)));
});

test('a topic is findable by its code', () => {
  assert.ok(search(entries, 'A.1').some(e => /Kinematics/i.test(e.title)));
  assert.ok(search(entries, '1.1').length > 0);
});

test('controls outrank topics on an equal match', () => {
  const out = search(entries, 'log');
  assert.equal(out[0].kind, 'control');
});

test('an empty query offers the things you reach for most', () => {
  const out = search(entries, '');
  assert.ok(out.length > 0);
  assert.ok(out.every(e => e.kind === 'control'), 'no topics in the resting list');
  assert.ok(out.some(e => e.id === 'log'), 'data entry should lead');
});

test('notes are searchable by title and by body', () => {
  const withNotes = buildEntries({
    index,
    notes: { 'physics-hl:A.1': { md: 'remember the sign convention' } },
    notebook: [{ id: 'n1', title: 'IA ideas', md: 'pendulum damping' }],
  });
  assert.ok(search(withNotes, 'IA ideas').some(e => e.kind === 'note'));
  assert.ok(withNotes.some(e => e.hint.includes('sign convention')));
});

test('an empty note is not offered', () => {
  const out = buildEntries({ index, notes: { 'x:1': { md: '   ' } } });
  assert.ok(!out.some(e => e.kind === 'note'));
});

test('every result can actually be opened', () => {
  for (const q of ['log', 'kinematics', 'grade', 'crew', 'terms']) {
    for (const e of search(entries, q)) {
      assert.match(e.href, /^#\//, `${e.title} has no destination`);
      assert.ok(e.title && e.code);
    }
  }
});

test('results are capped so the list stays readable', () => {
  assert.ok(search(entries, 'a').length <= 9);
});

test('controls carry their keyboard shortcut for teaching it', () => {
  const log = entries.find(e => e.id === 'log');
  assert.equal(log.key, 'l');
});

test('junk subsequence matches are cut, not padded into the list', () => {
  const entries = [
    { kind: 'topic', title: 'A.1 Kinematics', code: 'Physics', rank: 1, href: '#/a' },
    { kind: 'topic', title: 'TOK.6 Optional theme: knowledge and indigenous societies',
      code: 'Core', rank: 1, href: '#/b' },
    { kind: 'topic', title: 'TOK.3 Optional theme: knowledge and language',
      code: 'Core', rank: 1, href: '#/c' },
  ];
  const hits = search(entries, 'kinem');
  assert.equal(hits[0].title, 'A.1 Kinematics');
  assert.equal(hits.length, 1, 'the loose TOK matches should not survive');
});

test('a genuine subsequence match across code and title survives', () => {
  const entries = [
    { kind: 'topic', title: 'A.1 Kinematics', code: 'Physics', rank: 1, href: '#/a' },
    { kind: 'topic', title: 'B.2 Greenhouse effect', code: 'Physics', rank: 1, href: '#/b' },
  ];
  const hits = search(entries, 'phya1');
  assert.equal(hits[0].title, 'A.1 Kinematics');
});

test('a query matching nothing returns nothing', () => {
  const entries = [{ kind: 'topic', title: 'A.1 Kinematics', code: 'Physics', rank: 1, href: '#/a' }];
  assert.deepEqual(search(entries, 'zzzzqqq'), []);
});
