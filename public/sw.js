/**
 * Service Worker for Firepit Chat Application
 * Provides offline support, aggressive caching, and push notifications
 *
 * Caching Strategies:
 * - Static assets: Cache-first with background revalidation
 * - API requests: Network-first with cache fallback
 * - Emoji assets: Cache-first with aggressive caching
 * - Navigation: Stale-while-revalidate
 */

// Cache version names - update these to bust caches on deploy
// Bump cache versions to bust stale Next.js chunks when deploying new builds
var CACHE_NAME = "firepit-v2";
var API_CACHE_NAME = "firepit-api-v2";
var STATIC_CACHE_NAME = "firepit-static-v2";
var EMOJI_CACHE_NAME = "firepit-emoji-v2";

// Assets to cache immediately on install
var STATIC_ASSETS = [
    "/",
    "/chat",
    "/favicon.ico",
    "/manifest.json",
    "/manifest.webmanifest",
];

// Reference to service worker scope
var sw = self;

// ============================================
// INSTALL EVENT
// ============================================
sw.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then(function (cache) {
            // Cache assets individually with error handling
            // This prevents installation failure if some assets don't exist
            return Promise.all(
                STATIC_ASSETS.map(function (url) {
                    return fetch(url)
                        .then(function (response) {
                            // Only cache successful responses
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                            // Log failed URLs but don't reject
                            console.warn(
                                "Service Worker: Failed to cache",
                                url,
                                response.status,
                            );
                            return Promise.resolve();
                        })
                        .catch(function (error) {
                            // Log errors but don't reject to allow installation to succeed
                            console.warn(
                                "Service Worker: Error caching",
                                url,
                                error.message,
                            );
                            return Promise.resolve();
                        });
                }),
            );
        }),
    );
    // Skip waiting to activate immediately
    sw.skipWaiting();
});

// ============================================
// ACTIVATE EVENT
// ============================================
sw.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function (name) {
                        // Delete old caches that don't match current versions
                        return (
                            name !== CACHE_NAME &&
                            name !== API_CACHE_NAME &&
                            name !== STATIC_CACHE_NAME &&
                            name !== EMOJI_CACHE_NAME
                        );
                    })
                    .map(function (name) {
                        return caches.delete(name);
                    }),
            );
        }),
    );
    // Take control of all clients immediately
    sw.clients.claim();
});

// ============================================
// FETCH EVENT
// ============================================
sw.addEventListener("fetch", function (event) {
    var request = event.request;
    var url = new URL(request.url);

    // Handle emoji requests with aggressive caching
    if (isEmojiRequest(url)) {
        event.respondWith(handleEmojiRequest(request));
        return;
    }

    // Handle API requests with network-first strategy
    if (url.pathname.startsWith("/api/")) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Handle static assets with cache-first strategy
    if (request.method === "GET" && isStaticAsset(url.pathname)) {
        event.respondWith(handleStaticAsset(request));
        return;
    }

    // Handle navigation requests with stale-while-revalidate
    if (request.mode === "navigate") {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    // Default: fetch from network
    event.respondWith(fetch(request));
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if URL is an emoji request
 */
function isEmojiRequest(url) {
    return (
        url.pathname.includes("/storage/buckets/emojis/files/") ||
        (url.pathname.includes("/v1/storage/buckets/") &&
            url.pathname.includes("/emojis/"))
    );
}

/**
 * Check if pathname is a static asset
 */
function isStaticAsset(pathname) {
    // Avoid caching Next.js build chunks; they change per deploy
    if (pathname.startsWith("/_next/")) {
        return false;
    }
    return (
        pathname.endsWith(".js") ||
        pathname.endsWith(".css") ||
        pathname.endsWith(".woff2") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".ico") ||
        pathname.endsWith(".webp")
    );
}

/**
 * Handle emoji requests with cache-first strategy
 */
function handleEmojiRequest(request) {
    return caches.open(EMOJI_CACHE_NAME).then(function (cache) {
        return cache.match(request).then(function (cachedResponse) {
            if (cachedResponse) {
                // Return cached emoji immediately, update in background
                fetch(request)
                    .then(function (response) {
                        if (response.status === 200) {
                            cache.put(request, response.clone());
                        }
                    })
                    .catch(function () {
                        // Ignore background fetch errors
                    });
                return cachedResponse;
            }

            // Not in cache, fetch and cache
            return fetch(request).then(function (response) {
                if (response.status === 200) {
                    cache.put(request, response.clone());
                }
                return response;
            });
        });
    });
}

/**
 * Handle API requests with network-first strategy
 */
function handleApiRequest(request) {
    return caches.open(API_CACHE_NAME).then(function (cache) {
        return fetch(request)
            .then(function (response) {
                // Cache successful responses
                if (response.status === 200) {
                    cache.put(request, response.clone());
                }
                return response;
            })
            .catch(function () {
                // Network failed, try cache
                return cache.match(request).then(function (cachedResponse) {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Return offline response
                    return new Response(
                        JSON.stringify({ error: "Offline", offline: true }),
                        {
                            status: 503,
                            headers: { "Content-Type": "application/json" },
                        },
                    );
                });
            });
    });
}

/**
 * Handle static assets with cache-first strategy
 */
function handleStaticAsset(request) {
    return caches.match(request).then(function (cachedResponse) {
        if (cachedResponse) {
            // Return cached, update in background
            fetch(request)
                .then(function (response) {
                    if (response.status === 200) {
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(request, response.clone());
                        });
                    }
                })
                .catch(function () {
                    // Ignore background fetch errors
                });
            return cachedResponse;
        }

        // Not cached, fetch and cache
        return fetch(request).then(function (response) {
            if (response.status === 200) {
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, response.clone());
                });
            }
            return response;
        });
    });
}

