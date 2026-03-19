// sw.js – Service Worker

const CACHE_NAME = "whisper-asr-v1";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/variables.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/themes.css",
  "/js/config.js",
  "/js/dom.js",
  "/js/api.js",
  "/js/retry.js",
  "/js/queue.js",
  "/js/export.js",
  "/js/persistence.js",
  "/js/theme.js",
  "/js/health.js",
  "/js/main.js",
];

// Endpoints that must never be served from cache
const NETWORK_ONLY = ["/proxy.php", "/send-email.php"];

// ── Install: precache static assets ───────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: remove outdated caches ──────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for assets, network-only for API calls ─────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-only for API endpoints
  if (NETWORK_ONLY.some((path) => url.pathname.endsWith(path))) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for everything else (static assets)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache same-origin successful responses
        if (
          response.ok &&
          response.type === "basic" &&
          request.method === "GET"
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
