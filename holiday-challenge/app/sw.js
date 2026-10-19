const CACHE = "holiday-30-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/config.js",
  "./js/dates.js",
  "./js/rules.js",
  "./js/storage.js",
  "./js/i18n.js",
  "./js/strings.en.js",
  "./js/strings.es.js",
  "./js/program.en.js",
  "./js/program.es.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./fonts/anton-v27-latin-400.woff2",
  "./fonts/lato-v25-latin-400.woff2",
  "./fonts/lato-v25-latin-700.woff2",
  "./fonts/lato-v25-latin-900.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("holiday-30-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for this app's own files only. Navigations ignore the query string
// so ?date= test links still load offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const isNav = req.mode === "navigate";
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(isNav ? "./index.html" : req, { ignoreSearch: isNav });
      const fetched = fetch(req)
        .then((res) => {
          if (res.ok && !isNav) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
