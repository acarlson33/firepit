import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, resetRateLimit, getRateLimitStatus } from "@/lib/rate-limiter";

describe("Rate Limiter", () => {
	const testConfig = {
		maxRequests: 3,
		windowMs: 1000, // 1 second for faster tests
	};

	beforeEach(() => {
		// Clear rate limits before each test
		resetRateLimit("test-user");
	});

	describe("checkRateLimit", () => {
		it("should allow requests within limit", () => {
			const result1 = checkRateLimit("test-user", testConfig);
			expect(result1.allowed).toBe(true);
			expect(result1.remaining).toBe(2);

			const result2 = checkRateLimit("test-user", testConfig);
			expect(result2.allowed).toBe(true);
			expect(result2.remaining).toBe(1);

			const result3 = checkRateLimit("test-user", testConfig);
			expect(result3.allowed).toBe(true);
			expect(result3.remaining).toBe(0);
		});

		it("should block requests exceeding limit", () => {
			// Use up quota
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);

			// Fourth request should be blocked
			const result = checkRateLimit("test-user", testConfig);
			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
			expect(result.retryAfter).toBeGreaterThan(0);
		});

		it("should reset after window expires", async () => {
			// Use up quota
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);

			// Should be blocked
			const blocked = checkRateLimit("test-user", testConfig);
			expect(blocked.allowed).toBe(false);

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 1100));

			// Should be allowed again
			const result = checkRateLimit("test-user", testConfig);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(2);
		});

		it("should track different identifiers separately", () => {
			checkRateLimit("user1", testConfig);
			checkRateLimit("user1", testConfig);
			checkRateLimit("user1", testConfig);

			// user1 should be blocked
			const user1Result = checkRateLimit("user1", testConfig);
			expect(user1Result.allowed).toBe(false);

			// user2 should still be allowed
			const user2Result = checkRateLimit("user2", testConfig);
			expect(user2Result.allowed).toBe(true);
		});
	});

	describe("resetRateLimit", () => {
		it("should reset rate limit for identifier", () => {
			// Use up quota
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);

			// Should be blocked
			const blocked = checkRateLimit("test-user", testConfig);
			expect(blocked.allowed).toBe(false);

			// Reset
			resetRateLimit("test-user");

			// Should be allowed again
			const result = checkRateLimit("test-user", testConfig);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(2);
		});
	});

	describe("getRateLimitStatus", () => {
		it("should return status without consuming requests", () => {
			const status1 = getRateLimitStatus("test-user", testConfig);
			expect(status1.allowed).toBe(true);
			expect(status1.remaining).toBe(3);

			// Consume one request
			checkRateLimit("test-user", testConfig);

			const status2 = getRateLimitStatus("test-user", testConfig);
			expect(status2.allowed).toBe(true);
			expect(status2.remaining).toBe(2);

			// Status check shouldn't consume
			const status3 = getRateLimitStatus("test-user", testConfig);
			expect(status3.allowed).toBe(true);
			expect(status3.remaining).toBe(2);
		});

		it("should show blocked status when limit exceeded", () => {
			// Use up quota
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);
			checkRateLimit("test-user", testConfig);

			const status = getRateLimitStatus("test-user", testConfig);
			expect(status.allowed).toBe(false);
			expect(status.remaining).toBe(0);
			expect(status.retryAfter).toBeGreaterThan(0);
		});
	});

	describe("Rate limit headers", () => {
		it("should provide correct rate limit information", () => {
			const result = checkRateLimit("test-user", testConfig);

			expect(result.remaining).toBe(2);
			expect(result.resetAt).toBeGreaterThan(Date.now());
			expect(result.resetAt).toBeLessThanOrEqual(Date.now() + testConfig.windowMs);
		});
	});
});
