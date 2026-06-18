// ============================================
// SERVICE WORKER — JJ Apartment RMS
// To force all clients to update cache: bump CACHE_VERSION below
//
// DEBUG TIP: To fully clear the SW during development:
//   DevTools → Application → Storage → Clear site data
//   OR: DevTools → Application → Service Workers → Unregister, then reload
// ============================================

// --- CONFIG: change this one line to bust cache on new releases ---
const CACHE_VERSION = "v2";
const CACHE_NAME = "jj-rms-" + CACHE_VERSION;
const BASE = "/JJariel-RMS";

// --- PRECACHE LIST: add/remove cached pages here ---
const PRECACHE_URLS = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/admin/index.html",
  BASE + "/admin/tenants.html",
  BASE + "/admin/approvals.html",
  BASE + "/admin/billing.html",
  BASE + "/admin/ledger.html",
  BASE + "/admin/units.html",
  BASE + "/admin/utilities.html",
  BASE + "/admin/expenses.html",
  BASE + "/tenant/index.html",
  BASE + "/tenant/dashboard.html",
  BASE + "/assets/style.css",
  BASE + "/assets/config.js",
  BASE + "/assets/quick-payment.js",
  BASE + "/assets/icons/icon-192.png",
  BASE + "/assets/icons/icon-512.png",
  BASE + "/manifest.json"
];

// ============================================
// HELPER FUNCTIONS — route classification
// ============================================

// Returns true if the request is an API call to Google Apps Script
function isApiCall(url) {
  return url.includes("script.google.com");
}

// Returns true if the request is for web fonts
function isFontCall(url) {
  return url.includes("fonts.googleapis.com") || url.includes("api.fontshare.com");
}

// ============================================
// INSTALL — precache all listed URLs
// ============================================
self.addEventListener("install", function (event) {
  console.log("[SW] Installing cache:", CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      console.log("[SW] Installed:", CACHE_NAME);
      return self.skipWaiting();
    })
  );
});

// ============================================
// ACTIVATE — delete old caches, claim clients
// ============================================
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    }).then(function () {
      console.log("[SW] Activated, old caches cleared. Now on:", CACHE_NAME);
      return self.clients.claim();
    })
  );
});

// ============================================
// FETCH — route requests by type
// ============================================
self.addEventListener("fetch", function (event) {
  const url = event.request.url;

  // Non-GET requests (POST, PUT, etc.) cannot be cached by the Cache API.
  // Pass them straight through without any SW involvement.
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- API calls: network-only, JSON offline fallback ---
  if (isApiCall(url)) {
    event.respondWith(
      fetch(event.request)
        .catch(function () {
          console.log("[SW] API offline fallback triggered for:", url);
          return new Response(
            JSON.stringify({ success: false, error: "offline" }),
            { headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }

  // --- Font calls: network-first, cache 7 days, fallback to cache ---
  if (isFontCall(url)) {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
          return response;
        })
        .catch(function () {
          return caches.match(event.request);
        })
    );
    return;
  }

  // --- Everything else: cache-first, fallback to network + cache it ---
  // Final HTML fallback: serve index.html so app shell still loads
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;

      // Cache miss — fetch from network and store it
      console.log("[SW] Asset cache miss:", url);
      return fetch(event.request)
        .then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
          return response;
        })
        .catch(function () {
          // Final fallback for HTML pages — return the app shell
          if (event.request.headers.get("accept") && event.request.headers.get("accept").includes("text/html")) {
            return caches.match(BASE + "/index.html");
          }
        });
    })
  );
});
