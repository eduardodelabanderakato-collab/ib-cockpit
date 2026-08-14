import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, verify } from '../js/gate.js';

test('sha256 produces the standard digest', async () => {
  assert.equal(await sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('the stored value is a hash, never the passcode itself', async () => {
  const h = await sha256('6438');
  assert.equal(h.length, 64);
  assert.ok(!h.includes('6438'));
});

test('verify accepts the right passcode and rejects everything else', async () => {
  const h = await sha256('6438');
  assert.equal(await verify('6438', h), true);
  assert.equal(await verify('6439', h), false);
  assert.equal(await verify('', h), false);
  assert.equal(await verify('64380', h), false);
});

test('verify compares as a string so a numeric input still unlocks', async () => {
  const h = await sha256('6438');
  assert.equal(await verify(6438, h), true);
});

test('no passcode set means the gate never blocks', async () => {
  assert.equal(await verify('anything', null), true);
  assert.equal(await verify('anything', ''), true);
});
