import { NextResponse } from "next/server";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * POST /api/auth/session
 *
 * Creates an Appwrite session by validating the email/password via the
 * public Account API. The returned session secret is the same type of
 * token the web app uses (the one stored in the a_session_<project>
 * cookie), so it can be validated server-side with client.setSession().
 *
 * Note: we intentionally do NOT use Users.createSession() here. That admin
 * endpoint returns a malformed secret on Appwrite servers < 1.6.x
 * (see appwrite/appwrite#9019), and the public session secret is proven
 * to work by the web app's login flow.
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

        // Validate credentials via the public Account API. This confirms the
        // email/password are correct and gives us the session secret.
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
            secret?: string;
        };

        if (!authData.userId) {
            return NextResponse.json(
                { error: "Failed to authenticate user" },
                { status: 401 },
            );
        }

        return NextResponse.json({
            success: true,
            session: authData.secret ?? null,
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
