import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strategyFor, stale, cacheable, PRECACHE, CACHE_VERSION }
  from '../js/cache-policy.js';

const O = 'https://user.github.io';

test('code is network-first, so a deploy is never served stale', () => {
  for (const p of ['/js/main.js', '/js/views/deck.js', '/assets/css/jet.css',
                   '/data/syllabus/physics-hl.json', '/index.html']) {
    assert.equal(strategyFor(O + p, { origin: O }), 'network-first', p);
  }
});

test('the navigation root is network-first too', () => {
  assert.equal(strategyFor(O + '/', { origin: O }), 'network-first');
});

test('images and fonts are cache-first — they never change without a new name', () => {
  for (const p of ['/assets/img/cockpit.jpg', '/assets/img/clouddeck.jpg',
                   '/a/b.png', '/f.woff2']) {
    assert.equal(strategyFor(O + p, { origin: O }), 'cache-first', p);
  }
});

test('other origins are never intercepted', () => {
  assert.equal(strategyFor('https://revisionvillage.com/x.js', { origin: O }), 'passthrough');
  assert.equal(strategyFor('https://claude.ai/project/1', { origin: O }), 'passthrough');
});

test('non-http schemes are left alone', () => {
  assert.equal(strategyFor('chrome-extension://abc/x.js', { origin: O }), 'passthrough');
  assert.equal(strategyFor('data:text/plain,hi', { origin: O }), 'passthrough');
  assert.equal(strategyFor('not a url at all', { origin: O }), 'passthrough');
});

test('only this app’s old caches are cleared, and never the current one', () => {
  const names = ['ibc-v1', 'ibc-v0', 'ibc-old', 'someone-else-v9'];
  assert.deepEqual(stale(names, 'ibc-v1').sort(), ['ibc-old', 'ibc-v0']);
  assert.ok(!stale(names, 'ibc-v1').includes('someone-else-v9'));
  assert.ok(!stale(names, 'ibc-v1').includes('ibc-v1'));
});

test('only complete same-origin responses are stored', () => {
  assert.equal(cacheable({ ok: true, status: 200, type: 'basic' }), true);
  assert.equal(cacheable({ ok: false, status: 404, type: 'basic' }), false);
  assert.equal(cacheable({ ok: true, status: 206, type: 'basic' }), false, 'partial');
  assert.equal(cacheable({ ok: true, status: 200, type: 'opaque' }), false);
  assert.equal(cacheable(null), false);
});

test('the precache covers the shell, every stylesheet and the boot data', () => {
  assert.ok(PRECACHE.includes('./index.html'));
  assert.ok(PRECACHE.includes('./data/subjects.json'));
  for (const css of ['tokens', 'base', 'components', 'sky', 'cockpit', 'jet']) {
    assert.ok(PRECACHE.some(p => p.includes(`${css}.css`)), `missing ${css}.css`);
  }
  assert.ok(PRECACHE.every(p => p.startsWith('./')), 'paths must be relative for a subpath deploy');
});

test('the cache version is namespaced so it can be swept safely', () => {
  assert.match(CACHE_VERSION, /^ibc-/);
});

test('every module and data file on disk is precached — offline must boot cold', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const walk = dir => readdirSync(dir).flatMap(f => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

  const onDisk = [...walk('js'), ...walk('data'), ...walk('assets/css')]
    .filter(p => /\.(js|json|css)$/.test(p))
    .filter(p => !p.endsWith('sw.js'));

  const missing = onDisk.filter(p => !PRECACHE.includes('./' + p));
  assert.deepEqual(missing, [], `not precached: ${missing.join(', ')}`);
});

test('the precache has no duplicates and no stale entries', async () => {
  const { existsSync } = await import('node:fs');
  assert.equal(new Set(PRECACHE).size, PRECACHE.length, 'duplicate entries');
  const gone = PRECACHE
    .filter(p => p !== './' && !p.endsWith('/'))
    .map(p => p.replace('./', ''))
    .filter(p => !existsSync(p));
  assert.deepEqual(gone, [], `precached but missing from disk: ${gone.join(', ')}`);
});
