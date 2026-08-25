// sw.js — amig0 | OCTech Services
// Service worker for Guide PWA — cache-first for static assets, network-first for Firestore
//
// ─── DEPLOY PROTOCOL ────────────────────────────────────────────────────────
// Bump CACHE_NAME version on every deploy that changes guide app files:
//   amig0-guide-v1 → amig0-guide-v2 → amig0-guide-v3 …
//
// The activate handler automatically deletes all old cache versions.
// Guides in the field will receive the update on their next app open.
// Current version: v1
// ────────────────────────────────────────────────────────────────────────────

var CACHE_NAME = 'amig0-guide-v1';

var STATIC_ASSETS = [
  './guide.html',
  './css/guide.css',
  './js/guide-auth.js',
  './js/guide-today.js',
  './js/guide-itinerary.js',
  './js/guide-passengers.js',
  './js/guide-briefings.js',
  './js/guide-nav.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Playfair+Display:wght@600;700&display=swap'
];

// ---------------------------------------------------------------------------
// Install — pre-cache static shell
// ---------------------------------------------------------------------------
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ---------------------------------------------------------------------------
// Activate — purge old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key)   { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ---------------------------------------------------------------------------
// Fetch — cache-first for static assets, network-first for everything else
// ---------------------------------------------------------------------------
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // Skip non-GET and Firebase API calls (Firestore, Auth) — always live
  if (event.request.method !== 'GET') return;
  if (url.includes('firestore.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('securetoken.googleapis.com')) return;

  // Cache-first for static assets
  if (STATIC_ASSETS.some(function (a) { return url.includes(a.replace('./', '')); }) ||
      url.includes('fonts.gstatic.com') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('gstatic.com/firebasejs')) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        return cached || fetch(event.request).then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request);
    })
  );
});
