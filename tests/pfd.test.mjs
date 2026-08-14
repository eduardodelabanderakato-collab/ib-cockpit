import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paceRatio, bankAngle, pitchOffset, courseElapsed } from '../js/ui/pfd.js';

test('paceRatio is 1 when captured matches expected', () => {
  assert.equal(paceRatio(0.5, 0.5), 1);
});

test('paceRatio exceeds 1 when ahead of schedule', () => {
  assert.ok(paceRatio(0.6, 0.5) > 1);
});

test('paceRatio is 0 before any expectation exists', () => {
  assert.equal(paceRatio(0.2, 0), 0);
});

test('bankAngle is level when on pace', () => {
  assert.equal(bankAngle(1), 0);
});

test('bankAngle banks negative when behind and positive when ahead', () => {
  assert.ok(bankAngle(0.5) < 0);
  assert.ok(bankAngle(1.5) > 0);
});

test('bankAngle clamps to +/- 30 degrees', () => {
  assert.equal(bankAngle(0), -30);
  assert.equal(bankAngle(99), 30);
});

test('pitchOffset is neutral at cruise and clamps at the extremes', () => {
  assert.equal(pitchOffset(4), 0);
  assert.ok(pitchOffset(8) > 0);
  assert.ok(pitchOffset(1) < 0);
  assert.equal(pitchOffset(999), 34);
  assert.equal(pitchOffset(-999), -34);
});

test('courseElapsed is 0 at DP start and 1 at the exams', () => {
  assert.equal(courseElapsed('2026-08', '2028-04-28', Date.parse('2026-08-01')), 0);
  assert.equal(courseElapsed('2026-08', '2028-04-28', Date.parse('2028-04-28')), 1);
});

test('courseElapsed clamps outside the course window', () => {
  assert.equal(courseElapsed('2026-08', '2028-04-28', Date.parse('2020-01-01')), 0);
  assert.equal(courseElapsed('2026-08', '2028-04-28', Date.parse('2030-01-01')), 1);
});

test('courseElapsed is roughly half way at the midpoint', () => {
  const mid = (Date.parse('2026-08-01') + Date.parse('2028-04-28')) / 2;
  const e = courseElapsed('2026-08', '2028-04-28', mid);
  assert.ok(e > 0.49 && e < 0.51, `got ${e}`);
});
