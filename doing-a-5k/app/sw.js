const CACHE = "doing-a-5k-v17-attorney-s14";
const ASSETS = [
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/plan.js",
  "./js/halfPlan.js",
  "./js/coachStrength.js",
  "./data/half-marathon-plan.json",
  "./js/storage.js",
  "./js/timer.js",
  "./js/strength.js",
  "./js/strength-timer.js",
  "./manifest.webmanifest",
  "./css/ladder.css",
  "./js/ladder/ui.js",
  "./js/ladder/engine.js",
  "./js/ladder/scheduler.js",
  "./js/ladder/checkout.js",
  "./js/ladder/dates.js",
  "./js/ladder/gifts.js",
  "./js/ladder/config.js",
  "./js/ladder/copy.js",
  "./js/ladder/server.js",
  "./data/ladder/index.json",
  "./data/ladder/walk-to-5k-2x.json",
  "./data/ladder/walk-to-5k-3x.json",
  "./data/ladder/walk-to-5k-4x.json",
  "./data/ladder/walk-to-5k-5x.json",
  "./data/ladder/5k-faster-2x.json",
  "./data/ladder/5k-faster-3x.json",
  "./data/ladder/5k-faster-4x.json",
  "./data/ladder/5k-faster-5x.json",
  "./data/ladder/10k-2x.json",
  "./data/ladder/10k-3x.json",
  "./data/ladder/10k-4x.json",
  "./data/ladder/10k-5x.json",
  "/styles.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/doing-a-5k/app/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      });
    })
  );
});
