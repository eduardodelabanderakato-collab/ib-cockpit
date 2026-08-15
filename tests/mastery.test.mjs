import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/models/mastery.js';
import { T0, ago } from './helpers.mjs';

test('freshness is 1 the moment a node is touched', () => {
  assert.equal(m.freshness(2, 0), 1);
});

test('freshness halves after exactly one half-life', () => {
  assert.equal(m.freshness(3, 30), 0.5);   // Solid, half-life 30d
  assert.equal(m.freshness(1, 5), 0.5);    // Seen, half-life 5d
  assert.equal(m.freshness(4, 75), 0.5);   // Mastered, half-life 75d
});

test('an untouched node has zero freshness', () => {
  assert.equal(m.freshness(0, 0), 0);
});

test('stateOf classifies against the spec thresholds', () => {
  assert.equal(m.stateOf(0, 0), 'untouched');
  assert.equal(m.stateOf(3, 0), 'fresh');        // f = 1
  assert.equal(m.stateOf(3, 30), 'dimming');     // f = 0.5
  assert.equal(m.stateOf(3, 60), 'fading');      // f = 0.25
  assert.equal(m.stateOf(3, 120), 'lapsed');     // f = 0.0625
});

test('effectiveMastery is continuous, not a step count', () => {
  assert.equal(m.effectiveMastery(3, 0), 3);     // level 3, fully fresh
  assert.equal(m.effectiveMastery(3, 30), 2.5);  // half faded
  assert.equal(m.effectiveMastery(0, 0), 0);
});

test('capture raises the level and stamps lastTouched', () => {
  const r = m.capture({ level: 1, lastTouched: ago(40), touches: 3 }, T0);
  assert.equal(r.level, 2);
  assert.equal(r.touches, 4);
  assert.equal(Date.parse(r.lastTouched), T0);
});

test('capture caps at Mastered', () => {
  const r = m.capture({ level: 4, lastTouched: ago(1), touches: 9 }, T0);
  assert.equal(r.level, 4);
  assert.equal(r.touches, 10);
});

test('decay demotes a lapsed node exactly one level', () => {
  const r = m.decay({ level: 3, lastTouched: ago(120), touches: 5 }, T0);
  assert.equal(r.level, 2);
});

test('decay does not cascade past one level in a single pass', () => {
  const r = m.decay({ level: 4, lastTouched: ago(3650), touches: 5 }, T0);
  assert.equal(r.level, 3);
});

test('decay leaves a fresh node untouched', () => {
  const rec = { level: 3, lastTouched: ago(2), touches: 5 };
  assert.deepEqual(m.decay(rec, T0), rec);
});

test('decay never demotes below Untouched', () => {
  const r = m.decay({ level: 0, lastTouched: ago(9999), touches: 0 }, T0);
  assert.equal(r.level, 0);
});

test('subjectProgress averages effective mastery over all nodes', () => {
  const records = {
    'a': { level: 4, lastTouched: ago(0), touches: 1 },
    'b': { level: 0, lastTouched: null, touches: 0 },
  };
  assert.equal(m.subjectProgress(['a', 'b'], records, T0), 0.5);
});

test('subjectProgress counts unrecorded nodes as untouched', () => {
  assert.equal(m.subjectProgress(['a', 'b', 'c', 'd'], {}, T0), 0);
});

test('rescueQueue returns fading nodes worst-first', () => {
  const records = {
    'a': { level: 3, lastTouched: ago(60), touches: 1 },   // f = 0.25  fading
    'b': { level: 3, lastTouched: ago(45), touches: 1 },   // f ~ 0.354 fading
    'c': { level: 3, lastTouched: ago(1),  touches: 1 },   // fresh
  };
  assert.deepEqual(m.rescueQueue(['a', 'b', 'c'], records, T0).map(x => x.id), ['a', 'b']);
});

test('the rescue queue includes lapsed nodes, not just fading ones', () => {
  const records = {
    'fading': { level: 3, lastTouched: ago(60), touches: 1 },   // f = 0.25
    'lapsed': { level: 3, lastTouched: ago(150), touches: 1 },  // f = 0.03
    'fresh':  { level: 3, lastTouched: ago(1), touches: 1 },
  };
  const q = m.rescueQueue(['fading', 'lapsed', 'fresh'], records, T0);
  assert.deepEqual(q.map(x => x.id), ['lapsed', 'fading'],
    'the most forgotten thing must lead, not disappear');
  assert.equal(q[0].state, 'lapsed');
  assert.equal(q[1].state, 'fading');
});
