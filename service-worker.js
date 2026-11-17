// オフライン起動用。ネット優先（つながれば最新を取ってキャッシュを更新）、つながらなければキャッシュ。
// ファイルを足したら ASSETS に追加し、VERSION を上げる。
const VERSION = 'dopa-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/reset.css',
  './css/style.css',
  './css/game.css',
  './js/app.js',
  './js/config.js',
  './js/settings.js',
  './js/storage.js',
  './js/audio.js',
  './js/vibration.js',
  './js/hud.js',
  './js/game-manager.js',
  './js/games/crash-racer.js',
  './js/games/crash-racer/rules.js',
  './js/games/crash-racer/obstacles.js',
  './js/games/crash-racer/render.js',
  './js/games/crash-racer/events.js',
  './js/utils/random.js',
  './js/utils/particles.js',
  './js/utils/animation.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dopa-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
