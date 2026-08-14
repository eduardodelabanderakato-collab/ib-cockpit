import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, offsetFor, ease, DEPTHS } from '../js/ui/stage.js';

const RECT = { left: 0, top: 0, width: 1000, height: 500 };

test('the centre of the stage is the neutral view', () => {
  assert.deepEqual(normalise(500, 250, RECT), { x: 0, y: 0 });
});

test('corners map to the extremes of the range', () => {
  assert.deepEqual(normalise(0, 0, RECT), { x: -1, y: -1 });
  assert.deepEqual(normalise(1000, 500, RECT), { x: 1, y: 1 });
});

test('a pointer outside the stage clamps instead of running away', () => {
  const n = normalise(-4000, 9000, RECT);
  assert.equal(n.x, -1);
  assert.equal(n.y, 1);
});

test('the sky travels further than the airframe, which barely moves', () => {
  const n = { x: 1, y: 0 };
  const sky = Math.abs(offsetFor(DEPTHS.sky, n).x);
  const hud = Math.abs(offsetFor(DEPTHS.hud, n).x);
  const shell = Math.abs(offsetFor(DEPTHS.shell, n).x);
  const console_ = Math.abs(offsetFor(DEPTHS.console, n).x);
  assert.ok(sky > hud, 'sky must out-travel the HUD');
  assert.ok(hud > shell, 'HUD must out-travel the airframe');
  assert.ok(shell > console_, 'the airframe must out-travel the side consoles');
});

test('layers move opposite the pointer, the way parallax works', () => {
  assert.ok(offsetFor(DEPTHS.sky, { x: 1, y: 0 }).x < 0);
  assert.ok(offsetFor(DEPTHS.sky, { x: -1, y: 0 }).x > 0);
});

test('vertical travel is damped relative to horizontal', () => {
  const o = offsetFor(DEPTHS.sky, { x: 1, y: 1 });
  assert.ok(Math.abs(o.y) < Math.abs(o.x));
});

test('a centred pointer leaves every layer exactly at rest', () => {
  for (const d of Object.values(DEPTHS)) {
    assert.deepEqual(offsetFor(d, { x: 0, y: 0 }), { x: -0, y: -0 });
  }
});

test('easing converges on the target without overshooting', () => {
  let v = 0;
  for (let i = 0; i < 200; i++) v = ease(v, 10);
  assert.ok(Math.abs(v - 10) < 0.001);
  assert.ok(v <= 10.0001, 'must not overshoot');
});

import { renderHUD, DEFAULT_HUD, HUD_FIELDS, slots, RAILS } from '../js/ui/jet.js';

const HUD = { hoursPerWeek: 7.5, capturedPct: 21, daysToExam: 623, ratio: 0.9,
  level: 5, streak: 9, nodesLeft: 240, totalHours: 41, cautionCount: 2 };

test('the HUD renders only the fields that are switched on', () => {
  const only = renderHUD(HUD, ['airspeed']);
  assert.match(only, /H\/WK/);
  assert.ok(!only.includes('CAPT'), 'altitude was off but rendered');
  assert.ok(!only.includes('ETA'), 'eta was off but rendered');
});

test('every configurable HUD field actually renders something', () => {
  for (const id of Object.keys(HUD_FIELDS)) {
    const svg = renderHUD(HUD, [id]);
    assert.ok(svg.length > 120, `${id} rendered nothing`);
    assert.match(svg, /<svg/);
  }
});

test('an empty HUD selection still produces valid, non-broken SVG', () => {
  const svg = renderHUD(HUD, []);
  assert.match(svg, /^<svg/);
  assert.match(svg, /<\/svg>$/);
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
});

test('the default HUD shows the flight essentials', () => {
  const svg = renderHUD(HUD, DEFAULT_HUD);
  for (const frag of ['H/WK', 'CAPT', 'ETA', 'PACE']) {
    assert.ok(svg.includes(frag), `default HUD missing ${frag}`);
  }
});

test('a bad pace never leaks NaN onto the glass', () => {
  const svg = renderHUD({ ...HUD, ratio: 0, hoursPerWeek: 0, capturedPct: 0 }, DEFAULT_HUD);
  assert.ok(!/NaN|undefined/.test(svg));
  assert.match(svg, /---/);
});

test('there are enough bezel slots for every control, none overlapping', () => {
  const s = slots();
  assert.ok(s.length >= 28, `only ${s.length} slots for 28 controls`);
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const a = s[i], b = s[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x
                   && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.ok(!overlap, `slots ${i} and ${j} overlap`);
    }
  }
});

test('every bezel slot sits inside the frame', () => {
  for (const p of slots()) {
    assert.ok(p.x >= 0 && p.x + p.w <= 100, `x out of frame: ${p.x}`);
    assert.ok(p.y >= 0 && p.y + p.h <= 100, `y out of frame: ${p.y}`);
  }
});
