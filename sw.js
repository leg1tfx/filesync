const CACHE = 'filesync-v2';
const URLS = [
  '.',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/state.js',
  'js/utils.js',
  'js/db.js',
  'js/ui.js',
  'js/peer.js',
  'js/icons.js',
  'icon.svg',
  'manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.startsWith('chrome-extension:') || e.request.url.includes('unpkg.com') || e.request.url.includes('cdnjs.cloudflare.com')) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
