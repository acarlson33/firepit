/**
 * Service Worker for Firepit Chat Application
 * Provides offline support, aggressive caching, and push notifications
 *
 * Caching Strategies:
 * - Static assets: Cache-first with background revalidation
 * - API requests: Network-first with offline fallback (no caching)
 * - Emoji assets: Cache-first with aggressive caching and size bound
 * - Navigation: Network-first with offline fallback
 */

// Cache version names - update these to bust caches on deploy
// Bump cache versions to bust stale Next.js chunks when deploying new builds
var CACHE_NAME = "firepit-v4";
var API_CACHE_NAME = "firepit-api-v4";
var STATIC_CACHE_NAME = "firepit-static-v4";
var EMOJI_CACHE_NAME = "firepit-emoji-v4";
var EMOJI_CACHE_LIMIT = 200;

// Assets to cache immediately on install
var STATIC_ASSETS = ["/favicon.ico", "/manifest.json", "/manifest.webmanifest"];

// Reference to service worker scope
var sw = self;

// ============================================
// INSTALL EVENT
// ============================================
sw.addEventListener("install", function (event) {
    event.waitUntil(
        Promise.all([
            // Pre-create named caches so they appear in DevTools immediately
            caches.open(CACHE_NAME),
            caches.open(API_CACHE_NAME),
            caches.open(EMOJI_CACHE_NAME),
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
        ]),
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
    event.respondWith(
        (async function () {
            try {
                var request = event.request;
                var url = new URL(request.url);

                // Handle emoji requests with aggressive caching
                if (isEmojiRequest(url)) {
                    return await handleEmojiRequest(request);
                }

                // Handle API requests with network-first strategy
                if (url.pathname.startsWith("/api/")) {
                    return await handleApiRequest(request);
                }

                // Handle static assets with cache-first strategy
                if (request.method === "GET" && isStaticAsset(url.pathname)) {
                    return await handleStaticAsset(request);
                }

                // Handle navigation requests with stale-while-revalidate
                if (request.mode === "navigate") {
                    return await handleNavigationRequest(request);
                }

                // Default: fetch from network
                return await fetch(request);
            } catch (err) {
                console.warn("Service Worker fetch handler error", err);
                return fetch(event.request);
            }
        })(),
    );
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if URL is an emoji request
 */
function isEmojiRequest(url) {
    return (
        url.pathname.startsWith("/api/emoji/") ||
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
 * APIs that must never be cached for security/session correctness
 */
function isSessionSensitiveApiPath(pathname) {
    return (
        pathname === "/api/me" ||
        pathname === "/api/session" ||
        pathname === "/api/login" ||
        pathname === "/api/logout" ||
        pathname === "/api/auth" ||
        pathname.startsWith("/api/auth/")
    );
}

/**
 * Handle emoji requests with cache-first strategy
 */
function handleEmojiRequest(request) {
    return caches.open(EMOJI_CACHE_NAME).then(function (cache) {
        return cache.match(request).then(function (cachedResponse) {
            if (cachedResponse && cachedResponse.ok) {
                // Return cached emoji immediately, update in background
                fetch(request)
                    .then(function (response) {
                        if (response.status === 200) {
                            cache.put(request, response.clone());
                            enforceEmojiCacheLimit(cache);
                        }
                    })
                    .catch(function () {
                        // Ignore background fetch errors
                    });
                return cachedResponse;
            }

            // Not in cache (or cached response is bad), fetch and cache
            return fetch(request)
                .then(function (response) {
                    if (response.status === 200) {
                        cache.put(request, response.clone());
                        enforceEmojiCacheLimit(cache);
                    }

                    if (
                        response.status >= 500 &&
                        cachedResponse &&
                        cachedResponse.ok
                    ) {
                        return cachedResponse;
                    }

                    return response;
                })
                .catch(function () {
                    if (cachedResponse && cachedResponse.ok) {
                        return cachedResponse;
                    }
                    return new Response("Offline", {
                        status: 503,
                        headers: { "Content-Type": "text/plain" },
                    });
                });
        });
    });
}

/**
 * Handle API requests with network-first strategy
 */
function handleApiRequest(request) {
    if (request.method !== "GET") {
        return fetch(request);
    }

    var url = new URL(request.url);

    // Never cache session/auth-sensitive endpoints
    if (isSessionSensitiveApiPath(url.pathname)) {
        return fetch(request).catch(function () {
            return new Response(
                JSON.stringify({
                    error: "Session Sensitive API Request(s) are not cached",
                    offline: false,
                }),
                {
                    status: 403,
                    headers: { "Content-Type": "application/json" },
                },
            );
        });
    }

    return fetch(request)
        .then(function (response) {
            if (response.status === 200) {
                return caches.open(API_CACHE_NAME).then(function (cache) {
                    return cache
                        .put(request, response.clone())
                        .then(function () {
                            return response;
                        });
                });
            }
            return response;
        })
        .catch(function () {
            return caches
                .open(API_CACHE_NAME)
                .then(function (cache) {
                    return cache.match(request);
                })
                .then(function (cachedResponse) {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return new Response(
                        JSON.stringify({ error: "Offline", offline: true }),
                        {
                            status: 503,
                            headers: { "Content-Type": "application/json" },
                        },
                    );
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
 * Handle navigation requests with network-first strategy
 */
function handleNavigationRequest(request) {
    return fetch(request).catch(function () {
        return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
        });
    });
}

// ============================================
// PUSH SUBSCRIPTION CHANGE
// ============================================
sw.addEventListener("pushsubscriptionchange", function (event) {
    event.waitUntil(
        notifyClientsSubscriptionChange().catch(function () {
            // Ignore errors; clients will attempt to re-register when notified
        }),
    );
});

function notifyClientsSubscriptionChange() {
    return sw.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (clientList) {
            return Promise.all(
                clientList.map(function (client) {
                    return client.postMessage({
                        type: "PUSH_SUBSCRIPTION_CHANGE",
                    });
                }),
            );
        });
}

function enforceEmojiCacheLimit(cache) {
    return cache.keys().then(function (requests) {
        if (requests.length <= EMOJI_CACHE_LIMIT) {
            return;
        }

        var excess = requests.length - EMOJI_CACHE_LIMIT;
        var deletions = requests.slice(0, excess).map(function (request) {
            return cache.delete(request);
        });
        return Promise.all(deletions);
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
