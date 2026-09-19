/* ============================================================
   sw.js — GSS Inventory System Service Worker
   Caches all static files for offline use.
   Firebase data still needs internet — but the app
   shell (HTML/CSS/JS) loads instantly even offline.
   ============================================================ */

const CACHE_NAME = "gss-inventory-v1";

/* All static files to cache on install */
const STATIC_FILES = [
  "/",
  "/index.html",
  "/add.html",
  "/items.html",
  "/categories.html",
  "/history.html",
  "/admin.html",
  "/style.css",
  "/common.js",
  "/script.js",
  "/dashboard.js",
  "/categories.js",
  "/history.js",
  "/logo.png",
  "/manifest.json",
  "/auth.js",
  "/login.html",
];

/* ── Install — cache all static files ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_FILES);
      })
      .then(() => self.skipWaiting()),
  );
});

/* ── Activate — clean up old caches ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* ── Fetch — serve from cache, fall back to network ──
   Strategy:
   - Static files (HTML/CSS/JS/images): Cache First
     → serve instantly from cache, update in background
   - Firebase API calls: Network First
     → always try network, fall back to cache if offline
   - Everything else: Network First
*/
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  /* Firebase / Google APIs — always network first */
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("drive.google.com")
  ) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            JSON.stringify({
              success: false,
              error: "You are offline. Please check your internet connection.",
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    return;
  }

  /* Static files — cache first, update in background */
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached); // if network fails, return cached version

        /* Return cached immediately, update in background */
        return cached || networkFetch;
      }),
    );
  }
});

/* ── Push notifications (future use) ── */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || "GSS Inventory", {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
  });
});
