const CACHE = "wf-plan-cache-v9";
const ASSETS = [
  "/js/health-ack.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/calories.js",
  "./js/foodList.js",
  "./js/compliance.js",
  "./js/meals.js",
  "./js/mealTime.js",
  "./data/days.json",
  "./data/foods.json",
  "./data/meals.json",
  "./data/master-list.json",
  "./js/masterFood.js",
  "./js/planGenerator.js",
  "./js/grocery.js",
  "./js/eatChipsUi.js",
  "./js/macroGroups.js",
  "./js/macroPickerUi.js",
  "./js/clearKitchen.js",
  "./js/grocery-links.js",
  "./js/grocerySheet.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok && request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
