// Network-first service worker: always fresh when online, works offline.
// When adding files, update SHELL and bump CACHE.
const CACHE = 'iron-defense-v7';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'manifest-dev.webmanifest',
  'src/main.js', 'src/world.js', 'src/replay.js', 'src/quick.js', 'src/render.js', 'src/render_voxel.js', 'src/data.js', 'src/audio.js', 'src/save.js', 'src/version.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
