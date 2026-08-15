import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../js/models/nudge.js';

const NOW = Date.parse('2027-03-10T12:00:00Z');
const ago = d => new Date(NOW - d * 86400000).toISOString();

test('a brand new user is left alone until there is work worth losing', () => {
  assert.equal(N.backupDue({ backupLastAt: null, sessionCount: 0, now: NOW }), false);
  assert.equal(N.backupDue({ backupLastAt: null, sessionCount: 5, now: NOW }), true);
});

test('a backup is offered after a week, not on every load', () => {
  assert.equal(N.backupDue({ backupLastAt: ago(2), now: NOW }), false);
  assert.equal(N.backupDue({ backupLastAt: ago(7), now: NOW }), true);
});

test('a lot of unsaved work triggers it early', () => {
  assert.equal(N.backupDue({ backupLastAt: ago(1), sessionCount: 40, now: NOW }), true);
});

test('backupAge is null when nothing has ever been exported', () => {
  assert.equal(N.backupAge({ backupLastAt: null, now: NOW }), null);
  assert.equal(N.backupAge({ backupLastAt: ago(9), now: NOW }), 9);
});
