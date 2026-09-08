const buildId = new URL(self.location.href).searchParams.get("v") || "unknown";
const cacheName = `qazauto-${buildId}`;
const cachePrefix = "qazauto-";
const appShell = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

async function cacheAppShell() {
  const cache = await caches.open(cacheName);
  await cache.addAll(appShell);

  const indexResponse = await fetch("/index.html", { cache: "no-store" });
  const html = await indexResponse.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
    .map((match) => match[1]);

  await cache.addAll(assetUrls);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(cacheName).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.open(cacheName).then(async (cache) => {
      const cached = await cache.match(url.pathname);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
