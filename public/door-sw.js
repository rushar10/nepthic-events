/* Nepthic Door service worker: the scanner page and its assets stay available when a
   venue's signal drops. Check-ins made offline are queued by the page and synced later. */
const VERSION = "nepthic-door-v1";
const PRIVATE = "nepthic-door-private-v1";
const OFFLINE = "/offline";
// Scoped to /door: only the scanner and its assets are handled here.

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
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/door/")) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === "/door") {
            const copy = res.clone();
            caches.open(PRIVATE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/door")) || (await caches.match(OFFLINE))),
    );
    return;
  }

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
