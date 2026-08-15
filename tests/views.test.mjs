import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatmap } from '../js/ui/dom.js';

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

import * as nb from '../js/models/notebook.js';

const NOTES = {
  'physics-hl:A.1': { md: '# SUVAT\nremember the sign convention', goodnotes: 'https://g/1',
                      updatedAt: '2027-03-02T10:00:00Z' },
  'math-aa-hl:1.1': { md: 'sequences', updatedAt: '2027-03-01T10:00:00Z' },
  'math-aa-hl:1.2': { md: '   ', goodnotes: '' },
};
const FREE = [
  { id: 'n1', title: 'IA ideas', md: 'pendulum damping', subjectId: 'physics-hl',
    pinned: true, updatedAt: '2027-01-01T10:00:00Z' },
  { id: 'n2', title: 'Untitled', md: '', subjectId: null, updatedAt: '2027-03-03T10:00:00Z' },
];

test('the notebook collects both stores and drops genuinely empty notes', () => {
  const out = nb.collect({ notes: NOTES, notebook: FREE });
  assert.equal(out.length, 4, 'the blank node note should not appear');
  assert.ok(!out.some(e => e.id === 'math-aa-hl:1.2'));
  assert.equal(out.filter(e => e.kind === 'node').length, 2);
  assert.equal(out.filter(e => e.kind === 'free').length, 2);
});

test('pinned notes come first, then the most recently touched', () => {
  const out = nb.collect({ notes: NOTES, notebook: FREE });
  assert.equal(out[0].id, 'n1', 'the pinned note must lead');
  assert.equal(out[1].id, 'n2', 'then the newest');
});

test('search narrows with every extra term rather than widening', () => {
  const all = nb.collect({ notes: NOTES, notebook: FREE });
  assert.equal(nb.search(all, 'sign').length, 1);
  assert.equal(nb.search(all, 'suvat sign').length, 1);
  assert.equal(nb.search(all, 'suvat pendulum').length, 0);
  assert.equal(nb.search(all, '').length, all.length);
});

test('search is case-insensitive and covers titles as well as bodies', () => {
  const all = nb.collect({ notes: NOTES, notebook: FREE });
  assert.equal(nb.search(all, 'IA IDEAS').length, 1);
  assert.equal(nb.search(all, 'ideas').length, 1);
});

test('filtering by subject keeps only that subject', () => {
  const all = nb.collect({ notes: NOTES, notebook: FREE });
  const phys = nb.bySubject(all, 'physics-hl');
  assert.equal(phys.length, 2);
  assert.ok(phys.every(e => e.subjectId === 'physics-hl'));
  assert.equal(nb.bySubject(all, null).length, all.length);
});

test('the excerpt skips markdown furniture and empty lines', () => {
  assert.equal(nb.excerpt('# SUVAT\nremember the sign convention'), 'SUVAT');
  assert.equal(nb.excerpt('\n\n   \n- first real line'), 'first real line');
  assert.equal(nb.excerpt(''), '');
  assert.equal(nb.excerpt('x'.repeat(300)).length, 110);
});

test('stats count what the library actually holds', () => {
  const s = nb.stats(nb.collect({ notes: NOTES, notebook: FREE }));
  assert.equal(s.total, 4);
  assert.equal(s.pinned, 1);
  assert.equal(s.linked, 1);
  assert.ok(s.words > 0);
});

test('a new note is unique, empty and timestamped', () => {
  const a = nb.newNote({ title: 'x' }, 1);
  const b = nb.newNote({ title: 'x' }, 1);
  assert.notEqual(a.id, b.id);
  assert.equal(a.md, '');
  assert.ok(a.updatedAt);
});
