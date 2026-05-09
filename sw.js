// Service Worker for Conjugate Method Study Hub
// Bump CACHE_VERSION to force update when you push changes
const CACHE_VERSION = 'v9';
const CACHE_NAME = 'conjugate-study-' + CACHE_VERSION;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://cdn.jsdelivr.net/npm/focus-trap@7.5.4/dist/focus-trap.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js',
  'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css',
  'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js'
];

// Install: cache core assets + CDN libraries
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_TO_CACHE).then(() => {
          // CDN resources: best-effort cache (don't block install if CDN is down)
          return Promise.allSettled(CDN_URLS.map(url =>
            fetch(url).then(resp => { if (resp.ok) return cache.put(url, resp); })
          ));
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches, claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch handler with strategy per resource type
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // HTML pages: network-first so updates propagate fast
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN resources: stale-while-revalidate (serve cache immediately, update in background)
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
