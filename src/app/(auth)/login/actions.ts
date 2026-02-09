"use server";

import { Account, Client, ID, Query } from "node-appwrite";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";

/**
 * Automatically joins a user to the server if there's only one server on the instance.
 * This is a QoL feature for single-server instances.
 */
async function autoJoinSingleServer(userId: string): Promise<void> {
    const env = getEnvConfig();
    const membershipCollectionId = env.collections.memberships;

    // Only auto-join if memberships are enabled
    if (!membershipCollectionId) {
        return;
    }

    try {
        const { databases } = getServerClient();

        // Check how many servers exist
        const serversResponse = await databases.listDocuments(
            env.databaseId,
            env.collections.servers,
            [Query.limit(2)], // Only need to know if there's exactly 1
        );

        // Only auto-join if there's exactly one server
        if (serversResponse.documents.length !== 1) {
            return;
        }

        const serverId = serversResponse.documents[0].$id;

        // Check if user is already a member
        const existingMembership = await databases.listDocuments(
            env.databaseId,
            membershipCollectionId,
            [
                Query.equal("userId", userId),
                Query.equal("serverId", serverId),
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
                serverId,
                userId,
                role: "member",
            },
            membershipPerms,
        );
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
): Promise<
    { success: true; userId: string } | { success: false; error: string }
> {
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

        // Create email/password session on Appwrite server
        const session = await account.createEmailPasswordSession({
            email,
            password,
        });

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

        return { success: true, userId: session.userId };
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

            return {
                success: false,
                error: error.message,
            };
        }

        // Handle non-Error objects
        return {
            success: false,
            error: "Login failed. Please try again.",
        };
    }
}

/**
 * Server-side registration + login action.
 * Automatically joins the user to the server if there's only one.
 *
 * SECURITY: Uses FormData to prevent credentials from being exposed in network logs.
 * FormData is the recommended approach for server actions with sensitive data.
 */
export async function registerAction(
    formData: FormData,
): Promise<
    { success: true; userId: string } | { success: false; error: string }
> {
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

        // If login succeeded and memberships are enabled, auto-join single server
        if (loginResult.success) {
            try {
                await autoJoinSingleServer(userId);
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

            return {
                success: false,
                error: error.message,
            };
        }

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