/**
 * Handle navigation requests with stale-while-revalidate
 */
function handleNavigationRequest(request) {
    return caches.match(request).then(function (cachedResponse) {
        var fetchPromise = fetch(request).then(function (response) {
            if (response.status === 200) {
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, response.clone());
                });
            }
            return response;
        });

        // Return cached if available, otherwise wait for network
        return cachedResponse || fetchPromise;
    });
}

// ============================================
// BACKGROUND SYNC
// ============================================
sw.addEventListener("sync", function (event) {
    if (event.tag === "sync-messages") {
        event.waitUntil(syncMessages());
    }
});

/**
 * Sync pending messages when back online
 */
function syncMessages() {
    // Placeholder for future IndexedDB message queue sync
    return Promise.resolve();
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================
sw.addEventListener("push", function (event) {
    if (!event.data) {
        return;
    }

    var data;
    try {
        data = event.data.json();
    } catch (e) {
        // Fallback for malformed push data
        event.waitUntil(
            sw.registration.showNotification("New Message", {
                body: event.data.text(),
                icon: "/favicon/favicon-192x192.png",
            }),
        );
        return;
    }

    var options = {
        body: data.body || "",
        icon: data.icon || "/favicon/favicon-192x192.png",
        badge: data.badge || "/favicon/favicon-72x72.png",
        tag: data.tag || "notification-" + Date.now(),
        data: {
            url: data.url || "/chat",
            type: data.type,
            messageId: data.data && data.data.messageId,
            channelId: data.data && data.data.channelId,
            serverId: data.data && data.data.serverId,
            conversationId: data.data && data.data.conversationId,
            senderId: data.data && data.data.senderId,
        },
        // Keep notification visible for mentions and DMs
        requireInteraction: data.type === "mention" || data.type === "dm",
        // Action buttons
        actions: [
            { action: "view", title: "View" },
            { action: "dismiss", title: "Dismiss" },
        ],
    };

    event.waitUntil(
        sw.registration.showNotification(data.title || "New Message", options),
    );
});

// ============================================
// NOTIFICATION CLICK
// ============================================
sw.addEventListener("notificationclick", function (event) {
    event.notification.close();

    var notificationData = event.notification.data || {};

    // Handle dismiss action
    if (event.action === "dismiss") {
        return;
    }

    // Build target URL based on notification data
    var targetUrl = notificationData.url || "/chat";

    if (notificationData.conversationId) {
        targetUrl = "/dm/" + notificationData.conversationId;
    } else if (notificationData.serverId && notificationData.channelId) {
        targetUrl =
            "/servers/" +
            notificationData.serverId +
            "/channels/" +
            notificationData.channelId;
        if (notificationData.messageId) {
            targetUrl += "?message=" + notificationData.messageId;
        }
    }

    event.waitUntil(
        sw.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then(function (clientList) {
                // Try to focus an existing window
                for (var i = 0; i < clientList.length; i++) {
                    var client = clientList[i];
                    if (
                        new URL(client.url).origin === sw.location.origin &&
                        "focus" in client
                    ) {
                        client.focus();
                        if ("navigate" in client) {
                            client.navigate(targetUrl);
                        }
                        return;
                    }
                }
                // No existing window, open a new one
                return sw.clients.openWindow(targetUrl);
            }),
    );
});
