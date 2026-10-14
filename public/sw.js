/* Nepthic service worker: offline fallback, cached static assets, and pages people
   need without signal (e-tickets, account) kept for offline use. */
const VERSION = "nepthic-events-v1";
const PRIVATE = "nepthic-events-private-v1";
const OFFLINE = "/offline";
const KEEP = /^\/(tickets|account)(\/|$)/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== PRIVATE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("message", (e) => {
  if (e.data === "clear-private") caches.delete(PRIVATE);
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: network first; fall back to a saved copy, then the offline page.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && KEEP.test(url.pathname)) {
            const copy = res.clone();
            caches.open(PRIVATE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE))),
    );
    return;
  }

  // Hashed build assets and icons never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});
