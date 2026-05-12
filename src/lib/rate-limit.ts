import { isIP } from "node:net";

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

function parsePositiveIntegerEnv(
    value: string | undefined,
    fallback: number,
): number {
    const parsed = Number.parseInt(value ?? "", 10);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }

    return fallback;
}

const PARSED_RATE_LIMIT_AUTH_WINDOW_MS = parsePositiveIntegerEnv(
    process.env.RATE_LIMIT_AUTH_WINDOW_MS,
    DEFAULT_AUTH_CONFIG.windowMs,
);
const PARSED_RATE_LIMIT_AUTH_MAX = parsePositiveIntegerEnv(
    process.env.RATE_LIMIT_AUTH_MAX,
    DEFAULT_AUTH_CONFIG.maxRequests,
);
const PARSED_RATE_LIMIT_API_WINDOW_MS = parsePositiveIntegerEnv(
    process.env.RATE_LIMIT_API_WINDOW_MS,
    DEFAULT_API_CONFIG.windowMs,
);
const PARSED_RATE_LIMIT_API_MAX = parsePositiveIntegerEnv(
    process.env.RATE_LIMIT_API_MAX,
    DEFAULT_API_CONFIG.maxRequests,
);

function getAuthConfig(): RateLimitConfig {
    return {
        windowMs: PARSED_RATE_LIMIT_AUTH_WINDOW_MS,
        maxRequests: PARSED_RATE_LIMIT_AUTH_MAX,
    };
}

function getApiConfig(): RateLimitConfig {
    return {
        windowMs: PARSED_RATE_LIMIT_API_WINDOW_MS,
        maxRequests: PARSED_RATE_LIMIT_API_MAX,
    };
}

function isAuthEndpoint(pathname: string): boolean {
    return pathname.startsWith("/api/auth") || pathname === "/api/login";
}

function parseTrustedProxies(): Set<string> {
    const configured = process.env.TRUSTED_PROXIES?.trim();
    if (!configured) {
        return new Set();
    }

    return new Set(
        configured
            .split(",")
            .map((value) => value.trim())
            .filter((value) => isIP(value) > 0),
    );
}

const TRUSTED_PROXIES = parseTrustedProxies();

function normalizeIp(value: string): string {
    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith("::ffff:")) {
        return trimmed.slice(7);
    }

    return trimmed;
}

function isPrivateOrLoopbackIp(value: string): boolean {
    const ip = normalizeIp(value);
    if (isIP(ip) === 4) {
        const octets = ip.split(".").map((part) => Number(part));
        if (octets.some((part) => Number.isNaN(part))) {
            return true;
        }

        const [first, second] = octets;
        return (
            first === 10 ||
            first === 127 ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168) ||
            (first === 100 && second >= 64 && second <= 127)
        );
    }

    const lower = ip.toLowerCase();
    return (
        lower === "::1" ||
        lower.startsWith("fe80:") ||
        lower.startsWith("fc") ||
        lower.startsWith("fd")
    );
}

function isPublicIp(value: string): boolean {
    return isIP(value) > 0 && !isPrivateOrLoopbackIp(value);
}

function firstValidPublicIp(values: string[]): string | null {
    for (const value of values) {
        if (isPublicIp(value)) {
            return normalizeIp(value);
        }
    }

    return null;
}

function getClientIp(request: Request): string {
    const cfConnectingIp = request.headers.get("cf-connecting-ip");
    if (cfConnectingIp && isPublicIp(cfConnectingIp)) {
        return normalizeIp(cfConnectingIp);
    }

    const trueClientIp = request.headers.get("true-client-ip");
    if (trueClientIp && isPublicIp(trueClientIp)) {
        return normalizeIp(trueClientIp);
    }

    const forwardedFor = request.headers.get("x-forwarded-for");

    const realIp = request.headers.get("x-real-ip");
    if (realIp && isPublicIp(realIp)) {
        return normalizeIp(realIp);
    }

    if (forwardedFor) {
        const ips = forwardedFor
            .split(",")
            .map((ip) => ip.trim())
            .filter(Boolean);

        if (ips.length > 0) {
            const proxyIp = ips.at(-1);
            if (proxyIp && TRUSTED_PROXIES.has(normalizeIp(proxyIp))) {
                const clientIp = firstValidPublicIp(ips);
                if (clientIp) {
                    return clientIp;
                }
            }
        }
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

const cleanupInterval = setInterval(cleanExpiredEntries, 60 * 1000);

if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}

export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig,
    scope: string = "default",
): RateLimitResult {
    const now = Date.now();
    const key = `rate_limit:${scope}:${identifier}`;

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
    const retryAfter = allowed
        ? undefined
        : Math.ceil((entry.resetAt - now) / 1000);

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
    const scope = isAuth ? "auth" : "api";

    return checkRateLimit(clientIp, config, scope);
}
