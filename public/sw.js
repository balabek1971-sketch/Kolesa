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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "У вас новое сообщение." };
  }

  const title = String(payload.title || "Новое сообщение").slice(0, 120);
  const body = String(payload.body || "Откройте QazAuto, чтобы прочитать.").slice(0, 240);
  const url = String(payload.url || "/#/messages");
  const safeUrl = url.startsWith("/#/messages") ? url : "/#/messages";
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: String(payload.tag || "qazauto-message").slice(0, 120),
      renotify: true,
      data: { url: safeUrl },
    }),
    "setAppBadge" in navigator ? navigator.setAppBadge(Number(payload.badge) || 1) : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/#/messages", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
