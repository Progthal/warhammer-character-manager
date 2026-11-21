const CACHE_PREFIX = 'wcm-shell-';
const CACHE_VERSION = 'v18';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/icons/app-icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './src/app.js',
  './src/components/reference-picker.js',
  './src/components/talent-picker.js',
  './src/router.js',
  './src/models/character.js',
  './src/rules/characteristic-generator.js',
  './src/rules/character-calculations.js',
  './src/rules/progression-costs.js',
  './src/database/migrations.js',
  './src/database/indexeddb.js',
  './src/services/import-export.js',
  './src/services/progression.js',
  './src/services/theme.js',
  './src/services/reference-catalog.js',
  './src/services/talents.js',
  './src/services/creation-wizard.js',
  './src/utils/format.js',
  './src/views/dashboard.js',
  './src/views/reference-manager.js',
  './data/religions.json',
  './data/deities.json',
  './data/careers.json',
  './data/species.json',
  './data/talents.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((path) => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL('./index.html', self.registration.scope), response.clone());
        }
        return response;
      } catch {
        return (await caches.match(new URL('./index.html', self.registration.scope).href)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
