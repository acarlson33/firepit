/**
 * Simple in-memory rate limiter for file uploads
 * Prevents abuse by limiting upload frequency per user
 */

type RateLimitEntry = {
	count: number;
	resetAt: number;
};

// Store rate limit data in memory (consider Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 10 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore.entries()) {
		if (entry.resetAt < now) {
			rateLimitStore.delete(key);
		}
	}
}, 10 * 60 * 1000);

export type RateLimitConfig = {
	maxRequests: number; // Maximum requests allowed
	windowMs: number; // Time window in milliseconds
};

export type RateLimitResult = {
	allowed: boolean;
	remaining: number;
	resetAt: number;
	retryAfter?: number; // Seconds until next allowed request
};

/**
 * Check if a request is allowed under rate limiting
 */
export function checkRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
	const now = Date.now();
	const entry = rateLimitStore.get(identifier);

	// No existing entry or window expired - allow and create new entry
	if (!entry || entry.resetAt < now) {
		const resetAt = now + config.windowMs;
		rateLimitStore.set(identifier, {
			count: 1,
			resetAt,
		});

		return {
			allowed: true,
			remaining: config.maxRequests - 1,
			resetAt,
		};
	}

	// Existing entry within window
	if (entry.count < config.maxRequests) {
		// Still have quota - allow and increment
		entry.count += 1;
		rateLimitStore.set(identifier, entry);

		return {
			allowed: true,
			remaining: config.maxRequests - entry.count,
			resetAt: entry.resetAt,
		};
	}

	// Rate limit exceeded
	const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
	return {
		allowed: false,
		remaining: 0,
		resetAt: entry.resetAt,
		retryAfter,
	};
}

/**
 * Reset rate limit for a specific identifier
 */
export function resetRateLimit(identifier: string): void {
	rateLimitStore.delete(identifier);
}

/**
 * Get current rate limit status without consuming a request
 */
export function getRateLimitStatus(identifier: string, config: RateLimitConfig): RateLimitResult {
	const now = Date.now();
	const entry = rateLimitStore.get(identifier);

	if (!entry || entry.resetAt < now) {
		return {
			allowed: true,
			remaining: config.maxRequests,
			resetAt: now + config.windowMs,
		};
	}

	const remaining = config.maxRequests - entry.count;
	if (remaining > 0) {
		return {
			allowed: true,
			remaining,
			resetAt: entry.resetAt,
		};
	}

	const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
	return {
		allowed: false,
		remaining: 0,
		resetAt: entry.resetAt,
		retryAfter,
	};
}
