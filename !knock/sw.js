// screennote — Service Worker
// زوّد رقم VERSION مع كل تعديل عشان الموبايل ينزّل النسخة الجديدة
const VERSION = 'screennote-v63';
const SHELL = ['./', './index.html', './manifest.json', './firebase-config.js', './icon/icon-192.png', './icon/icon-512.png', './icon/apple-touch-icon.png'];
const RUNTIME = VERSION + '-rt';
const MAX_RUNTIME = 400;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_RUNTIME) await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ملفات التطبيق: الشبكة الأول، والكاش لو أوفلاين
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // صور TMDB والخطوط: الكاش الأول
  if (url.hostname === 'image.tmdb.org' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      caches.open(RUNTIME).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trim(c); }
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // بيانات TMDB: الشبكة الأول، وآخر نسخة اتشافت لو أوفلاين
  if (url.hostname === 'api.themoviedb.org' || url.hostname === 'api.tmdb.org') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) caches.open(RUNTIME).then(c => { c.put(req, res.clone()); trim(c); });
          return res;
        })
        .catch(() => caches.match(req).then(r => r || Response.error()))
    );
  }
});
