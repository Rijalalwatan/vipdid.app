const CACHE = 'vipdid-shell-v4';
const CORE = ['/', '/index.html', '/manifest-ar.webmanifest', '/manifest-en.webmanifest', '/brand/logo.webp', '/brand/logo-icon-192.webp', '/brand/logo-icon.webp'];

self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('vipdid-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || event.request.headers.has('authorization') || event.request.headers.has('cookie')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => response).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/brand/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/manifest-')) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; })));
  }
});
