// Cekin – service worker
// Predpomnilnik ima unikatno predpono "cekin-", zato ne posega v druge
// aplikacije na isti domeni. Ob novi verziji spremeni VERSION.
const VERSION = "1.1.0";
const CACHE = `cekin-${VERSION}`;
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/backend.js", "./js/icons.js", "./js/config.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon.ico", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cekin-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);

  // Lastne datoteke: najprej omrežje (sveže), ob izpadu predpomnilnik
  if (url.origin === location.origin && url.pathname.startsWith(scope.pathname)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    );
    return;
  }
  // Firebase SDK in pisave: predpomnilnik, v ozadju osveži
  if (url.hostname === "www.gstatic.com" || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
  }
  // Realtime Database (WebSocket) in Auth klici gredo neposredno v omrežje.
});
