import { NextResponse } from "next/server";
import { Account, Client } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";

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

        const client = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project)
            .setKey(apiKey);

        const account = new Account(client);
        const session = await account.createEmailPasswordSession({
            email,
            password,
        });

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

        return NextResponse.json(
            {
                error: "Failed to create session",
                details: error instanceof Error ? error.message : String(error),
            },
            { status },
        );
    }
}
