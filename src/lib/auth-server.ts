import { Account, Client } from "node-appwrite";
import { cookies } from "next/headers";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getUserRoles } from "./appwrite-roles";

export type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

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

/**
 * Server-side auth helper for RSC and server actions.
 * Returns null if no valid session exists.
 * @returns {Promise<{ $id: string; name: string; email: string; $createdAt?: string; } | null>} The return value.
 */
export async function getServerSession() {
    const env = getEnvConfig();
    const endpoint = env.endpoint;
    const project = env.project;
    const systemSenderUserId = process.env.SYSTEM_SENDER_USER_ID?.trim() || null;

    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(`a_session_${project}`);

        if (!sessionCookie?.value) {
            return null;
        }

        // Set the session on the client so Appwrite knows which user to retrieve
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(project)
            .setSession(sessionCookie.value);

        const account = new Account(client);
        const user = await account.get().catch(() => null);

        if (
            !user ||
            typeof user !== "object" ||
            !("$id" in user) ||
            typeof user.$id !== "string" ||
            typeof user.name !== "string" ||
            typeof user.email !== "string"
        ) {
            return null;
        }

        if (systemSenderUserId && user.$id === systemSenderUserId) {
            return null;
        }

        return {
            $id: user.$id,
            name: user.name,
            email: user.email,
            $createdAt:
                "$createdAt" in user && typeof user.$createdAt === "string"
                    ? user.$createdAt
                    : undefined,
        };
    } catch {
        return null;
    }
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
