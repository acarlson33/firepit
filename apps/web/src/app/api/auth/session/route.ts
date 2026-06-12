import { NextResponse } from "next/server";
import { Client, Users } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * POST /api/auth/session
 *
 * Creates an Appwrite session with full user scopes.
 *
 * First validates the email/password by creating a session via the public
 * Account API endpoint (no API key), then creates a user-scoped session via
 * Users.createSession() with the admin API key. The admin-created session
 * is associated with the user's role (not guest), so it has full scopes
 * including presences.write.
 */
export async function POST(request: Request) {
    try {
        const { email, password } = (await request.json()) as {
            email?: string;
            password?: string;
        };

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const apiKey = process.env.APPWRITE_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: "Server API key not configured" },
                { status: 500 },
            );
        }

        // Step 1: Validate credentials via the public Account API.
        // This confirms the email/password are correct and gives us the userId.
        const authResponse = await fetch(
            `${env.endpoint}/account/sessions/email`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Appwrite-Project": env.project,
                },
                body: JSON.stringify({ email, password }),
            },
        );

        if (!authResponse.ok) {
            const errorData = await authResponse.json().catch(() => ({}));
            return NextResponse.json(
                {
                    error:
                        (errorData as { message?: string }).message ??
                        "Authentication failed",
                },
                { status: authResponse.status },
            );
        }

        const authData = (await authResponse.json()) as {
            userId?: string;
        };

        if (!authData.userId) {
            return NextResponse.json(
                { error: "Failed to authenticate user" },
                { status: 401 },
            );
        }

        // Step 2: Create a user-scoped session using the admin SDK.
        // This session is owned by the user (not guest), so it has full scopes.
        const adminClient = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project)
            .setKey(apiKey);

        const users = new Users(adminClient);
        const userSession = await users.createSession(authData.userId);

        // The Session object from admin SDK includes the secret field
        // because the request was made with an API key.
        const sessionSecret = (userSession as unknown as { secret: string }).secret;

        return NextResponse.json({
            success: true,
            session: sessionSecret ?? null,
            userId: authData.userId,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to create session",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
