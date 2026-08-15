import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { createState } from '../js/state.js';
import { memoryBackend } from './helpers.mjs';

beforeEach(() => store.setBackend(memoryBackend()));

test('state hydrates defaults when storage is empty', () => {
  const s = createState();
  assert.deepEqual(s.get('mastery'), {});
  assert.deepEqual(s.get('sessions'), []);
  assert.deepEqual(s.get('streak'), { current: 0, longest: 0, lastDay: null });
});

test('set persists through the store', () => {
  const s = createState();
  s.set('mastery', { 'a:1': { level: 2, lastTouched: null, touches: 1 } });
  assert.deepEqual(store.read('mastery', null), { 'a:1': { level: 2, lastTouched: null, touches: 1 } });
});

test('update mutates a draft and persists it without an explicit return', () => {
  const s = createState();
  s.update('sessions', list => { list.push({ id: 'x' }); });
  assert.deepEqual(s.get('sessions'), [{ id: 'x' }]);
  assert.deepEqual(store.read('sessions', null), [{ id: 'x' }]);
});

test('update also accepts a returned replacement', () => {
  const s = createState();
  s.update('streak', x => ({ ...x, current: 42 }));
  assert.equal(s.get('streak').current, 42);
});

test('update does not mutate the previous value in place', () => {
  const s = createState();
  const before = s.get('sessions');
  s.update('sessions', list => { list.push({ id: 'x' }); });
  assert.deepEqual(before, []);
});

test('subscribers fire on the key they subscribed to', () => {
  const s = createState();
  let calls = 0;
  s.subscribe('mastery', () => calls++);
  s.set('mastery', {});
  assert.equal(calls, 1);
});

test('subscribers do not fire for unrelated keys', () => {
  const s = createState();
  let calls = 0;
  s.subscribe('mastery', () => calls++);
  s.set('sessions', []);
  assert.equal(calls, 0);
});

test('a wildcard subscriber receives every change with its key', () => {
  const s = createState();
  const seen = [];
  s.subscribe('*', k => seen.push(k));
  s.set('streak', { current: 1 });
  s.set('sessions', []);
  assert.deepEqual(seen, ['streak', 'sessions']);
});

test('unsubscribe stops delivery', () => {
  const s = createState();
  let calls = 0;
  const off = s.subscribe('streak', () => calls++);
  off();
  s.set('streak', { current: 1 });
  assert.equal(calls, 0);
});

test('a fresh state reads back what a previous one persisted', () => {
  createState().set('sessions', [{ id: 'x', minutes: 20 }]);
  assert.deepEqual(createState().get('sessions'), [{ id: 'x', minutes: 20 }]);
});

test('a corrupt stored value falls back to the default instead of throwing', () => {
  const backend = memoryBackend();
  store.setBackend(backend);
  backend.setItem('ibc:mastery', 'not json at all');
  assert.deepEqual(createState().get('mastery'), {});
});

/* ── carrying old saves forward when XP was killed ── */

test('an old xp save gives up its streak instead of losing it', () => {
  const mem = memoryBackend();
  mem.setItem('ibc:xp', JSON.stringify({
    total: 8400, bySubject: { 'physics-hl': 900 },
    streak: { current: 12, longest: 31, lastDay: '2026-08-14' },
  }));
  store.setBackend(mem);
  const s = createState();
  assert.deepEqual(s.get('streak'), { current: 12, longest: 31, lastDay: '2026-08-14' });
  assert.equal(mem.getItem('ibc:xp'), null, 'the old key is dropped, not left to rot');
  assert.equal(JSON.parse(mem.getItem('ibc:streak')).longest, 31, 'and it is persisted');
});

test('migration never overwrites a streak already in the new key', () => {
  const mem = memoryBackend();
  mem.setItem('ibc:streak', JSON.stringify({ current: 5, longest: 5, lastDay: '2026-08-15' }));
  mem.setItem('ibc:xp', JSON.stringify({
    total: 10, streak: { current: 99, longest: 99, lastDay: '2020-01-01' },
  }));
  store.setBackend(mem);
  assert.equal(createState().get('streak').current, 5);
});

test('an xp save with no streak inside it still clears cleanly', () => {
  const mem = memoryBackend();
  mem.setItem('ibc:xp', JSON.stringify({ total: 400, bySubject: {} }));
  store.setBackend(mem);
  const s = createState();
  assert.deepEqual(s.get('streak'), { current: 0, longest: 0, lastDay: null });
  assert.equal(mem.getItem('ibc:xp'), null);
});

test('a corrupt xp value cannot break startup', () => {
  const mem = memoryBackend();
  mem.setItem('ibc:xp', '{not json');
  store.setBackend(mem);
  assert.doesNotThrow(() => createState());
});

test('a fresh install runs the migration as a no-op', () => {
  store.setBackend(memoryBackend());
  assert.deepEqual(createState().get('streak'), { current: 0, longest: 0, lastDay: null });
});
