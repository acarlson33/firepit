import { Account, Client } from "node-appwrite";
import { cookies, headers } from "next/headers";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getUserRoles } from "./appwrite-roles";

type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

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
        const authHeader = headerStore.get("Authorization");

        const [scheme, token] = authHeader?.trim().split(/\s+/, 2) ?? [];
        if (scheme?.toLowerCase() !== "bearer" || !token) {
            return null;
        }

        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(project)
            .setSession(token);

        const account = new Account(client);
        const user = await account.get().catch(() => null);

        return validateAndTransformUser(user, systemSenderUserId);
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

        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(project)
            .setSession(sessionCookie.value);

        const account = new Account(client);
        const user = await account.get().catch(() => null);

        return validateAndTransformUser(user, systemSenderUserId);
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
