import { Account, Client } from "node-appwrite";
import { cacheLife } from "next/cache";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getUserRoles } from "./appwrite-roles";

type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

/**
 * Debug-only auth logging, gated by FIREPIT_DEBUG_AUTH=true.
 * Masks tokens; never logs passwords.
 */
export function debugAuth(...args: unknown[]): void {
    if (process.env.FIREPIT_DEBUG_AUTH === "true") {
        // eslint-disable-next-line no-console
        console.log("[auth-debug]", ...args);
    }
}

function maskToken(token: string): string {
    return token.length > 8
        ? `${token.slice(0, 4)}...${token.slice(-4)}`
        : token;
}

// Debug-only: describe an Authorization header. Basic credentials are decoded
// so the origin of the header (app vs. external proxy/basic-auth) can be
// identified from the username; both username and password are masked.
export function describeAuthHeader(authHeader: string): string {
    if (!authHeader) return "(missing)";
    const match = authHeader.trim().match(/^Basic\s+([A-Za-z0-9+/=]+)/i);
    if (match) {
        try {
            const decoded = Buffer.from(match[1], "base64").toString("utf8");
            const colon = decoded.indexOf(":");
            const username =
                colon >= 0 ? decoded.slice(0, colon) : decoded;
            return `Basic user="${maskToken(username)}", password="(redacted)"`;
        } catch {
            // fall through to masked raw value
        }
    }
    return maskToken(authHeader);
}

const SESSION_CACHE_TTL_MS = 30_000;
const sessionCache = new Map<string, { data: SessionUser | null; ts: number }>();

function cacheKey(
    endpoint: string,
    project: string,
    token: string,
    authMode: "jwt" | "session",
): string {
    return createHash("sha256")
        .update(`${endpoint}:${project}:${authMode}:${token}`)
        .digest("hex")
        .slice(0, 32);
}

function getCachedSession(key: string): SessionUser | null | undefined {
    const entry = sessionCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > SESSION_CACHE_TTL_MS) {
        sessionCache.delete(key);
        return undefined;
    }
    return entry.data;
}

function setCachedSession(key: string, data: SessionUser | null): void {
    sessionCache.set(key, { data, ts: Date.now() });
    // LRU-ish: cap at 500 entries
    if (sessionCache.size > 500) {
        const oldest = sessionCache.keys().next().value;
        if (oldest) sessionCache.delete(oldest);
    }
}

// Prefer any Bearer token across (possibly comma-joined) header values,
// e.g. "Basic <creds>, Bearer <token>". A single bare value is treated
// as a legacy raw session secret. Other schemes (Basic, Digest, ...)
// are never mistaken for a token.
function extractBearerToken(authHeader: string): string | undefined {
    const values = authHeader.split(",").map((v) => v.trim());
    for (const value of values) {
        const parts = value.split(/\s+/, 2);
        if (parts[0].toLowerCase() === "bearer" && parts[1]) {
            return parts[1];
        }
    }
    if (values.length === 1 && !/\s/.test(values[0])) {
        return values[0];
    }
    return undefined;
}

// Drop both jwt and session cache entries for a token on logout.
export function invalidateSessionCacheForToken(
    endpoint: string,
    project: string,
    token: string,
): void {
    sessionCache.delete(cacheKey(endpoint, project, token, "jwt"));
    sessionCache.delete(cacheKey(endpoint, project, token, "session"));
}

export class AuthError extends Error {
    readonly code: AuthErrorCode;

