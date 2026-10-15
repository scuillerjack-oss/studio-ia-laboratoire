/*
 * Service worker de CIBLE.
 *
 * Mise à jour automatique : __VERSION__ est remplacé au déploiement par
 * "version+commit". Chaque déploiement produit donc un sw.js différent :
 * le navigateur l'installe, il prend la main tout de suite (skipWaiting +
 * clients.claim) et sw-register.js recharge la page une fois. Jack n'a
 * rien à faire : la bêta installée sur le téléphone se met à jour seule.
 *
 * Stratégie : la page (navigation) est servie réseau d'abord, cache en
 * secours (hors ligne). Les fichiers statiques sont servis depuis le cache
 * de la version en cours.
 */
const VERSION = '__VERSION__';
const CACHE = `cible-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './logic.js',
  './sw-register.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' contourne le cache HTTP (GitHub Pages : 10 min),
      // sinon une nouvelle version pourrait embarquer l'ancien code.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('cible-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const scope = new URL(self.registration.scope);
    const isStartPage = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Seule une vraie page d'accueil remplace la copie hors ligne
          // (jamais une page 404 ouverte par erreur).
          if (response.ok && isStartPage) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put('./index.html', copy)));
          }
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
