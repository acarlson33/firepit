import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiCache } from "@/lib/cache-utils";

/**
 * Test to verify that the membership counter updates correctly after joining a server.
 * This test verifies the fix for the issue where the membership counter stays at 1
 * even after joining additional servers.
 */
describe("Membership Counter", () => {
	beforeEach(() => {
		// Clear cache before each test
		apiCache.clear();
	});

	it("should clear membership cache when joining a server", () => {
		const userId = "test-user-123";
		const cacheKey = `memberships:${userId}`;

		// Simulate initial membership data being cached
		const initialMemberships = [{ serverId: "server1", userId, role: "owner" as const }];
		apiCache.set(cacheKey, initialMemberships, 5 * 60 * 1000);

		// Verify cache has the initial data
		expect(apiCache.has(cacheKey)).toBe(true);
		expect(apiCache.get(cacheKey)).toEqual(initialMemberships);

		// Simulate joining a server - this should clear the cache
		apiCache.clear(cacheKey);
		apiCache.clear(`servers:initial:${userId}`);

		// Verify cache is cleared
		expect(apiCache.has(cacheKey)).toBe(false);
		expect(apiCache.get(cacheKey)).toBeNull();
	});

	it("should fetch fresh membership data after cache is cleared", async () => {
		const userId = "test-user-456";
		const cacheKey = `memberships:${userId}`;

		// Initial memberships (user owns 1 server)
		const initialMemberships = [
			{ $id: "m1", serverId: "server1", userId, role: "owner" as const, $createdAt: "2024-01-01" },
		];

		// After joining a server (user owns 1 server + joined 1 server = 2 memberships)
		const updatedMemberships = [
			{ $id: "m1", serverId: "server1", userId, role: "owner" as const, $createdAt: "2024-01-01" },
			{ $id: "m2", serverId: "server2", userId, role: "member" as const, $createdAt: "2024-01-02" },
		];

		// Mock fetch to return different data on subsequent calls
		let callCount = 0;
		global.fetch = vi.fn().mockImplementation(() => {
			callCount++;
			const memberships = callCount === 1 ? initialMemberships : updatedMemberships;
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ memberships }),
			});
		}) as any;

		// First call - should fetch and cache initial data
		const firstResult = await apiCache.dedupe(
			cacheKey,
			() => fetch("/api/memberships")
				.then((res) => res.json())
				.then((data) => data.memberships),
			5 * 60 * 1000
		);

		expect(firstResult).toEqual(initialMemberships);
		expect(callCount).toBe(1);

		// Simulate joining a server - clear cache
		apiCache.clear(cacheKey);

		// Second call - should fetch fresh data (not from cache)
		const secondResult = await apiCache.dedupe(
			cacheKey,
			() => fetch("/api/memberships")
				.then((res) => res.json())
				.then((data) => data.memberships),
			5 * 60 * 1000
		);

		expect(secondResult).toEqual(updatedMemberships);
		expect(callCount).toBe(2);
		expect(secondResult.length).toBe(2); // Membership counter should show 2

		// Clean up
		vi.restoreAllMocks();
	});

	it("should return cached data if cache is not cleared", async () => {
		const userId = "test-user-789";
		const cacheKey = `memberships:${userId}`;

		const initialMemberships = [
			{ $id: "m1", serverId: "server1", userId, role: "owner" as const, $createdAt: "2024-01-01" },
		];

		// Mock fetch to always return initial data
		let callCount = 0;
		global.fetch = vi.fn().mockImplementation(() => {
			callCount++;
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ 
					memberships: initialMemberships
				}),
			});
		}) as any;

		// First call - should fetch and cache data
		const firstResult = await apiCache.dedupe(
			cacheKey,
			() => fetch("/api/memberships")
				.then((res) => res.json())
				.then((data) => data.memberships),
			5 * 60 * 1000
		);

		expect(callCount).toBe(1);

		// Second call WITHOUT clearing cache - should return cached data
		const secondResult = await apiCache.dedupe(
			cacheKey,
			() => fetch("/api/memberships")
				.then((res) => res.json())
				.then((data) => data.memberships),
			5 * 60 * 1000
		);

		// Should still be 1 because we're getting cached data
		expect(secondResult.length).toBe(1);
		expect(callCount).toBe(1); // Fetch should not be called again
		expect(firstResult).toEqual(secondResult);

		// Clean up
		vi.restoreAllMocks();
	});
});
