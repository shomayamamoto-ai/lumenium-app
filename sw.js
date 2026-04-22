/* AdvoVisions — service worker (network-first HTML, cache-first static) */
const VERSION = "v52";
const CACHE = "advo-" + VERSION;
const STATIC_PRECACHE = [
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  // Activate immediately on install, bypassing the "waiting" state
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  // Delete EVERY old cache so stale HTML from previous SWs can never serve
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Tell all open pages to reload — picks up the new HTML immediately
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url).catch(() => {}));
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  if (isHTML) {
    // Always fresh HTML. Never serve HTML from cache so content updates are visible immediately.
    e.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match(req))
    );
    return;
  }

  // Static assets: cache-first, but fall back to network if missing
  e.respondWith(
    caches.match(req).then(
      (r) =>
        r ||
        fetch(req).then((res) => {
          const url = new URL(req.url);
          if (url.origin === location.origin && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
