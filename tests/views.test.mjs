import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../js/syllabus.js';
import { coldestSubject } from '../js/views/command.js';
import { heatmap } from '../js/ui/dom.js';
import { DAY } from './helpers.mjs';

function load() {
  const reg = JSON.parse(readFileSync('data/subjects.json', 'utf8'));
  const ids = [...reg.subjects.map(s => s.id), 'core'];
  const trees = ids.map(id => JSON.parse(readFileSync(`data/syllabus/${id}.json`, 'utf8')));
  return buildIndex(reg, trees);
}

const NOW = Date.parse('2027-03-01T12:00:00Z');
const ago = d => new Date(NOW - d * DAY).toISOString();

test('coldestSubject counts a captured node as touching the subject', () => {
  const idx = load();
  const records = { 'math-aa-hl:1.1': { level: 2, lastTouched: ago(1), touches: 1 } };
  const cold = coldestSubject(idx, records, [], NOW);
  assert.notEqual(cold.s.id, 'math-aa-hl');
  assert.equal(cold.days, Infinity);
});

test('coldestSubject counts a logged session as touching the subject', () => {
  const idx = load();
  const sessions = [{ subjectId: 'physics-hl', ts: ago(2), minutes: 30 }];
  const cold = coldestSubject(idx, sessions.length ? {} : {}, sessions, NOW);
  assert.notEqual(cold.s.id, 'physics-hl');
});

test('coldestSubject returns the longest-neglected subject with its age in days', () => {
  const idx = load();
  const sessions = idx.examined.map((s, i) => ({
    subjectId: s.id, ts: ago(i === 2 ? 40 : 1), minutes: 10,
  }));
  const cold = coldestSubject(idx, {}, sessions, NOW);
  assert.equal(cold.s.id, idx.examined[2].id);
  assert.equal(Math.round(cold.days), 40);
});

test('coldestSubject prefers the most recent of a session and a capture', () => {
  const idx = load();
  const sessions = idx.examined.map(s => ({ subjectId: s.id, ts: ago(50), minutes: 10 }));
  const records = { 'math-aa-hl:1.1': { level: 1, lastTouched: ago(1), touches: 1 } };
  const cold = coldestSubject(idx, records, sessions, NOW);
  assert.notEqual(cold.s.id, 'math-aa-hl');
  assert.equal(Math.round(cold.days), 50);
});

test('heatmap renders exactly weeks x 7 cells and never overruns the grid', () => {
  for (const weeks of [4, 26, 45, 105]) {
    const html = heatmap([], weeks);
    assert.equal((html.match(/<i/g) ?? []).length, weeks * 7, `weeks=${weeks}`);
  }
});

test('heatmap shades a day proportionally to minutes studied', () => {
  const html = heatmap([{ ts: new Date().toISOString(), minutes: 180 }], 4);
  assert.match(html, /color-mix\(in srgb, var\(--accent\) 100%/);
});

test('heatmap leaves unstudied days on the track colour', () => {
  assert.match(heatmap([], 4), /background:var\(--track\)/);
});
