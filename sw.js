const CACHE_NAME = 'dawar-saada-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.tsx',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Dawar Saada', body: 'New update available.' };
  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});