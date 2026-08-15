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

test('at most one reminder a day, and only after the chosen hour', () => {
  const base = { lastRemindedDay: null, today: '2027-03-10', remindAt: 18 };
  assert.equal(N.shouldRemind({ ...base, hour: 17 }), false);
  assert.equal(N.shouldRemind({ ...base, hour: 18 }), true);
  assert.equal(N.shouldRemind({ ...base, hour: 21 }), true);
  assert.equal(N.shouldRemind({ ...base, hour: 21, lastRemindedDay: '2027-03-10' }), false);
});

test('reminders can be switched off entirely', () => {
  assert.equal(N.shouldRemind({ hour: 23, today: 'x', lastRemindedDay: null, enabled: false }), false);
});

test('the message leads with the closest hard deadline', () => {
  const m = N.message({ fading: 9, dueSoon: { title: 'Physics IA', days: 1 } });
  assert.match(m.title, /Physics IA/);
  assert.equal(m.tone, 'warning');
});

test('then decay, then a cold subject, then the streak', () => {
  assert.match(N.message({ fading: 4 }).title, /4 topics are fading/);
  assert.match(N.message({ fading: 0, coldSubject: { short: 'Chem', days: 14 } }).title, /Chem/);
  assert.match(N.message({ streak: 9, loggedToday: false }).title, /9-day streak/);
});

test('nothing is said when there is nothing worth saying', () => {
  assert.equal(N.message({ fading: 0, loggedToday: true, streak: 4 }), null);
});

test('a distant deadline does not outrank active decay', () => {
  const m = N.message({ fading: 5, dueSoon: { title: 'Mock', days: 20 } });
  assert.match(m.title, /fading/);
});
