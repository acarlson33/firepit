interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export type RateLimitConfig = {
	windowMs: number;
	maxRequests: number;
};

const DEFAULT_AUTH_CONFIG: RateLimitConfig = {
	windowMs: 60 * 1000,
	maxRequests: 10,
};

const DEFAULT_API_CONFIG: RateLimitConfig = {
	windowMs: 60 * 1000,
	maxRequests: 60,
};

function getAuthConfig(): RateLimitConfig {
	return {
		windowMs:
			Number.parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || "", 10) ||
			DEFAULT_AUTH_CONFIG.windowMs,
		maxRequests:
			Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX || "", 10) ||
			DEFAULT_AUTH_CONFIG.maxRequests,
	};
}

function getApiConfig(): RateLimitConfig {
	return {
		windowMs:
			Number.parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || "", 10) ||
			DEFAULT_API_CONFIG.windowMs,
		maxRequests:
			Number.parseInt(process.env.RATE_LIMIT_API_MAX || "", 10) ||
			DEFAULT_API_CONFIG.maxRequests,
	};
}

function isAuthEndpoint(pathname: string): boolean {
	return pathname.startsWith("/api/auth") || pathname === "/api/login";
}

function getClientIp(request: Request): string {
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		return forwardedFor.split(",")[0].trim();
	}

	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp;
	}

	return "unknown";
}

function cleanExpiredEntries(): void {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore.entries()) {
		if (entry.resetAt < now) {
			rateLimitStore.delete(key);
		}
	}
}

setInterval(cleanExpiredEntries, 60 * 1000);

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: number;
	retryAfter?: number;
}

export function checkRateLimit(
	identifier: string,
	config: RateLimitConfig,
): RateLimitResult {
	const now = Date.now();
	const key = `rate_limit:${identifier}`;

	let entry = rateLimitStore.get(key);

	if (!entry || entry.resetAt < now) {
		entry = {
			count: 0,
			resetAt: now + config.windowMs,
		};
	}

	entry.count++;
	rateLimitStore.set(key, entry);

	const remaining = Math.max(0, config.maxRequests - entry.count);
	const allowed = entry.count <= config.maxRequests;
	const retryAfter = allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000);

	return {
		allowed,
		remaining,
		resetAt: entry.resetAt,
		retryAfter,
	};
}

export function rateLimitRequest(
	request: Request,
	pathname: string,
): RateLimitResult {
	const isAuth = isAuthEndpoint(pathname);
	const config = isAuth ? getAuthConfig() : getApiConfig();
	const clientIp = getClientIp(request);

	return checkRateLimit(clientIp, config);
}
