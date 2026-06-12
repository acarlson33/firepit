import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * GET /api/session
 *
 * Returns the current Appwrite session so the client can populate
 * localStorage.cookieFallback for realtime WebSocket authentication.
 */
export async function GET() {
    try {
        const { project } = getEnvConfig();
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(`a_session_${project}`);

        if (!sessionCookie?.value) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        return NextResponse.json({
            session: sessionCookie.value,
            project,
        });
    } catch (error) {
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
        const { session, project } = (await request.json()) as {
            session?: string;
            project?: string;
        };

        if (!session || !project) {
            return NextResponse.json(
                { error: "session and project are required" },
                { status: 400 },
            );
        }

        const cookieStore = await cookies();
        cookieStore.set(`a_session_${project}`, session, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to set session cookie" },
            { status: 500 },
        );
    }
}
