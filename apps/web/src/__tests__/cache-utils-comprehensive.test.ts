/**
 * Tests for cache-utils module - apiCache
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiCache, CACHE_TTL } from "@/lib/cache-utils";

describe("apiCache", () => {
	beforeEach(() => {
		apiCache.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("get and set", () => {
		it("should store and retrieve data", () => {
			apiCache.set("key1", "value1", 1000);
			expect(apiCache.get("key1")).toBe("value1");
		});

		it("should return null for non-existent keys", () => {
			expect(apiCache.get("nonexistent")).toBeNull();
		});

		it("should return null for expired data", () => {
			apiCache.set("key1", "value1", 1000);
			
			vi.advanceTimersByTime(1001);
			
			expect(apiCache.get("key1")).toBeNull();
		});

		it("should return data before TTL expires", () => {
			apiCache.set("key1", "value1", 1000);
			
			vi.advanceTimersByTime(500);
			
			expect(apiCache.get("key1")).toBe("value1");
		});

		it("should handle different data types", () => {
			apiCache.set("string", "text", 1000);
			apiCache.set("number", 42, 1000);
			apiCache.set("object", { foo: "bar" }, 1000);
			apiCache.set("array", [1, 2, 3], 1000);
			apiCache.set("boolean", true, 1000);

			expect(apiCache.get("string")).toBe("text");
			expect(apiCache.get("number")).toBe(42);
			expect(apiCache.get("object")).toEqual({ foo: "bar" });
			expect(apiCache.get("array")).toEqual([1, 2, 3]);
			expect(apiCache.get("boolean")).toBe(true);
		});

		it("should overwrite existing keys", () => {
			apiCache.set("key1", "value1", 1000);
			apiCache.set("key1", "value2", 1000);
			expect(apiCache.get("key1")).toBe("value2");
		});
	});

	describe("clear", () => {
		it("should clear specific key", () => {
			apiCache.set("key1", "value1", 1000);
			apiCache.set("key2", "value2", 1000);

			apiCache.clear("key1");

			expect(apiCache.get("key1")).toBeNull();
			expect(apiCache.get("key2")).toBe("value2");
		});

		it("should clear all keys when no key specified", () => {
			apiCache.set("key1", "value1", 1000);
			apiCache.set("key2", "value2", 1000);
			apiCache.set("key3", "value3", 1000);

			apiCache.clear();

			expect(apiCache.get("key1")).toBeNull();
			expect(apiCache.get("key2")).toBeNull();
			expect(apiCache.get("key3")).toBeNull();
		});

		it("should handle clearing non-existent keys gracefully", () => {
			expect(() => apiCache.clear("nonexistent")).not.toThrow();
		});
	});

	describe("has", () => {
		it("should return true for valid cached data", () => {
			apiCache.set("key1", "value1", 1000);
			expect(apiCache.has("key1")).toBe(true);
		});

		it("should return false for non-existent keys", () => {
			expect(apiCache.has("nonexistent")).toBe(false);
		});

		it("should return false for expired data", () => {
			apiCache.set("key1", "value1", 1000);
			
			vi.advanceTimersByTime(1001);
			
			expect(apiCache.has("key1")).toBe(false);
		});
	});

	describe("dedupe", () => {
		it("should return cached data if available", async () => {
			const fetcher = vi.fn().mockResolvedValue("fresh data");
			
			apiCache.set("key1", "cached data", 1000);
			
			const result = await apiCache.dedupe("key1", fetcher, 1000);
			
			expect(result).toBe("cached data");
			expect(fetcher).not.toHaveBeenCalled();
		});

		it("should call fetcher if data not cached", async () => {
			const fetcher = vi.fn().mockResolvedValue("fresh data");
			
			const result = await apiCache.dedupe("key1", fetcher, 1000);
			
			expect(result).toBe("fresh data");
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		it("should cache fetched data", async () => {
			const fetcher = vi.fn().mockResolvedValue("fresh data");
			
			await apiCache.dedupe("key1", fetcher, 1000);
			
			expect(apiCache.get("key1")).toBe("fresh data");
		});

		it("should deduplicate concurrent requests", async () => {
			let resolveCount = 0;
			const fetcher = vi.fn().mockImplementation(
				() => new Promise<string>((resolve) => {
					setTimeout(() => {
						resolveCount++;
						resolve("data");
					}, 100);
				})
			);
			
			// Start two concurrent requests
			const promise1 = apiCache.dedupe("key1", fetcher, 1000);
			const promise2 = apiCache.dedupe("key1", fetcher, 1000);
			
			vi.advanceTimersByTime(100);
			
			const [result1, result2] = await Promise.all([promise1, promise2]);
			
			expect(result1).toBe("data");
			expect(result2).toBe("data");
			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		it("should handle fetcher errors", async () => {
			const fetcher = vi.fn().mockRejectedValue(new Error("Fetch failed"));
			
			await expect(apiCache.dedupe("key1", fetcher, 1000)).rejects.toThrow("Fetch failed");
			
			// Should not cache failed requests
			expect(apiCache.get("key1")).toBeNull();
		});

		it("should allow retry after failed request", async () => {
			const fetcher = vi.fn()
				.mockRejectedValueOnce(new Error("First attempt failed"))
				.mockResolvedValueOnce("success");
			
			await expect(apiCache.dedupe("key1", fetcher, 1000)).rejects.toThrow("First attempt failed");
			
			const result = await apiCache.dedupe("key1", fetcher, 1000);
			
			expect(result).toBe("success");
			expect(fetcher).toHaveBeenCalledTimes(2);
		});

		it("should clear pending request on error", async () => {
			const fetcher = vi.fn().mockRejectedValue(new Error("Failed"));
			
			await expect(apiCache.dedupe("key1", fetcher, 1000)).rejects.toThrow("Failed");
			
			// Verify pending request was cleaned up
			const fetcher2 = vi.fn().mockResolvedValue("success");
			await apiCache.dedupe("key1", fetcher2, 1000);
			
			expect(fetcher2).toHaveBeenCalledTimes(1);
		});

		it("should handle different TTL values", async () => {
			const fetcher1 = vi.fn().mockResolvedValue("data1");
			const fetcher2 = vi.fn().mockResolvedValue("data2");
			
			await apiCache.dedupe("key1", fetcher1, 500);
			
			vi.advanceTimersByTime(600);
			
			await apiCache.dedupe("key1", fetcher2, 1000);
			
			expect(fetcher2).toHaveBeenCalledTimes(1);
			expect(apiCache.get("key1")).toBe("data2");
		});
	});

	describe("Edge Cases", () => {
		it("should handle zero TTL", () => {
			apiCache.set("key1", "value1", 0);
			
			vi.advanceTimersByTime(1);
			
			expect(apiCache.get("key1")).toBeNull();
		});

		it("should handle negative TTL", () => {
			apiCache.set("key1", "value1", -1000);
			
			expect(apiCache.get("key1")).toBeNull();
		});

		it("should handle very large TTL", () => {
			const largeTTL = Number.MAX_SAFE_INTEGER;
			apiCache.set("key1", "value1", largeTTL);
			
			vi.advanceTimersByTime(1000000);
			
			expect(apiCache.get("key1")).toBe("value1");
		});

		it("should handle null values", () => {
			apiCache.set("key1", null, 1000);
			expect(apiCache.get("key1")).toBeNull();
		});

		it("should handle undefined values", () => {
			apiCache.set("key1", undefined, 1000);
			expect(apiCache.get("key1")).toBeUndefined();
		});

		it("should handle empty strings", () => {
			apiCache.set("key1", "", 1000);
			expect(apiCache.get("key1")).toBe("");
		});

		it("should handle special characters in keys", () => {
			apiCache.set("key:with:colons", "value1", 1000);
			apiCache.set("key-with-dashes", "value2", 1000);
			apiCache.set("key_with_underscores", "value3", 1000);
			apiCache.set("key.with.dots", "value4", 1000);
			
			expect(apiCache.get("key:with:colons")).toBe("value1");
			expect(apiCache.get("key-with-dashes")).toBe("value2");
			expect(apiCache.get("key_with_underscores")).toBe("value3");
			expect(apiCache.get("key.with.dots")).toBe("value4");
		});
	});

	describe("Persistence", () => {
		it("should persist across module imports", () => {
			apiCache.set("persistent", "data", 1000);
			
			// Simulate accessing from different parts of the app
			expect(apiCache.has("persistent")).toBe(true);
			expect(apiCache.get("persistent")).toBe("data");
		});

		it("should support dedupe operations", async () => {
			const fetcher = vi.fn().mockResolvedValue("api data");
			
			const result = await apiCache.dedupe("api:users", fetcher, 5000);
			
			expect(result).toBe("api data");
			expect(fetcher).toHaveBeenCalledTimes(1);
		});
	});
});

describe("CACHE_TTL", () => {
	it("should export TTL constants", () => {
		expect(CACHE_TTL.SERVERS).toBeDefined();
		expect(CACHE_TTL.CHANNELS).toBeDefined();
		expect(CACHE_TTL.MEMBERSHIPS).toBeDefined();
		expect(CACHE_TTL.PROFILES).toBeDefined();
		expect(CACHE_TTL.USER_STATUS).toBeDefined();
		expect(CACHE_TTL.MESSAGES).toBeDefined();
		expect(CACHE_TTL.CONVERSATIONS).toBeDefined();
	});

	it("should have reasonable TTL values", () => {
		expect(CACHE_TTL.SERVERS).toBeGreaterThan(0);
		expect(CACHE_TTL.CHANNELS).toBeGreaterThan(0);
		expect(CACHE_TTL.MESSAGES).toBeGreaterThan(0);
		
		// Server data should have longer TTL than messages
		expect(CACHE_TTL.SERVERS).toBeGreaterThan(CACHE_TTL.MESSAGES);
	});
});
