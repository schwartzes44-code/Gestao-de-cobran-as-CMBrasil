const CACHE='gestao-cobrancas-v0-4-1-fix-futuras';
const CORE=['./','./index.html','./styles.css?v=0.4.1','./app.js?v=0.4.1','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first para evitar que uma versão antiga do PWA fique presa no cache.
  event.respondWith(
    fetch(req)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return resp;
      })
      .catch(async () => {
        const cached = await caches.match(req, {ignoreSearch:false});
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