    constructor(code: AuthErrorCode, message?: string) {
        super(
            message ?? (code === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden"),
        );
        this.name = "AuthError";
        this.code = code;
    }
}

export type SessionUser = {
    $id: string;
    name: string;
    email: string;
    $createdAt?: string;
};

async function getSessionForToken(
    endpoint: string,
    project: string,
    token: string,
    systemSenderUserId: string | null,
    authMode: "jwt" | "session",
): Promise<SessionUser | null> {
    const key = cacheKey(endpoint, project, token, authMode);
    const cached = getCachedSession(key);
    if (cached !== undefined) return cached;

    try {
        const client = new Client().setEndpoint(endpoint).setProject(project);

        if (authMode === "jwt") {
            client.setJWT(token);
        } else {
            client.setSession(token);
        }

        const account = new Account(client);
        const user = await account.get();

        const result = validateAndTransformUser(user, systemSenderUserId);
        setCachedSession(key, result);
        return result;
    } catch (error) {
        debugAuth(
            `${authMode} auth failed: token="${maskToken(token)}", endpoint=${endpoint}, project=${project}, error=${error instanceof Error ? error.message : String(error)}`,
        );
        setCachedSession(key, null);
        return null;
    }
}

async function getSessionForAnyToken(
    endpoint: string,
    project: string,
    token: string,
    systemSenderUserId: string | null,
): Promise<SessionUser | null> {
    const candidateModes: Array<"jwt" | "session"> = isLikelyJwt(token)
        ? ["jwt", "session"]
        : ["session", "jwt"];

    for (const mode of candidateModes) {
        const session = await getSessionForToken(
            endpoint,
            project,
            token,
            systemSenderUserId,
            mode,
        );
        if (session) {
            return session;
        }
    }

    debugAuth(
        `all token modes rejected: token="${maskToken(token)}", endpoint=${endpoint}, project=${project}`,
    );

    return null;
}

function isLikelyJwt(token: string) {
    const segments = token.split(".");
    return (
        segments.length === 3 && segments.every((segment) => segment.length > 0)
    );
}

function validateAndTransformUser(
    user: unknown,
    systemSenderUserId: string | null,
): SessionUser | null {
    if (!user || typeof user !== "object") {
        return null;
    }

    const candidate = user as Record<string, unknown>;
    if (
        typeof candidate.$id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.email !== "string"
    ) {
        return null;
    }

    if (systemSenderUserId && candidate.$id === systemSenderUserId) {
        return null;
    }

    return {
        $id: candidate.$id,
        name: candidate.name,
        email: candidate.email,
        $createdAt:
            typeof candidate.$createdAt === "string"
                ? candidate.$createdAt
                : undefined,
    };
}

async function getSessionFromHeader(
    endpoint: string,
    project: string,
    systemSenderUserId: string | null,
): Promise<SessionUser | null> {
    try {
        const headerStore = await headers();
        // Header name may be in any case; try both
        const authHeader =
            headerStore.get("Authorization") ??
            headerStore.get("authorization");

        // Appwrite Cloud's edge replaces the client's Authorization header with
        // its own operator credential (Basic opr:<deploy-secret>), so the mobile
        // app sends the session token in x-firepit-token, which the edge passes
        // through untouched. Authorization: Bearer stays as a fallback for local
        // dev and non-Appwrite hosts.
        const firepitTokenHeader =
            headerStore.get("x-firepit-token")?.trim() || null;

        const userAgent = headerStore.get("user-agent") ?? "unknown";
        const requestPath =
            headerStore.get("x-firepit-path") ?? headerStore.get("x-invoke-path") ?? "?";

        let token: string | undefined;
        let tokenSource: string | null = null;
        if (firepitTokenHeader) {
            token = extractBearerToken(firepitTokenHeader);
            tokenSource = "x-firepit-token";
        }
        if (!token && authHeader) {
            token = extractBearerToken(authHeader);
            tokenSource = "authorization";
        }
        if (!token) {
            debugAuth(
                `no bearer token in headers (authorization="${describeAuthHeader(authHeader ?? "")}", x-firepit-token="${firepitTokenHeader ? maskToken(firepitTokenHeader) : "(missing)"}"), path=${requestPath}, ua="${userAgent}", endpoint=${endpoint}, project=${project}`,
            );
            return null;
        }

        const chosen = isLikelyJwt(token) ? "jwt" : "session";

        debugAuth(
            `header token present via ${tokenSource}, chosen=${chosen}, token="${maskToken(token)}", path=${requestPath}, ua="${userAgent}", endpoint=${endpoint}, project=${project}`,
        );

        const session = await getSessionForAnyToken(
            endpoint,
            project,
            token,
            systemSenderUserId,
        );

        debugAuth(
            `header auth result: ${session ? `userId=${session.$id}` : `no session (path=${requestPath}, ua="${userAgent}")`}`,
        );

        return session;
    } catch {
        return null;
    }
}

async function getSessionFromCookie(
    endpoint: string,
    project: string,
    systemSenderUserId: string | null,
): Promise<SessionUser | null> {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(`a_session_${project}`);

        if (!sessionCookie?.value) {
            debugAuth(
                `no session cookie found, project=${project}, cookieName=a_session_${project}`,
            );
            return null;
        }

        debugAuth(
            `cookie token present: ${maskToken(sessionCookie.value)}, project=${project}`,
        );

        const session = await getSessionForToken(
            endpoint,
            project,
            sessionCookie.value,
            systemSenderUserId,
            "session",
        );

        debugAuth(
            `cookie auth result: ${session ? `userId=${session.$id}` : "no session"}`,
        );

        return session;
    } catch {
        return null;
    }
}

