"use server";

import { createHmac } from "node:crypto";
import { Account, Client, ID, Query, Users } from "node-appwrite";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { assignDefaultRoleServer } from "@/lib/default-role";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import { logger } from "@/lib/newrelic-utils";

type AuthActionResult =
    | { success: true; userId: string }
    | {
          success: false;
          error: string;
          message?: string;
          verificationRequired?: boolean;
      };

type ResendVerificationResult =
    | {
          success: true;
          alreadyVerified?: boolean;
          message: string;
      }
    | {
          success: false;
          error: string;
      };

function getVerificationRedirectUrl(): string {
    const configuredBaseUrl =
        process.env.SERVER_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        "http://localhost:3000";

    const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");
    return `${normalizedBaseUrl}/api/auth/verify-email`;
}

async function isEmailVerificationEnabled(): Promise<boolean> {
    try {
        return await getFeatureFlag(FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION);
    } catch {
        return false;
    }
}

async function sendVerificationEmailForSession(params: {
    endpoint: string;
    project: string;
    sessionSecret?: string;
}): Promise<void> {
    const { endpoint, project, sessionSecret } = params;

    if (!sessionSecret) {
        throw new Error(
            "Cannot send verification email because session secret is missing.",
        );
    }

    const verificationClient = new Client()
        .setEndpoint(endpoint)
        .setProject(project)
        .setSession(sessionSecret);
    const verificationAccount = new Account(verificationClient);

    await verificationAccount.createVerification({
        url: getVerificationRedirectUrl(),
    });
}

function isSystemSenderAccount(userId: string): boolean {
    const systemSenderUserId = process.env.SYSTEM_SENDER_USER_ID?.trim();
    return Boolean(systemSenderUserId && userId === systemSenderUserId);
}

