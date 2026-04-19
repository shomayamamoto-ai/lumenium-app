// Lumenium Service Worker — SELF-DESTRUCT
// Temporarily disabled to debug splash rendering.
// This version unregisters itself and purges all caches on install.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      } catch (e) {}
      try {
        await self.registration.unregister()
      } catch (e) {}
      try {
        const clients = await self.clients.matchAll({ type: 'window' })
        clients.forEach((c) => c.navigate(c.url))
      } catch (e) {}
    })()
  )
})

// Never intercept any fetch — always passthrough
self.addEventListener('fetch', () => {})
