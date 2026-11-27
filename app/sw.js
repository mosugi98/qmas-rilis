// Service worker: seluruh aplikasi disimpan di perangkat sehingga jalan tanpa internet setelah pemasangan pertama.
// Naikkan VERSI_CACHE setiap rilis agar berkas baru terambil.
const VERSI_CACHE = 'qmas-3.0.7-8';
const INTI = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/app.js', 'js/util.js', 'js/ledger.js', 'js/codes.js', 'js/code128.js', 'js/db.js', 'js/store.js',
  'js/zip.js', 'js/backup.js', 'js/autosave.js', 'js/license.js', 'js/pin.js', 'js/scanner.js', 'js/platform.js', 'js/native.js', 'js/pdf.js', 'js/escpos.js', 'js/bluetooth.js', 'js/ui/ikon.js',
  'js/ui/dom.js', 'js/ui/layar-utama.js', 'js/ui/layar-stok.js', 'js/ui/layar-data.js',
  'vendor/noble-ed25519.js', 'vendor/zxing.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI_CACHE).then((c) => c.addAll(INTI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSI_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && new URL(e.request.url).origin === location.origin) {
      const salin = r.clone();
      caches.open(VERSI_CACHE).then((c) => c.put(e.request, salin));
    }
    return r;
  }).catch(() => caches.match('index.html'))));
});
