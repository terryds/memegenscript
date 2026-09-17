/* Memegenscript service worker: offline pages, cached fonts/templates/static assets. */
const VERSION = "__VERSION__";
const PAGES = "pages-" + VERSION;
const ASSETS = "assets-" + VERSION;
const IMAGES = "images-" + VERSION;
const OFFLINE_URL = "/offline";
const IMAGE_LIMIT = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((cache) => cache.addAll([OFFLINE_URL, "/"]).catch(() => cache.add(OFFLINE_URL))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    if (limit) trim(cacheName, limit);
  }
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    return hit || cache.match(OFFLINE_URL);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/static/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname.startsWith("/images/") && !url.pathname.startsWith("/images/preview")) {
    event.respondWith(cacheFirst(request, IMAGES, IMAGE_LIMIT));
  }
});
