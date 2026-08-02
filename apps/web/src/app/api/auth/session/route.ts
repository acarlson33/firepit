import { NextResponse } from "next/server";
import { Account, Client } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { debugAuth, describeAuthHeader } from "@/lib/auth-server";

/**
 * POST /api/auth/session
 *
 * Creates an Appwrite session the same way the web login flow does:
 * Account.createEmailPasswordSession() via the admin SDK (API key).
 * The returned session secret is what the web app stores in its
 * a_session_<project> cookie, so the server can validate it with
 * client.setSession().
 *
 * Note: we intentionally do NOT use Users.createSession() here. That admin
 * endpoint returns a malformed secret on Appwrite servers < 1.6.x
 * (see appwrite/appwrite#9019), while the email/password session secret
 * is proven to work by the web app's login flow.
 */
export async function POST(request: Request) {
    let email: string | undefined;
    try {
        debugAuth(
            `POST /api/auth/session received: auth="${describeAuthHeader(request.headers.get("Authorization") ?? "")}"`,
        );

        const body = (await request.json()) as {
            email?: string;
            password?: string;
        };
        email = body.email;
        const { password } = body;

        if (!email || !password) {
            debugAuth(
                `POST /api/auth/session rejected: missing email/password`,
            );
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const apiKey = process.env.APPWRITE_API_KEY;

        if (!apiKey) {
            debugAuth(
                `POST /api/auth/session rejected: APPWRITE_API_KEY not configured, endpoint=${env.endpoint}, project=${env.project}`,
            );
            return NextResponse.json(
                { error: "Server API key not configured" },
                { status: 500 },
            );
        }

        const client = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project)
            .setKey(apiKey);

        const account = new Account(client);
        const session = await account.createEmailPasswordSession({
            email,
            password,
        });

        debugAuth(
            `POST /api/auth/session success: email=${email}, userId=${session.userId}, hasSecret=${Boolean(session.secret)}`,
        );

        return NextResponse.json({
            success: true,
            session: session.secret ?? null,
            userId: session.userId,
        });
    } catch (error) {
        const status =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof (error as { code?: unknown }).code === "number"
                ? (error as { code: number }).code
                : 500;

        const message = error instanceof Error ? error.message : String(error);

        debugAuth(
            `POST /api/auth/session failed: email=${email ?? "unknown"}, status=${status}, error=${message}`,
        );

        return NextResponse.json({ error: message }, { status });
    }
}
