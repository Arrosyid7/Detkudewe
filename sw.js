/**
 * sw.js — Service Worker sederhana untuk Detkudewe.
 *
 * Sekarang frontend di-host statis (GitHub Pages/dll), jadi service worker
 * ini berjalan normal seperti PWA pada umumnya — beda dengan waktu HTML
 * disajikan langsung dari dalam Google Apps Script (yang sandboxed iframe-nya
 * sering bikin registrasi SW tidak aktif penuh).
 */

const CACHE_NAME = 'detkudewe-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS_TO_CACHE).catch(function () {
        // Diamkan error caching individual asset agar install tidak gagal total
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).catch(function () {
        return cached; // offline fallback jika ada
      });
    })
  );
});
