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
