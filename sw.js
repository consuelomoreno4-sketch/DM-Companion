// Service worker: guarda la app en el dispositivo para que funcione sin internet.
// IMPORTANTE: cada vez que publiques cambios, sube el número de VERSION
// para que las tablets descarguen la versión nueva.

const VERSION = '3.5.1';
const CACHE = `dm-companion-${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/conditions.js',
  './js/combat-state.js',
  './js/combat.js',
  './js/i18n.js',
  './js/i18n/en.js',
  './js/i18n/es.js',
  './js/i18n/de.js',
  './js/monsters.js',
  './js/markdown.js',
  './js/compendium-data.js',
  './js/compendium.js',
  './js/campaign-data.js',
  './js/campaign-ui.js',
  './js/campaign-sessions.js',
  './js/campaign-codex.js',
  './js/campaign-stories.js',
  './js/campaign-map.js',
  './js/campaign-import.js',
  './js/campaign-detect.js',
  './js/campaign-time.js',
  './js/clock.js',
  './js/clock-ui.js',
  './js/maps.js',
  './data/packs/icespire.json',
  './js/campaign.js',
  './data/monsters.json',
  './data/monsters-full.json',
  './data/spells.json',
  './data/rules.json',
  './fonts/inter.woff2',
  './fonts/cinzel.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('dm-companion-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Primero la copia guardada; si no está, se pide a internet.
// Las peticiones a otros sitios (por ejemplo, la API de Anthropic en la fase 4) no se tocan.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
