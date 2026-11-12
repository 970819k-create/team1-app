// 앱 설치(PWA)용 서비스 워커
// - 화면 파일(HTML·JS·CSS): 인터넷이 되면 항상 새 버전, 안 되면 저장해 둔 것 (업데이트가 바로 반영되게)
// - 이미지·아이콘: 저장해 둔 것을 먼저 (빠르게)
// - /api/*: 저장하지 않음 (AI 결과·키가 섞이지 않게)
const VERSION = 'kkamja-v1';
const SHELL = ['/', '/index.html', '/css/style.css', '/manifest.webmanifest', '/icons/icon-192.png',
  '/js/app.js', '/js/store.js', '/js/ui.js', '/js/speech.js', '/js/bank.js', '/js/view-input.js', '/js/view-analysis.js',
  '/js/view-practice.js', '/js/view-interview.js', '/js/view-review.js', '/js/view-settings.js', '/js/install.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (/^\/(images|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
