const CACHE_NAME = "dokumenta-shell-v2";
const RUNTIME_CACHE = "dokumenta-runtime-v1";

const APP_SHELL_PATHS = [
  "",
  "index.html",
  "dashboard.html",
  "camera.html",
  "manifest.webmanifest",
  "css/style.css?v=20260426",
  "js/auth.js",
  "js/login.js",
  "js/dashboard.js",
  "js/camera.js",
  "js/pwa.js",
  "assets/icons/icon-192.svg",
  "assets/icons/icon-512.svg",
];

function scopeUrl(pathname) {
  return new URL(pathname, self.registration.scope).href;
}

function getAppShellUrls() {
  return APP_SHELL_PATHS.map(scopeUrl);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(getAppShellUrls()))
      .catch(() => Promise.resolve())
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method !== "GET") return;

  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, responseClone))
            .catch(() => {});
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return caches.match(scopeUrl("index.html"));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const responseClone = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, responseClone))
            .catch(() => {});
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
