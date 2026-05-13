import { isIP } from "node:net";

import { logger } from "./newrelic-utils";

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// This store is intentionally process-local. It is acceptable for a single
// Node process or local development, but it will not coordinate limits across
// multiple instances, serverless workers, or edge replicas.
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

const TRUSTED_PLATFORM = process.env.TRUSTED_PLATFORM?.trim().toLowerCase();

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

if (
    process.env.NODE_ENV !== "test" &&
    TRUSTED_PROXIES.size === 0 &&
    TRUSTED_PLATFORM !== "cloudflare"
) {
    logger.warn(
        "Rate limiting is running without trusted proxy configuration; forwarded IP headers will be ignored.",
        {
            trustedPlatform: TRUSTED_PLATFORM ?? "none",
        },
    );
}

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
        /^fe[89ab][0-9a-f]:/i.test(lower) ||
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

function getImmediatePeerIp(request: Request): string | null {
    const requestWithIp = request as Request & { ip?: string | null };
    const requestIp = requestWithIp.ip;
    if (typeof requestIp === "string" && requestIp.trim().length > 0) {
        return normalizeIp(requestIp);
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (!forwardedFor) {
        return null;
    }

    const ips = forwardedFor
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean);

    const proxyIp = ips.at(-1);
    if (!proxyIp) {
        return null;
    }

    return normalizeIp(proxyIp);
}

function isTrustedProxyRequest(request: Request): boolean {
    if (TRUSTED_PLATFORM === "cloudflare") {
        return true;
    }

    const peerIp = getImmediatePeerIp(request);
    return peerIp ? TRUSTED_PROXIES.has(peerIp) : false;
}

function getClientIp(request: Request): string | null {
    const trustedProxy = isTrustedProxyRequest(request);

    if (trustedProxy) {
        const cfConnectingIp = request.headers.get("cf-connecting-ip");
        if (cfConnectingIp && isPublicIp(cfConnectingIp)) {
            return normalizeIp(cfConnectingIp);
        }

        const trueClientIp = request.headers.get("true-client-ip");
        if (trueClientIp && isPublicIp(trueClientIp)) {
            return normalizeIp(trueClientIp);
        }

        const realIp = request.headers.get("x-real-ip");
        if (realIp && isPublicIp(realIp)) {
            return normalizeIp(realIp);
        }

        const forwardedFor = request.headers.get("x-forwarded-for");

        if (forwardedFor) {
            const ips = forwardedFor
                .split(",")
                .map((ip) => ip.trim())
                .filter(Boolean);

            if (ips.length > 0) {
                const clientIp = firstValidPublicIp(ips);
                if (clientIp) {
                    return clientIp;
                }
            }
        }
    }

    return null;
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
    const identifier = clientIp ?? resolveFallbackIdentifier(request, scope);

    return checkRateLimit(identifier, config, scope);
}

function normalizeHeaderValue(value: string | null): string {
    return value?.trim() ?? "";
}

function hashIdentifier(value: string): string {
    let hash = 5381;

    for (const char of value) {
        const codePoint = char.codePointAt(0) ?? 0;
        hash = hash * 33 + codePoint;
    }

    return Math.abs(hash).toString(36);
}

function readCookieValue(cookieHeader: string | null, name: string): string {
    if (!cookieHeader) {
        return "";
    }

    const prefix = `${name}=`;
    for (const part of cookieHeader.split(";")) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            return trimmed.slice(prefix.length);
        }
    }

    return "";
}

function resolveFallbackIdentifier(request: Request, scope: string): string {
    const authorization = normalizeHeaderValue(
        request.headers.get("authorization"),
    );

    if (authorization.toLowerCase().startsWith("bearer ")) {
        return `bearer:${hashIdentifier(authorization.slice(7))}`;
    }

    const projectId = process.env.APPWRITE_PROJECT_ID?.trim();
    if (projectId) {
        const cookieName = `a_session_${projectId}`;
        const cookieValue = readCookieValue(
            request.headers.get("cookie"),
            cookieName,
        );

        if (cookieValue) {
            return `session:${hashIdentifier(cookieValue)}`;
        }
    }

    const fingerprint = [
        scope,
        normalizeHeaderValue(request.headers.get("user-agent")),
        normalizeHeaderValue(request.headers.get("accept-language")),
        normalizeHeaderValue(request.headers.get("accept-encoding")),
    ].join("|");

    return `fingerprint:${hashIdentifier(fingerprint)}`;
}
