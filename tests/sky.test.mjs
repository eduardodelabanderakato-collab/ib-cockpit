import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sky from '../js/ui/sky.js';

test('mixHex interpolates endpoints and midpoints', () => {
  assert.equal(sky.mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(sky.mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(sky.mixHex('#000000', '#FFFFFF', 0.5), '#808080');
});

test('mixHex clamps outside 0..1 instead of producing invalid colours', () => {
  assert.equal(sky.mixHex('#000000', '#FFFFFF', -5), '#000000');
  assert.equal(sky.mixHex('#000000', '#FFFFFF', 9), '#FFFFFF');
});

test('paletteFor returns every field as a valid hex at any hour', () => {
  for (let h = 0; h < 24; h += 0.25) {
    const p = sky.paletteFor(h);
    for (const f of sky.FIELDS) {
      assert.match(p[f], /^#[0-9A-F]{6}$/, `hour ${h} field ${f} => ${p[f]}`);
    }
  }
});

test('paletteFor wraps cleanly across midnight', () => {
  assert.deepEqual(sky.paletteFor(0), sky.paletteFor(24));
  assert.deepEqual(sky.paletteFor(0), sky.paletteFor(48));
  assert.deepEqual(sky.paletteFor(0), sky.paletteFor(-24));
});

test('paletteFor lands exactly on a keyframe at its own hour', () => {
  const noon = sky.KEYFRAMES.find(k => k.h === 12.5);
  assert.equal(sky.paletteFor(12.5).zenith, noon.zenith);
});

test('the sky changes continuously — no visible jump between adjacent minutes', () => {
  const dist = (a, b) => {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    return Math.abs(((A >> 16) & 255) - ((B >> 16) & 255))
         + Math.abs(((A >> 8) & 255) - ((B >> 8) & 255))
         + Math.abs((A & 255) - (B & 255));
  };
  for (let h = 0; h < 24; h += 1 / 60) {
    const a = sky.paletteFor(h), b = sky.paletteFor(h + 1 / 60);
    for (const f of sky.FIELDS) {
      assert.ok(dist(a[f], b[f]) < 12, `jump at hour ${h.toFixed(2)} in ${f}`);
    }
  }
});

test('sunAltitude peaks near midday and bottoms out at midnight', () => {
  assert.ok(sky.sunAltitude(12) > 0.99);
  assert.ok(sky.sunAltitude(0) < -0.99);
  assert.ok(Math.abs(sky.sunAltitude(6)) < 1e-9);
  assert.ok(Math.abs(sky.sunAltitude(18)) < 1e-9);
});

test('the sun tracks left to right across the day and is hidden at night', () => {
  const morning = sky.sunPosition(8);
  const evening = sky.sunPosition(18);
  assert.ok(morning.x < evening.x);
  assert.ok(sky.sunPosition(12).y < morning.y, 'higher at noon than at 8am');
  assert.equal(sky.sunPosition(2).visible, false);
  assert.equal(sky.sunPosition(12).visible, true);
});

test('sun coordinates always stay on the windshield', () => {
  for (let h = 0; h < 24; h += 0.1) {
    const p = sky.sunPosition(h);
    assert.ok(p.x >= 0 && p.x <= 1, `x ${p.x} at ${h}`);
    assert.ok(p.y >= 0 && p.y <= 1, `y ${p.y} at ${h}`);
  }
});

test('the moon only appears while the sun is down', () => {
  assert.equal(sky.moonPosition(1).visible, true);
  assert.equal(sky.moonPosition(13).visible, false);
});

test('stars and city lights fade in after dark and are gone by day', () => {
  assert.equal(sky.starOpacity(12), 0);
  assert.equal(sky.cityOpacity(12), 0);
  assert.ok(sky.starOpacity(0) > 0.9);
  assert.ok(sky.cityOpacity(0) > 0.9);
  assert.ok(sky.starOpacity(19.5) < sky.starOpacity(21));
});

test('deck exposure is brightest at noon and dimmest at midnight', () => {
  const noon = sky.deckExposure(12), night = sky.deckExposure(0);
  assert.ok(noon.brightness > night.brightness);
  assert.ok(noon.saturate > night.saturate);
  for (let h = 0; h < 24; h += 0.5) {
    const e = sky.deckExposure(h);
    assert.ok(e.brightness > 0 && e.brightness <= 1.15, `brightness ${e.brightness} at ${h}`);
  }
});

test('birds fly by day and never at night', () => {
  assert.equal(sky.birdsActive(10), true);
  assert.equal(sky.birdsActive(17), true);
  assert.equal(sky.birdsActive(1), false);
  assert.equal(sky.birdsActive(23), false);
});

test('generated layers are deterministic, inline, and reference no external host', () => {
  assert.equal(sky.starField(30, 4), sky.starField(30, 4));
  assert.notEqual(sky.starField(30, 4), sky.starField(30, 5));
  for (const uri of [sky.starField(20), sky.cityField(3), sky.cloudBand(1)]) {
    assert.match(uri, /^url\("data:image\/svg\+xml,/);
    assert.ok(!/https?:/.test(uri), 'layers must not fetch anything');
  }
});

test('hoursOf converts a local time to fractional hours', () => {
  const d = new Date(2027, 0, 1, 6, 30, 0);
  assert.equal(sky.hoursOf(d), 6.5);
});
