/* AdvoVisions — emergency cache-clearing SW.
   This SW intentionally does nothing except tear itself down and purge
   every cached response that previous versions left on the device.
   Once it runs, the device is back to normal no-SW behavior. */

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // Delete ALL caches from any prior version
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      // Take control of currently open pages just long enough to reload them
      await self.clients.claim();
      // Unregister this service worker so it never intercepts again
      await self.registration.unregister();
      // Force every open tab to reload — they will now hit the network directly
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => {
        try { c.navigate(c.url); } catch (_) {}
      });
    })()
  );
});

/* Passthrough fetch — don't intercept anything. Browser goes straight to network. */
self.addEventListener("fetch", () => {});
