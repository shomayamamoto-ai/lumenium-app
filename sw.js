/* AdvoVisions — minimal service worker (offline-ready) */
const VERSION = "v39";
const CACHE = "advo-" + VERSION;
const PRECACHE = [
  "./",
  "./index.html",
  "./members.html",
  "./news.html",
  "./about.html",
  "./audition.html",
  "./privacy.html",
  "./404.html",
  "./assets/css/style.css?v=39",
  "./assets/js/main.js?v=39",
  "./assets/js/members-data.js?v=39",
  "./assets/js/news-data.js?v=39",
  "./assets/img/logo-original.png?v=39",
  "./assets/img/logo-original-white.png?v=39",
  "./assets/img/logo.png?v=39",
  "./assets/img/wordmark-white.png?v=39",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Network-first for HTML, cache-first for everything else
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./404.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (r) =>
        r ||
        fetch(req).then((res) => {
          if (url.origin === location.origin && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
