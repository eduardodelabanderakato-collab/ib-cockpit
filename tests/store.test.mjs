import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { memoryBackend } from './helpers.mjs';

let backend;
beforeEach(() => { backend = memoryBackend(); store.setBackend(backend); });

test('write then read round-trips a value', () => {
  store.write('xp', { total: 120 });
  assert.deepEqual(store.read('xp', null), { total: 120 });
});

test('read returns the fallback for a missing key', () => {
  assert.deepEqual(store.read('nope', { a: 1 }), { a: 1 });
});

test('corrupt JSON returns the fallback and drops the key', () => {
  backend.setItem('ibc:mastery', '{not json');
  assert.deepEqual(store.read('mastery', {}), {});
  assert.equal(backend.getItem('ibc:mastery'), null);
});

test('keys are namespaced', () => {
  store.write('xp', 1);
  assert.equal(backend.getItem('ibc:xp'), '1');
});

test('exportAll produces JSON that importAll restores', () => {
  store.write('xp', { total: 7 });
  store.write('sessions', [{ id: 'a' }]);
  const dump = store.exportAll();
  store.setBackend(memoryBackend());
  assert.deepEqual(store.read('xp', null), null);
  const res = store.importAll(dump);
  assert.equal(res.ok, true);
  assert.deepEqual(store.read('xp', null), { total: 7 });
  assert.deepEqual(store.read('sessions', null), [{ id: 'a' }]);
});

test('importAll rejects malformed input without clobbering existing data', () => {
  store.write('xp', { total: 9 });
  const res = store.importAll('garbage');
  assert.equal(res.ok, false);
  assert.match(res.error, /parse/i);
  assert.deepEqual(store.read('xp', null), { total: 9 });
});

test('importAll rejects a payload from a newer schema', () => {
  const res = store.importAll(JSON.stringify({ schema: 999, data: {} }));
  assert.equal(res.ok, false);
  assert.match(res.error, /schema/i);
});