/**
 * Server-side auth helper for RSC and server actions.
 * Checks Authorization header first (Bearer token for mobile), then falls back to session cookie.
 * Returns null if no valid session exists.
 * @returns {Promise<SessionUser | null>} The return value.
 */
export async function getServerSession(): Promise<SessionUser | null> {
    "use cache: private";
    cacheLife("minutes");
    const env = getEnvConfig();
    const endpoint = env.endpoint;
    const project = env.project;
    const systemSenderUserId =
        process.env.SYSTEM_SENDER_USER_ID?.trim() || null;

    // Try Authorization header first (supports mobile Bearer tokens)
    const headerSession = await getSessionFromHeader(
        endpoint,
        project,
        systemSenderUserId,
    );
    if (headerSession) {
        debugAuth(`resolved via Authorization header: userId=${headerSession.$id}`);
        return headerSession;
    }

    // Fall back to session cookie (web browser flow)
    const cookieSession = await getSessionFromCookie(endpoint, project, systemSenderUserId);
    if (cookieSession) {
        debugAuth(`resolved via session cookie: userId=${cookieSession.$id}`);
        return cookieSession;
    }

    debugAuth(`no valid session for ${endpoint}/${project}`);
    return null;
}

/**
 * Check if the current user has specific roles.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<RoleInfo>} The return value.
 */
export async function checkUserRoles(userId: string) {
    return getUserRoles(userId);
}

/**
 * Require authentication - throws if no session.
 * @returns {Promise<{ $id: string; name: string; email: string; $createdAt?: string; }>} The return value.
 */
export async function requireAuth() {
    const user = await getServerSession();
    if (!user) {
        throw new AuthError("UNAUTHORIZED");
    }
    return user;
}

/**
 * Require admin role - throws if not admin.
 * @returns {Promise<{ user: { $id: string; name: string; email: string; }; roles: RoleInfo; }>} The return value.
 */
export async function requireAdmin() {
    const user = await requireAuth();
    const roles = await checkUserRoles(user.$id);
    if (!roles.isAdmin) {
        throw new AuthError("FORBIDDEN", "Forbidden: Admin access required");
    }
    return { user, roles };
}

/**
 * Require moderator or admin role - throws if neither.
 * @returns {Promise<{ user: { $id: string; name: string; email: string; }; roles: RoleInfo; }>} The return value.
 */
export async function requireModerator() {
    const user = await requireAuth();
    const roles = await checkUserRoles(user.$id);
    if (!roles.isModerator && !roles.isAdmin) {
        throw new AuthError(
            "FORBIDDEN",
            "Forbidden: Moderator access required",
        );
    }
    return { user, roles };
}
