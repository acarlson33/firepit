/**
 * Tests for service worker (sw.js)
 * Validates service worker structure, cache names, and logic patterns
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Service Worker", () => {
	let swCode: string;

	beforeEach(() => {
		const swPath = join(process.cwd(), "public", "sw.js");
		swCode = readFileSync(swPath, "utf-8");
	});

	describe("Cache Configuration", () => {
		it("should define cache names", () => {
			expect(swCode).toContain('CACHE_NAME = "firepit-v1"');
			expect(swCode).toContain('API_CACHE_NAME = "firepit-api-v1"');
			expect(swCode).toContain('STATIC_CACHE_NAME = "firepit-static-v1"');
			expect(swCode).toContain('EMOJI_CACHE_NAME = "firepit-emoji-v1"');
		});

		it("should define static assets to cache", () => {
			expect(swCode).toContain("STATIC_ASSETS");
			expect(swCode).toContain('"/chat"');
			expect(swCode).toContain('"/favicon.ico"');
			expect(swCode).toContain('"/manifest.json"');
		});
	});

	describe("Install Event Listener", () => {
		it("should have install event listener", () => {
			expect(swCode).toContain('addEventListener("install"');
		});

		it("should cache static assets on install", () => {
			expect(swCode).toContain("caches.open(STATIC_CACHE_NAME)");
			expect(swCode).toContain("cache.addAll(STATIC_ASSETS)");
		});

		it("should call skipWaiting on install", () => {
			expect(swCode).toContain("sw.skipWaiting()");
		});

		it("should use event.waitUntil for install", () => {
			const installMatch = swCode.match(/addEventListener\("install"[^}]+/);
			expect(installMatch).toBeTruthy();
			expect(installMatch?.[0]).toContain("event.waitUntil");
		});
	});

	describe("Activate Event Listener", () => {
		it("should have activate event listener", () => {
			expect(swCode).toContain('addEventListener("activate"');
		});

		it("should clean up old caches on activate", () => {
			expect(swCode).toContain("caches.keys()");
			expect(swCode).toContain("caches.delete(name)");
		});

		it("should preserve current cache versions", () => {
			const activateSection = swCode.match(
				/addEventListener\("activate"[\s\S]*?}\);/
			);
			expect(activateSection).toBeTruthy();
			expect(activateSection?.[0]).toContain("CACHE_NAME");
			expect(activateSection?.[0]).toContain("API_CACHE_NAME");
			expect(activateSection?.[0]).toContain("STATIC_CACHE_NAME");
			expect(activateSection?.[0]).toContain("EMOJI_CACHE_NAME");
		});

		it("should call clients.claim on activate", () => {
			expect(swCode).toContain("sw.clients.claim()");
		});
	});

	describe("Fetch Event - Emoji Requests", () => {
		it("should handle emoji requests with cache-first strategy", () => {
			expect(swCode).toContain('includes("/storage/buckets/emojis/files/")');
			expect(swCode).toContain('includes("/v1/storage/buckets/")');
			expect(swCode).toContain('includes("/emojis/")');
		});

		it("should use dedicated emoji cache", () => {
			expect(swCode).toContain("EMOJI_CACHE_NAME");
			expect(swCode).toContain("caches.open(EMOJI_CACHE_NAME)");
		});

		it("should return cached emojis immediately", () => {
			const emojiSection = swCode.match(
				/storage\/buckets\/emojis[\s\S]*?return;/
			);
			expect(emojiSection).toBeTruthy();
			expect(emojiSection?.[0]).toContain("cache.match(request)");
			expect(emojiSection?.[0]).toContain("cachedResponse");
		});

		it("should update emoji cache in background", () => {
			const emojiSection = swCode.match(
				/storage\/buckets\/emojis[\s\S]*?return;/
			);
			expect(emojiSection?.[0]).toContain("fetch(request)");
			expect(emojiSection?.[0]).toContain("cache.put(request, response.clone())");
		});

		it("should cache emojis on first fetch", () => {
			const emojiSection = swCode.match(
				/storage\/buckets\/emojis[\s\S]*?return;/
			);
			// Should cache new emoji fetches
			expect(emojiSection?.[0]).toContain("cache.put(request, response.clone())");
		});
	});

	describe("Fetch Event - API Requests", () => {
		it("should have fetch event listener", () => {
			expect(swCode).toContain('addEventListener("fetch"');
		});

		it("should handle API requests separately", () => {
			expect(swCode).toContain('pathname.startsWith("/api/")');
		});

		it("should use network-first strategy for API", () => {
			const apiFetchSection = swCode.match(
				/pathname\.startsWith\("\/api\/"[\s\S]*?return;/
			);
			expect(apiFetchSection).toBeTruthy();
			// Should fetch first, then fall back to cache
			expect(apiFetchSection?.[0]).toContain("fetch(request)");
			expect(apiFetchSection?.[0]).toContain("cache.match(request)");
		});

		it("should cache successful API responses", () => {
			const apiFetchSection = swCode.match(
				/pathname\.startsWith\("\/api\/"[\s\S]*?return;/
			);
			expect(apiFetchSection?.[0]).toContain("response.status === 200");
			expect(apiFetchSection?.[0]).toContain("cache.put(request, response.clone())");
		});

		it("should return offline response when API fails with no cache", () => {
			const apiFetchSection = swCode.match(
				/pathname\.startsWith\("\/api\/"[\s\S]*?return;/
			);
			expect(apiFetchSection?.[0]).toContain('error: "Offline"');
			expect(apiFetchSection?.[0]).toContain("offline: true");
			expect(apiFetchSection?.[0]).toContain("status: 503");
		});
	});

	describe("Fetch Event - Static Assets", () => {
		it("should handle static asset extensions", () => {
			expect(swCode).toContain('.endsWith(".js")');
			expect(swCode).toContain('.endsWith(".css")');
			expect(swCode).toContain('.endsWith(".woff2")');
			expect(swCode).toContain('.endsWith(".png")');
			expect(swCode).toContain('.endsWith(".jpg")');
			expect(swCode).toContain('.endsWith(".svg")');
		});

		it("should use cache-first strategy for static assets", () => {
			const staticSection = swCode.match(
				/endsWith\("\.js"\)[\s\S]*?return;[\s\S]*?return;/
			);
			expect(staticSection).toBeTruthy();
			// Should check cache first
			expect(staticSection?.[0]).toContain("caches.match(request)");
			expect(staticSection?.[0]).toContain("if (cachedResponse)");
		});

		it("should update cache in background for static assets", () => {
			const staticSection = swCode.match(
				/endsWith\("\.js"\)[\s\S]*?return;[\s\S]*?return;/
			);
			// Should fetch in background to update cache
			expect(staticSection?.[0]).toContain("fetch(request)");
			expect(staticSection?.[0]).toContain("cache.put(request, response");
		});
	});

	describe("Fetch Event - Navigation Requests", () => {
		it("should handle navigation requests", () => {
			expect(swCode).toContain('request.mode === "navigate"');
		});

		it("should use stale-while-revalidate for navigation", () => {
			const navSection = swCode.match(
				/request\.mode === "navigate"[\s\S]*?return;/
			);
			expect(navSection).toBeTruthy();
			expect(navSection?.[0]).toContain("caches.match(request)");
			expect(navSection?.[0]).toContain("fetch(request)");
			expect(navSection?.[0]).toContain("cachedResponse ||");
		});

		it("should cache navigation responses", () => {
			const navSection = swCode.match(
				/request\.mode === "navigate"[\s\S]*?return;/
			);
			expect(navSection?.[0]).toContain("cache.put(request, response.clone())");
		});
	});

	describe("Background Sync", () => {
		it("should have sync event listener", () => {
			expect(swCode).toContain('addEventListener("sync"');
		});

		it("should handle sync-messages tag", () => {
			expect(swCode).toContain('.tag === "sync-messages"');
		});

		it("should define syncMessages function", () => {
			expect(swCode).toContain("async function syncMessages()");
		});
	});

	describe("Push Notifications", () => {
		it("should have push event listener", () => {
			expect(swCode).toContain('addEventListener("push"');
		});

		it("should check for push data", () => {
			const pushSection = swCode.match(/addEventListener\("push"[\s\S]*?}\);/);
			expect(pushSection?.[0]).toContain("if (!event.data)");
			expect(pushSection?.[0]).toContain("return");
		});

		it("should parse push data as JSON", () => {
			expect(swCode).toContain(".data.json()");
		});

		it("should show notification with proper options", () => {
			const pushSection = swCode.match(/addEventListener\("push"[\s\S]*?}\);/);
			expect(pushSection?.[0]).toContain("showNotification");
			expect(pushSection?.[0]).toContain("body:");
			expect(pushSection?.[0]).toContain("icon:");
			expect(pushSection?.[0]).toContain("badge:");
		});

		it("should use default URL if not provided in push data", () => {
			const pushSection = swCode.match(/addEventListener\("push"[\s\S]*?}\);/);
			expect(pushSection?.[0]).toContain('data.url || "/chat"');
		});
	});

	describe("Notification Click", () => {
		it("should have notificationclick event listener", () => {
			expect(swCode).toContain('addEventListener("notificationclick"');
		});

		it("should close notification on click", () => {
			const clickSection = swCode.match(
				/addEventListener\("notificationclick"[\s\S]*?}\);/
			);
			expect(clickSection?.[0]).toContain(".notification.close()");
		});

		it("should open window to notification URL", () => {
			const clickSection = swCode.match(
				/addEventListener\("notificationclick"[\s\S]*?}\);/
			);
			expect(clickSection?.[0]).toContain("clients.openWindow");
			expect(clickSection?.[0]).toContain(".notification.data.url");
		});

		it("should use default URL if notification has no URL", () => {
			const clickSection = swCode.match(
				/addEventListener\("notificationclick"[\s\S]*?}\);/
			);
			expect(clickSection?.[0]).toContain('|| "/chat"');
		});
	});

	describe("Code Quality", () => {
		it("should use void for fire-and-forget operations", () => {
			expect(swCode).toContain("void ");
		});

		it("should use proper error handling", () => {
			expect(swCode).toContain(".catch(");
		});

		it("should use event.waitUntil for async operations", () => {
			const waitUntilCount = (swCode.match(/event\.waitUntil/g) || []).length;
			expect(waitUntilCount).toBeGreaterThan(0);
		});

		it("should clone responses when caching", () => {
			const cloneCount = (swCode.match(/response\.clone\(\)/g) || []).length;
			expect(cloneCount).toBeGreaterThanOrEqual(2);
		});

		it("should use proper HTTP status codes", () => {
			expect(swCode).toContain("status === 200");
			expect(swCode).toContain("status: 503");
		});
	});

	describe("Caching Strategies", () => {
		it("should implement multiple caching strategies", () => {
			// Network-first for API
			expect(swCode).toContain('pathname.startsWith("/api/")');
			// Cache-first for static assets
			expect(swCode).toContain('request.method === "GET"');
			// Stale-while-revalidate for navigation
			expect(swCode).toContain('request.mode === "navigate"');
			// Cache-first for emojis
			expect(swCode).toContain('"/storage/buckets/emojis/files/"');
		});

		it("should use separate cache for API responses", () => {
			expect(swCode).toContain("API_CACHE_NAME");
		});

		it("should use separate cache for emoji responses", () => {
			expect(swCode).toContain("EMOJI_CACHE_NAME");
		});

		it("should open correct cache for each strategy", () => {
			expect(swCode).toContain("caches.open(API_CACHE_NAME)");
			expect(swCode).toContain("caches.open(CACHE_NAME)");
			expect(swCode).toContain("caches.open(STATIC_CACHE_NAME)");
			expect(swCode).toContain("caches.open(EMOJI_CACHE_NAME)");
		});
	});

	describe("Offline Support", () => {
		it("should provide offline responses for API requests", () => {
			expect(swCode).toContain('"Offline"');
			expect(swCode).toContain("offline: true");
		});

		it("should cache responses for offline access", () => {
			const putCount = (swCode.match(/cache\.put\(/g) || []).length;
			expect(putCount).toBeGreaterThan(3);
		});

		it("should fall back to cache when network fails", () => {
			const catchCount = (swCode.match(/\.catch\(\(\) =>/g) || []).length;
			expect(catchCount).toBeGreaterThan(0);
		});
	});
});
