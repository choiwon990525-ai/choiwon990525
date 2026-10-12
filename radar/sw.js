// WON 레이더 서비스 워커: 화면은 캐시 우선, 데이터(data.json·references.json)는 네트워크 우선.
const SHELL = "radar-shell-v2";
const DATA = "radar-data-v1";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const isData = /\/(data|references|refcheck)\.json$/.test(url.pathname);
  if (isData) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname, { cacheName: DATA }))
    );
    return;
  }
  // 화면 파일: 네트워크가 되면 새 버전으로 갈아끼우고, 안 되면 캐시
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html")))
  );
});
