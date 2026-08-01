import { Account, Client } from "node-appwrite";
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getUserRoles } from "./appwrite-roles";

type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

const SESSION_CACHE_TTL_MS = 30_000;
const sessionCache = new Map<string, { data: SessionUser | null; ts: number }>();

function cacheKey(endpoint: string, project: string, token: string): string {
    return createHash("sha256").update(`${endpoint}:${project}:${token}`).digest("hex").slice(0, 32);
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
    const key = cacheKey(endpoint, project, token);
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
        if (process.env.FIREPIT_DEBUG_AUTH === "true") {
            const masked =
                token.length > 8
                    ? `${token.slice(0, 4)}...${token.slice(-4)}`
                    : token;
            // eslint-disable-next-line no-console
            console.log(
                `[auth-debug] ${authMode} auth failed: token="${masked}", endpoint=${endpoint}, project=${project}, error=${error instanceof Error ? error.message : String(error)}`,
            );
        }
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

        // Extract token: if header starts with Bearer, use the second part; otherwise use the whole header
        let token: string | undefined;
        if (authHeader) {
            const parts = authHeader.trim().split(/\s+/, 2);
            if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
                token = parts[1];
            } else {
                token = parts[0]; // treat entire header as token when scheme is missing
            }
        }
        if (!token) {
            return null;
        }

        const chosen = isLikelyJwt(token) ? "jwt" : "session";

        if (process.env.FIREPIT_DEBUG_AUTH === "true") {
            const masked =
                token.length > 8
                    ? `${token.slice(0, 4)}...${token.slice(-4)}`
                    : token;
            // eslint-disable-next-line no-console
            console.log(
                `[auth-debug] header token present, chosen=${chosen}, token="${masked}", endpoint=${endpoint}, project=${project}`,
            );
        }

        const session = await getSessionForAnyToken(
            endpoint,
            project,
            token,
            systemSenderUserId,
        );

        if (process.env.FIREPIT_DEBUG_AUTH === "true") {
            // eslint-disable-next-line no-console
            console.log(
                `[auth-debug] header auth result: ${session ? `userId=${session.$id}` : "no session"}`,
            );
        }

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
            return null;
        }

        if (process.env.FIREPIT_DEBUG_AUTH === "true") {
            const val = sessionCookie.value;
            const masked =
                val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : val;
            // eslint-disable-next-line no-console
            console.log(
                `[auth-debug] cookie token present: ${masked}, project=${project}`,
            );
        }

        const session = await getSessionForToken(
            endpoint,
            project,
            sessionCookie.value,
            systemSenderUserId,
            "session",
        );

        if (process.env.FIREPIT_DEBUG_AUTH === "true") {
            // eslint-disable-next-line no-console
            console.log(
                `[auth-debug] cookie auth result: ${session ? `userId=${session.$id}` : "no session"}`,
            );
        }

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
        return headerSession;
    }

    // Fall back to session cookie (web browser flow)
    return getSessionFromCookie(endpoint, project, systemSenderUserId);
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
