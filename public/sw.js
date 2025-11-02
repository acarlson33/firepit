/* eslint-disable no-undef */
// Service Worker for offline support and aggressive caching
// Provides instant repeat visits (~100ms) and offline capabilities

const CACHE_NAME = "firepit-v1";
const API_CACHE_NAME = "firepit-api-v1";
const STATIC_CACHE_NAME = "firepit-static-v1";

// Assets to cache immediately on install
const STATIC_ASSETS = [
  "/",
  "/chat",
  "/favicon.ico",
  "/manifest.json",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name !== CACHE_NAME &&
              name !== API_CACHE_NAME &&
              name !== STATIC_CACHE_NAME
            );
          })
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement stale-while-revalidate strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests with network-first + stale-while-revalidate
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) => {
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // If network fails, try cache
            return cache.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline response if no cache
              return new Response(
                JSON.stringify({ error: "Offline", offline: true }),
                {
                  status: 503,
                  headers: { "Content-Type": "application/json" },
                }
              );
            });
          });
      })
    );
    return;
  }

  // Handle static assets with cache-first strategy
  if (
    request.method === "GET" &&
    (url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".jpg") ||
      url.pathname.endsWith(".svg"))
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          // Update cache in background
          fetch(request)
            .then((response) => {
              if (response.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response);
                });
              }
            })
            .catch(() => {
              /* Ignore fetch errors in background update */
            });
          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(request).then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // For navigation requests, use stale-while-revalidate
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        });

        // Return cached version if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: just fetch from network
  event.respondWith(fetch(request));
});

// Background sync for offline message queue
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-messages") {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Get pending messages from IndexedDB
  // Send them when back online
  // This would integrate with your message sending logic
  return Promise.resolve();
}

// Push notification support (future enhancement)
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: {
      url: data.url || "/chat",
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || "/chat")
  );
});
