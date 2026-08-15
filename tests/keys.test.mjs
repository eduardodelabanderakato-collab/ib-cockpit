import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, isTyping, engineFor, SHORTCUTS, legend } from '../js/ui/keys.js';

const index = {
  subjects: [
    { id: 'math-aa-hl', short: 'Math AA', callsign: 'AXIS' },
    { id: 'physics-hl', short: 'Physics', callsign: 'THRUST' },
  ],
};
const ev = (key, extra = {}) => ({ key, target: { tagName: 'BODY' }, ...extra });

test('a letter opens its control', () => {
  assert.equal(resolve(ev('l'), index), 'log');
  assert.equal(resolve(ev('t'), index), 'timer');
  assert.equal(resolve(ev('f'), index), 'fade');
});

test('shortcuts are case-insensitive', () => {
  assert.equal(resolve(ev('L'), index), 'log');
});

test('digits open engines in registry order', () => {
  assert.equal(resolve(ev('1'), index), 'subject:math-aa-hl');
  assert.equal(resolve(ev('2'), index), 'subject:physics-hl');
  assert.equal(resolve(ev('9'), index), null, 'no ninth subject');
});

test('Escape closes and ? asks for help', () => {
  assert.equal(resolve(ev('Escape'), index), 'close');
  assert.equal(resolve(ev('?'), index), 'help');
});

test('typing is never hijacked', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(resolve(ev('l', { target: { tagName } }), index), null, tagName);
  }
  assert.equal(
    resolve(ev('l', { target: { tagName: 'DIV', isContentEditable: true } }), index), null);
});

test('browser and OS shortcuts are left alone', () => {
  assert.equal(resolve(ev('l', { metaKey: true }), index), null);
  assert.equal(resolve(ev('l', { ctrlKey: true }), index), null);
  assert.equal(resolve(ev('l', { altKey: true }), index), null);
});

test('an unbound key does nothing', () => {
  assert.equal(resolve(ev('z'), index), null);
});

test('no shortcut is bound twice', () => {
  const ids = Object.values(SHORTCUTS);
  assert.equal(new Set(ids).size, ids.length, 'duplicate control bound');
  const keys = Object.keys(SHORTCUTS);
  assert.equal(new Set(keys).size, keys.length);
});

test('isTyping recognises every editable surface', () => {
  assert.equal(isTyping({ tagName: 'INPUT' }), true);
  assert.equal(isTyping({ tagName: 'DIV' }), false);
  assert.equal(isTyping(null), false);
});

test('engineFor refuses nonsense', () => {
  assert.equal(engineFor(index, '0'), null);
  assert.equal(engineFor(index, 'x'), null);
});

test('the legend covers every binding and names the control', () => {
  const rows = legend(index);
  assert.ok(rows.length >= Object.keys(SHORTCUTS).length);
  assert.ok(rows.every(r => r.key && r.control && r.control.name));
});
