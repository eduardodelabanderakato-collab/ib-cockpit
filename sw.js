import { CACHE_VERSION, PRECACHE, strategyFor, stale, cacheable }
  from './js/cache-policy.js';

/**
 * Service worker.
 *
 * Two jobs: make the cockpit open with no network, and never hand you a stale
 * module graph after a deploy. See js/cache-policy.js for the reasoning.
 */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // One failure must not abort the whole install, so each is tried alone.
    await Promise.allSettled(PRECACHE.map(u => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(stale(names, CACHE_VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const strategy = strategyFor(request.url, { origin: self.location.origin });
  if (strategy === 'passthrough') return;

  event.respondWith(
    strategy === 'cache-first' ? cacheFirst(request) : networkFirst(request)
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    // `no-store` on purpose. A plain fetch() here still goes through the HTTP
    // cache, and GitHub Pages serves index.html with max-age=600 — so for ten
    // minutes after a deploy "network-first" would quietly hand back the old
    // shell and, with it, the old module graph. This is the whole point of the
    // strategy, so it has to actually reach the network.
    const fresh = await fetch(request, { cache: 'no-store' });
    if (cacheable(fresh)) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    // Offline and never seen: fall back to the shell so the app still opens.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline and not cached.', {
      status: 503, headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const fresh = await fetch(request);
  if (cacheable(fresh)) cache.put(request, fresh.clone());
  return fresh;
}
