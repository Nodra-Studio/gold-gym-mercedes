/* Only a public terminal shell is cached. Private HTML, API and session requests
 * always reach the network and are never put in this cache. */
const CACHE = 'gold-terminal-shell-v1';
const ASSETS = ['/terminal-offline.html', '/terminal-offline.js', '/terminal-offline.css', '/images/logo.webp'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && url.pathname === '/ingreso') {
    event.respondWith(fetch(event.request).catch(async () => {
      const shell = await caches.match('/terminal-offline.html', { cacheName: CACHE });
      return shell || new Response('La terminal no fue preparada para trabajar offline. Continuá el control manual en recepción.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
  } else if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(event.request, { cacheName: CACHE }).then(cached => cached || fetch(event.request)));
  }
});