async function revokeSessionBestEffort(
    users: Users,
    userId: string,
    sessionId: string,
): Promise<void> {
    try {
        await users.deleteSession({ userId, sessionId });
    } catch (err) {
        logger.warn("Failed to revoke session for user", {
            hasUserId: userId.length > 0,
            hasSessionId: sessionId.length > 0,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

function generateUserIdHash(userId: string): string {
    const salt =
        process.env.AUTH_LOG_HASH_SALT?.trim() ||
        process.env.APPWRITE_API_KEY?.trim() ||
        "firepit-auth-log-salt";

    return createHmac("sha256", salt).update(userId).digest("hex").slice(0, 16);
}

function buildVerificationRequiredResult(options?: {
    verificationLinkSent?: boolean;
}): AuthActionResult {
    const verificationLinkSent = options?.verificationLinkSent === true;

    return {
        success: false,
        error: "Please verify your email before signing in.",
        message: verificationLinkSent
            ? "Please verify your email before signing in. We sent a verification link."
            : "Please verify your email before signing in. Request a new verification link and try again.",
        verificationRequired: true,
    };
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b\+?\d[\d\s().-]{7,}\d\b/g;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const IDENTIFIER_LABEL_PATTERN = /\b(userId|user_id|accountId|profileId|sessionId|documentId|channelId|serverId|conversationId|messageId|email|phone|phoneNumber)\s*[:=]\s*(['"]?)([^,;\s"')]+)\2/gi;

function redactAuthErrorText(value: string): string {
    const redactedEmails = value.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
    const redactedPhones = redactedEmails.replace(PHONE_PATTERN, "[REDACTED_PHONE]");
    const redactedIds = redactedPhones.replace(UUID_PATTERN, "[REDACTED_ID]");

    return redactedIds.replace(
        IDENTIFIER_LABEL_PATTERN,
        (_match, label) => `${label}=[REDACTED_IDENTIFIER]`,
    );
}

function sanitizeAuthError(
    error: unknown,
): string | { message: string; name?: string; stack?: string } {
    if (error instanceof Error) {
        return {
            message: redactAuthErrorText(error.message),
            name: error.name,
            stack: error.stack
                ? redactAuthErrorText(error.stack.slice(0, 2_000))
                : undefined,
        };
    }

    if (typeof error === "string") {
        return redactAuthErrorText(error);
    }

    return "[non-serializable error]";
}

/**
 * Automatically joins a user to a server at signup time.
 * Priority:
 * 1) Server with defaultOnSignup=true
 * 2) Single-server instance fallback
 */
async function autoJoinServerOnSignup(userId: string): Promise<void> {
    const env = getEnvConfig();
    const membershipCollectionId = env.collections.memberships;

    // Only auto-join if memberships are enabled
    if (!membershipCollectionId) {
        return;
    }

    try {
        const { databases } = getServerClient();

        async function getSingleServerIdFallback(): Promise<string | null> {
            // Fallback: auto-join if there's exactly one server on the instance.
            const serversResponse = await databases.listDocuments(
                env.databaseId,
                env.collections.servers,
                [Query.limit(2)],
            );

            if (serversResponse.documents.length !== 1) {
                return null;
            }

            return serversResponse.documents[0].$id;
        }

        // Prefer explicitly configured signup default server.
        const defaultServersResponse = await databases.listDocuments(
            env.databaseId,
            env.collections.servers,
            [
                Query.equal("defaultOnSignup", true),
                Query.orderAsc("$createdAt"),
                Query.limit(1),
            ],
        );
        const defaultServerId = defaultServersResponse.documents[0]?.$id;
        const resolvedServerId =
            defaultServerId || (await getSingleServerIdFallback());
        if (!resolvedServerId) {
            return;
        }

        // Check if user is already a member
        const existingMembership = await databases.listDocuments(
            env.databaseId,
            membershipCollectionId,
            [
                Query.equal("userId", userId),
                Query.equal("serverId", resolvedServerId),
                Query.limit(1),
            ],
        );

        if (existingMembership.documents.length > 0) {
            return; // Already a member
        }

        // Create membership
        const membershipPerms = perms.serverOwner(userId);
        await databases.createDocument(
            env.databaseId,
            membershipCollectionId,
            ID.unique(),
            {
                serverId: resolvedServerId,
                userId,
                role: "member",
            },
            membershipPerms,
        );

        try {
            await assignDefaultRoleServer(resolvedServerId, userId);
        } catch {
            // Non-critical: default role assignment is best-effort
        }
    } catch {
        // Silently fail - non-critical feature
    }
}

/**
 * Server-side login action that manually manages session cookies.
 * This is a workaround for cross-origin cookie issues between localhost
 * and Appwrite Cloud (nyc.cloud.appwrite.io).
 *
 * WHY: Browsers block cookies from Appwrite Cloud when accessing from localhost
 * due to SameSite/cross-origin policies. By creating the session server-side
 * and manually setting the cookie, we bypass this limitation.
 *
 * SECURITY: Uses FormData to prevent credentials from being exposed in network logs.
 * FormData is the recommended approach for server actions with sensitive data.
 */
export async function loginAction(
    formData: FormData,
): Promise<AuthActionResult> {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
        return { success: false, error: "Email and password are required" };
    }
    const { endpoint, project } = getEnvConfig();
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !project) {
        return { success: false, error: "Appwrite configuration missing" };
    }

    if (!apiKey) {
        return {
            success: false,
            error: "Server API key missing - required for SSR authentication",
        };
    }

    try {
        // IMPORTANT: Must use admin client with API key for SSR authentication
        // This is required to get session.secret in the response
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(project)
            .setKey(apiKey); // Admin client with API key

        const account = new Account(client);
        const users = new Users(client);

        // Create email/password session on Appwrite server
        const session = await account.createEmailPasswordSession({
            email,
            password,
        });
        let shouldRevokeTemporarySession = true;
        try {
            if (isSystemSenderAccount(session.userId)) {
                // Defense in depth: invalidate this session immediately and never issue app cookie.
                await revokeSessionBestEffort(
                    users,
                    session.userId,
                    session.$id,
                );
                shouldRevokeTemporarySession = false;

                return {
                    success: false,
                    error: "This account is reserved for system announcements and cannot sign in.",
                };
            }

            if (await isEmailVerificationEnabled()) {
                const accountUser = await users.get(session.userId);
                const emailVerified = Boolean(accountUser.emailVerification);

                if (!emailVerified) {
                    let verificationLinkSent = false;
                    try {
                        await sendVerificationEmailForSession({
                            endpoint,
                            project,
                            sessionSecret: session.secret,
                        });
                        verificationLinkSent = true;
                    } catch (verificationError) {
                        logger.error("Failed to send verification email during login", {
                            userIdHash: generateUserIdHash(session.userId),
                            error: sanitizeAuthError(verificationError),
                        });
                    }

                    await revokeSessionBestEffort(
                        users,
                        session.userId,
                        session.$id,
                    );
                    shouldRevokeTemporarySession = false;

                    return buildVerificationRequiredResult({ verificationLinkSent });
                }
            }

            // CRITICAL: Use session.secret as cookie value (only available with admin client)
            // This is documented in Appwrite SSR docs
            const sessionSecret = session.secret;

            if (!sessionSecret) {
                return {
                    success: false,
                    error: "Session created but no secret returned - check API key",
                };
            }

            // Manually set the session cookie in Next.js
            const cookieStore = await cookies();
            cookieStore.set(`a_session_${project}`, sessionSecret, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 365, // 1 year (matches Appwrite default)
                path: "/",
            });

            shouldRevokeTemporarySession = false;
            return { success: true, userId: session.userId };
        } finally {
            if (shouldRevokeTemporarySession) {
                await revokeSessionBestEffort(
                    users,
                    session.userId,
                    session.$id,
                );
            }
        }
    } catch (error) {
        // Provide helpful error messages for common issues
        // Enhanced error handling to prevent "unexpected response" errors
        if (error instanceof Error) {
            const message = error.message.toLowerCase();

            // API key permission issues
            if (message.includes("scope") || message.includes("permission")) {
                return {
                    success: false,
                    error: "API key missing required permissions. Check API_KEY_SETUP.md for instructions.",
                };
            }

            // Invalid credentials
            if (
                message.includes("invalid credentials") ||
                message.includes("wrong password")
            ) {
                return {
                    success: false,
                    error: "Invalid email or password",
                };
            }

            // User not found
            if (message.includes("user") && message.includes("not found")) {
                return {
                    success: false,
                    error: "Account not found. Please create an account first.",
                };
            }

            // Rate limiting
            if (
                message.includes("rate limit") ||
                message.includes("too many")
            ) {
                return {
                    success: false,
                    error: "Too many login attempts. Please try again later.",
                };
            }

            // Network errors
            if (message.includes("network") || message.includes("fetch")) {
                return {
                    success: false,
                    error: "Network error. Please check your connection and try again.",
                };
            }

            logger.error("Login action failed", {
                error: sanitizeAuthError(error),
            });

            return {
                success: false,
                error: "An unexpected error occurred. Please try again.",
            };
        }

        // Handle non-Error objects
        logger.error("Login action failed", {
            error: sanitizeAuthError(error),
        });
        return {
            success: false,
            error: "Login failed. Please try again.",
        };
    }
}

export async function resendVerificationAction(
    formData: FormData,
): Promise<ResendVerificationResult> {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
        return { success: false, error: "Email and password are required" };
    }

    const { endpoint, project } = getEnvConfig();
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !project) {
        return { success: false, error: "Appwrite configuration missing" };
    }

    if (!apiKey) {
        return {
            success: false,
            error: "Server API key missing - required for verification resend",
        };
    }

    if (!(await isEmailVerificationEnabled())) {
        return {
            success: false,
            error: "Email verification is not enabled on this instance.",
        };
    }

    try {
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(project)
            .setKey(apiKey);
        const account = new Account(client);

        const session = await account.createEmailPasswordSession({
            email,
            password,
        });
        const users = new Users(client);
        let shouldRevokeTemporarySession = true;
        try {
            if (isSystemSenderAccount(session.userId)) {
                await revokeSessionBestEffort(
                    users,
                    session.userId,
                    session.$id,
                );
                shouldRevokeTemporarySession = false;

                return {
                    success: false,
                    error: "This account is reserved for system announcements and cannot sign in.",
                };
            }

            const accountUser = await users.get(session.userId);
            const emailVerified = Boolean(accountUser.emailVerification);

            if (emailVerified) {
                await revokeSessionBestEffort(
                    users,
                    session.userId,
                    session.$id,
                );
                shouldRevokeTemporarySession = false;

                return {
                    success: true,
                    alreadyVerified: true,
                    message: "This email is already verified. You can sign in now.",
                };
            }

            // Send a fresh verification link using this temporary session, then revoke it.
            await sendVerificationEmailForSession({
                endpoint,
                project,
                sessionSecret: session.secret,
            });

            return {
                success: true,
                message: "Verification email sent. Check your inbox.",
            };
        } finally {
            if (shouldRevokeTemporarySession) {
                // Best-effort cleanup: do not keep the temporary session active.
                await revokeSessionBestEffort(
                    users,
                    session.userId,
                    session.$id,
                );
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (
                message.includes("invalid credentials") ||
                message.includes("wrong password")
            ) {
                return {
                    success: false,
                    error: "Invalid email or password",
                };
            }

            if (message.includes("rate limit") || message.includes("too many")) {
                return {
                    success: false,
                    error: "Too many attempts. Please try again later.",
                };
            }

            logger.error("Resend verification failed", {
                error: sanitizeAuthError(error),
            });

            return {
                success: false,
                error: "An unexpected error occurred. Please try again.",
            };
        }

        logger.error("Resend verification failed", {
            error: sanitizeAuthError(error),
        });

        return {
            success: false,
            error: "Failed to resend verification email.",
        };
    }
}

