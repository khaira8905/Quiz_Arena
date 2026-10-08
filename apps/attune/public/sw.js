/*
 * Attune service worker: offline support for low-connectivity learners.
 *
 *   App shell + pages ... network first, cached copy when offline
 *   /_next/static/*  .... cache first (content-hashed, immutable)
 *   /api/*  ............. never cached; the app queues events in its outbox instead
 *   /auth/*  ............ never cached (one-time sign-in links)
 *   /media/*  ........... never cached here (video streams with Range requests; the story
 *                         card falls back to its illustration when offline)
 *   Supabase  ........... another origin, never intercepted; sync goes through the outbox
 *
 * The whole activity library ships inside the app bundle, so once the shell is cached the engine
 * runs fully offline: decisions, activities and the learner model all stay on the device.
 */
const VERSION = "attune-v2";
const SHELL = [
  "/",
  "/begin",
  "/session",
  "/twin",
  "/community",
  "/educator",
  "/story",
  "/settings",
  "/login",
  "/signup",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200)
      cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("/session");
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.status === 200) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;
  if (url.pathname.startsWith("/media/")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
