import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Account, Client } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

function isSameOrigin(request: Request, originHeader: string): boolean {
    try {
        return new URL(request.url).origin === originHeader;
    } catch {
        return false;
    }
}

function ensureAllowedRequestOrigin(request: Request): string | null {
    const origin = request.headers.get("origin");
    if (!origin) {
        return null;
    }

    if (isSameOrigin(request, origin)) {
        return null;
    }

    return ALLOWED_ORIGINS.includes(origin) ? null : origin;
}

/**
 * GET /api/session
 *
 * Returns a short-lived JWT minted from the httpOnly session cookie, so the
 * client can authenticate the realtime WebSocket without ever receiving the
 * raw session secret.
 */
export async function GET() {
    try {
        const env = getEnvConfig();
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(`a_session_${env.project}`);

        if (!sessionCookie?.value) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        const client = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project)
            .setSession(sessionCookie.value);

        const jwt = await new Account(client).createJWT();

        return NextResponse.json({
            jwt: jwt.jwt,
            project: env.project,
        });
    } catch (error) {
        logger.error("Failed to create realtime JWT", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to get session" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/session
 *
 * Sets the httpOnly session cookie from the browser SDK's session secret.
 * This is called after the browser SDK creates a session (with full user scopes)
 * so the server can set the httpOnly cookie for SSR compatibility.
 */
export async function POST(request: Request) {
    try {
        const env = getEnvConfig();

        const disallowedOrigin = ensureAllowedRequestOrigin(request);
        if (disallowedOrigin) {
            return NextResponse.json(
                { error: "Origin is not allowed" },
                { status: 403 },
            );
        }

        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 },
            );
        }

        if (typeof parsed !== "object" || parsed === null) {
            return NextResponse.json(
                { error: "session and project are required" },
                { status: 400 },
            );
        }

        const { session, project } = parsed as {
            session?: unknown;
            project?: unknown;
        };

        if (typeof session !== "string" || typeof project !== "string") {
            return NextResponse.json(
                { error: "session and project are required" },
                { status: 400 },
            );
        }

        if (project !== env.project) {
            return NextResponse.json(
                { error: "Invalid project" },
                { status: 400 },
            );
        }

        // Verify the secret is a real Appwrite session before persisting it.
        try {
            const verifyClient = new Client()
                .setEndpoint(env.endpoint)
                .setProject(env.project)
                .setSession(session);
            await new Account(verifyClient).get();
        } catch {
            return NextResponse.json(
                { error: "Invalid session" },
                { status: 401 },
            );
        }

        const cookieStore = await cookies();
        cookieStore.set(`a_session_${env.project}`, session, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to set session cookie", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to set session cookie" },
            { status: 500 },
        );
    }
}
