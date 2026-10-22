const ROOT = self.registration.scope;
const CACHE = `somos-pages-v3-${new URL(ROOT).pathname}`;
const local = path => new URL(path, ROOT).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    const response = await fetch(local('index.html'), { cache: 'reload' });
    if (!response.ok) throw new Error('No se pudo cargar el editor.');
    await cache.put(local('index.html'), response.clone());
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => new URL(match[1], ROOT).href);
    await cache.addAll([local('manifest.webmanifest'), local('icon.svg'), local('somos-animacion-logo.png'), ...assets]);
    await self.skipWaiting();
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('somos-pages-') && key.endsWith(new URL(ROOT).pathname) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(local('index.html'), response.clone());
        return response;
      } catch { return (await cache.match(local('index.html'))) || Response.error(); }
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
