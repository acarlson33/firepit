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

/**
 * Higher-order function to wrap API route handlers with rate limiting
 */
export function withRateLimit<T>(
	handler: (request: Request, context: T) => Promise<Response>,
	config: RateLimitConfig,
	getIdentifier: (request: Request) => string | Promise<string>,
): (request: Request, context: T) => Promise<Response> {
	return async (request: Request, context: T): Promise<Response> => {
		const identifier = await getIdentifier(request);
		const result = checkRateLimit(identifier, config);

		// Add rate limit headers
		const headers = new Headers();
		headers.set("X-RateLimit-Limit", config.maxRequests.toString());
		headers.set("X-RateLimit-Remaining", result.remaining.toString());
		headers.set("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

		if (!result.allowed) {
			// Rate limit exceeded
			headers.set("Retry-After", (result.retryAfter ?? 0).toString());

			return new Response(
				JSON.stringify({
					error: "RATE_LIMIT_EXCEEDED",
					message: "Too many requests, please try again later",
					retryAfter: result.retryAfter,
				}),
				{
					status: 429,
					headers: {
						"Content-Type": "application/json",
						...Object.fromEntries(headers.entries()),
					},
				},
			);
		}

		// Call handler and add rate limit headers to response
		const response = await handler(request, context);

		// Add rate limit headers to response
		for (const [key, value] of headers.entries()) {
			response.headers.set(key, value);
		}

		return response;
	};
}

/**
 * Predefined rate limit configurations
 */
export const RateLimits = {
	/**
	 * Strict limit for sensitive operations (5 requests per minute)
	 */
	STRICT: {
		maxRequests: 5,
		windowMs: 60 * 1000, // 1 minute
	},

	/**
	 * Standard limit for regular API endpoints (30 requests per minute)
	 */
	STANDARD: {
		maxRequests: 30,
		windowMs: 60 * 1000, // 1 minute
	},

	/**
	 * Moderate limit for read-heavy endpoints (60 requests per minute)
	 */
	MODERATE: {
		maxRequests: 60,
		windowMs: 60 * 1000, // 1 minute
	},

	/**
	 * Relaxed limit for high-frequency operations (100 requests per minute)
	 */
	RELAXED: {
		maxRequests: 100,
		windowMs: 60 * 1000, // 1 minute
	},

	/**
	 * Message sending limit (10 messages per 10 seconds)
	 */
	MESSAGES: {
		maxRequests: 10,
		windowMs: 10 * 1000, // 10 seconds
	},

	/**
	 * Typing indicators limit (5 per 5 seconds)
	 */
	TYPING: {
		maxRequests: 5,
		windowMs: 5 * 1000, // 5 seconds
	},

	/**
	 * Search limit (10 searches per minute)
	 */
	SEARCH: {
		maxRequests: 10,
		windowMs: 60 * 1000, // 1 minute
	},

	/**
	 * File upload limit (5 uploads per minute)
	 */
	FILE_UPLOAD: {
		maxRequests: 5,
		windowMs: 60 * 1000, // 1 minute
	},

	/**
	 * Invite generation limit (10 invites per hour)
	 */
	INVITE_GENERATION: {
		maxRequests: 10,
		windowMs: 60 * 60 * 1000, // 1 hour
	},

	/**
	 * Server creation limit (3 servers per hour)
	 */
	SERVER_CREATION: {
		maxRequests: 3,
		windowMs: 60 * 60 * 1000, // 1 hour
	},
};
