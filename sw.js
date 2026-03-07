// ── QuizMe Service Worker ─────────────────────────────────────
// Caches all app files for offline use.
// Update CACHE_VERSION whenever you deploy new code.

const CACHE_VERSION  = 'quizme-v5.0';
const BASE           = '/quizme';

// Core app shell — always cached on install
const STATIC_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/style.css`,
  `${BASE}/script.js`,
  `${BASE}/manifest.json`,
  `${BASE}/res/favicon.ico`,
  `${BASE}/res/icon-192.png`,
  `${BASE}/res/icon-512.png`,
  // Google Fonts (cached on first load)
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap',
];

// ── Install: cache static assets ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ─────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // For JSON data files — network first, cache as fallback
  // This ensures new questions you add are always fetched fresh
  // but still work offline if network is unavailable
  if (url.pathname.startsWith(`${BASE}/data/`) ||
      url.pathname.startsWith(`${BASE}/control/`)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone and cache the fresh response
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))  // offline fallback
    );
    return;
  }

  // For everything else — cache first, fall back to network
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          // Cache new resources as they're fetched
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
      )
  );
});