/* Swipecraft service worker.
 *
 * Three rules, in priority order:
 *
 *  1. /api/* is NEVER cached. The MCP inbox and the AI routes must always hit
 *     the network; a cached inbox would show carousels that were already
 *     imported and consumed.
 *  2. /_next/static/* is cache-first. Those filenames contain a content hash,
 *     so a given URL's bytes never change and a stale hit is impossible.
 *  3. Everything else (navigations, fonts, icons) is network-first with a cache
 *     fallback. Online you always get the current deploy; offline you still get
 *     the last shell that loaded.
 *
 * Bump CACHE_VERSION to evict everything on the next activate.
 */

const CACHE_VERSION = "swipecraft-v1";
const PRECACHE = ["/", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individual failures must not abort the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable. POSTs to /api/generate must pass straight through.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only. Leave cross-origin (Google Fonts, OpenRouter) alone.
  if (url.origin !== self.location.origin) return;

  // Rule 1 — never cache the API.
  if (url.pathname.startsWith("/api/")) return;

  // Rule 2 — hashed bundles are immutable, so cache-first is safe and fastest.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Rule 3 — network-first, so a new deploy is picked up immediately.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // An uncached deep link while offline still needs a document back.
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
