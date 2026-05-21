import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Account, Client } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * GET /api/debug-cookies
 * Debug endpoint to inspect cookies and session validation
 * Only available in development mode
 */
export async function GET() {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
            { error: "Debug endpoints not available in production" },
            { status: 404 },
        );
    }

    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const env = getEnvConfig();
    const projectId = env.project;
    const endpoint = env.endpoint;
    const expectedCookieName = `a_session_${projectId}`;
    const sessionCookie = cookieStore.get(expectedCookieName);

    // Try to validate the session with Appwrite
    let validationResult = null;
    if (sessionCookie?.value && endpoint && projectId) {
        try {
            const client = new Client()
                .setEndpoint(endpoint)
                .setProject(projectId)
                .setSession(sessionCookie.value);
            const account = new Account(client);
            const user = await account.get();
            validationResult = {
                success: true,
                userId: user.$id,
                email: user.email,
                name: user.name,
            };
        } catch (error) {
            validationResult = {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    return NextResponse.json({
        projectId,
        endpoint,
        expectedCookieName,
        sessionCookieExists: Boolean(sessionCookie),
        sessionCookieValue: sessionCookie?.value
            ? `${sessionCookie.value.substring(0, 20)}...`
            : null,
        sessionCookieValueFull: sessionCookie?.value || null,
        allCookieNames: allCookies.map((c) => c.name),
        totalCookies: allCookies.length,
        validation: validationResult,
        diagnosis: !sessionCookie
            ? "❌ Session cookie NOT found - Appwrite cookies not being set by browser"
            : validationResult?.success
              ? "✅ Session cookie found AND validates with Appwrite - Auth should work"
              : `⚠️ Session cookie found but FAILS validation: ${validationResult?.error}`,
    });
}