/**
 * Server-side registration + login action.
 * Automatically joins the user to a default server when configured.
 *
 * SECURITY: Uses FormData to prevent credentials from being exposed in network logs.
 * FormData is the recommended approach for server actions with sensitive data.
 */
export async function registerAction(
    formData: FormData,
): Promise<AuthActionResult> {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;

    if (!email || !password) {
        return { success: false, error: "Email and password are required" };
    }
    const { endpoint, project } = getEnvConfig();

    if (!endpoint || !project) {
        return { success: false, error: "Appwrite configuration missing" };
    }

    try {
        // Create account
        const client = new Client().setEndpoint(endpoint).setProject(project);
        const account = new Account(client);

        const userId = crypto.randomUUID();
        await account.create({
            userId,
            email,
            password,
            name,
        });

        // Immediately log in to create session
        const loginFormData = new FormData();
        loginFormData.set("email", email);
        loginFormData.set("password", password);
        const loginResult = await loginAction(loginFormData);

        // If login succeeded and memberships are enabled, auto-join default server.
        if (loginResult.success) {
            try {
                await autoJoinServerOnSignup(userId);
            } catch {
                // Non-critical: auto-join failed, user can manually join later
            }
        }

        return loginResult;
    } catch (error) {
        // Enhanced error handling for registration
        if (error instanceof Error) {
            const message = error.message.toLowerCase();

            // User already exists
            if (
                message.includes("user") &&
                (message.includes("exists") || message.includes("already"))
            ) {
                return {
                    success: false,
                    error: "An account with this email already exists. Please login instead.",
                };
            }

            // Invalid email format
            if (message.includes("email") && message.includes("invalid")) {
                return {
                    success: false,
                    error: "Invalid email address format.",
                };
            }

            // Password requirements
            if (
                message.includes("password") &&
                (message.includes("short") || message.includes("weak"))
            ) {
                return {
                    success: false,
                    error: "Password must be at least 8 characters long.",
                };
            }

            logger.error("Registration action failed", {
                error: sanitizeAuthError(error),
            });

            return {
                success: false,
                error: "An unexpected error occurred. Please try again.",
            };
        }

        logger.error("Registration action failed", {
            error: sanitizeAuthError(error),
        });

        return {
            success: false,
            error: "Registration failed. Please try again.",
        };
    }
}

/**
 * Server-side logout action that clears the session cookie.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
    const { project, endpoint } = getEnvConfig();

    if (!project) {
        return { success: false };
    }

    try {
        // Delete the session from Appwrite (best effort)
        if (endpoint) {
            const cookieStore = await cookies();
            const sessionCookie = cookieStore.get(`a_session_${project}`);

            if (sessionCookie) {
                const client = new Client()
                    .setEndpoint(endpoint)
                    .setProject(project)
                    .setSession(sessionCookie.value);
                const account = new Account(client);
                await account
                    .deleteSession({ sessionId: "current" })
                    .catch(() => {
                        // Ignore errors - cookie will be deleted anyway
                    });
            }
        }

        // Clear the cookie regardless
        const cookieStore = await cookies();
        cookieStore.delete(`a_session_${project}`);

        return { success: true };
    } catch {
        return { success: false };
    }
}
