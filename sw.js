// Версию меняйте при изменении списка файлов или структуры проекта
const CACHE = 'lektionen-v9';
const ASSETS = [
  './', './index.html', './trainer.html', './manifest.json',
  './css/trainer.css', './js/trainer.js', './js/levels.js',
  './data/a1.js', './data/a2.js', './data/b1.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Сначала сеть (всегда свежие файлы), если нет интернета — берём из кэша
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
