// sw.js - Nursing Notes offline support. Bump SW_VERSION on every release.
// Only the app's own files are cached. The app never sends or stores patient details.
const SW_VERSION = 'nn-v1.1.1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './theme-init.js',
    './sw-register.js',
    './js/app.js',
    './js/templates.js',
    './js/note.js',
    './js/scores.js',
    './js/icons.js',
    './fonts/inter-latin-wght-normal.woff2',
    './manifest.webmanifest',
    './privacy.html',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-512.png',
    './icons/apple-touch-icon.png'
];
const LOGO = 'https://raw.githubusercontent.com/shakeymedic/wmem/main/emevidence_logo.png';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SW_VERSION)
            .then((cache) => cache.addAll(STATIC_ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Network first (so updates arrive), falling back to the cache when offline or slow.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && req.url !== LOGO) return;

    event.respondWith((async () => {
        const cache = await caches.open(SW_VERSION);
        try {
            const res = await Promise.race([
                fetch(req),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
            ]);
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
        } catch (e) {
            const cached = await cache.match(req, { ignoreSearch: sameOrigin });
            if (cached) return cached;
            if (req.mode === 'navigate') return cache.match('./index.html');
            throw e;
        }
    })());
});
