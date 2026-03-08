// ── QuizMe Service Worker ─────────────────────────────────────
const CACHE_VERSION = 'quizme-v5.2';
const BASE          = '/quizme';

const STATIC_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/style.css`,
  `${BASE}/script.js`,
  `${BASE}/manifest.json`,
  `${BASE}/res/favicon.ico`,
  `${BASE}/res/icon-192.png`,
  `${BASE}/res/icon-512.png`,
  `${BASE}/control/manifest.json`,
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap',
];

// ── Install: cache static assets + all subject JSONs ──────────
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      // 1. Cache static shell first
      await cache.addAll(STATIC_ASSETS);

      // 2. Fetch manifest to discover all subject JSON files
      try {
        const manifestRes = await fetch(`${BASE}/control/manifest.json`);
        const manifest    = await manifestRes.json();
        const dataFiles   = (manifest.files || []).map(f => `${BASE}/data/${f}`);

        // Cache each subject JSON — don't let one failure block the whole install
        await Promise.allSettled(
          dataFiles.map(async url => {
            try {
              const res = await fetch(url);
              if (res.ok) await cache.put(url, res);
            } catch(e) {}
          })
        );
      } catch(e) {
        // Manifest fetch failed (offline install) — data files will be
        // cached on first visit as before, no problem
      }

      await self.skipWaiting();
    })()
  );
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for data, cache-first for shell ──────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith(`${BASE}/data/`) ||
      url.pathname.startsWith(`${BASE}/control/`)) {
    // Network-first: always try to get fresh questions,
    // update cache in background, fall back offline
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          }
          return response;
        })
      )
  );
});

// ── Message: force update from app ────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});