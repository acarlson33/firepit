import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Account, Client } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { debugAuth, describeAuthHeader } from "@/lib/auth-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const SESSION_LOGIN_RATE_LIMIT = {
    maxRequests: 5,
    windowMs: 60 * 1000,
};

function hashEmail(email: string | undefined): string {
    if (!email) {
        return "unknown";
    }
    return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

function rateLimitResponse(retryAfter: number | undefined): NextResponse {
    return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfter ?? 60) },
        },
    );
}

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

        // Rate limit per email and per IP before touching Appwrite. These are
        // separate buckets from the proxy-level auth limit, so hitting them
        // here does not double-charge the proxy's per-IP bucket.
        // ponytail: in-memory store, per-runtime only; swap for a distributed
        // store if the app is ever run multi-instance.
        const emailLimit = checkRateLimit(
            `session-login-email:${email.toLowerCase()}`,
            SESSION_LOGIN_RATE_LIMIT,
        );
        if (!emailLimit.allowed) {
            return rateLimitResponse(emailLimit.retryAfter);
        }

        const clientIp = getClientIp(request);
        if (clientIp) {
            const ipLimit = checkRateLimit(
                `session-login-ip:${clientIp}`,
                SESSION_LOGIN_RATE_LIMIT,
            );
            if (!ipLimit.allowed) {
                return rateLimitResponse(ipLimit.retryAfter);
            }
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
            `POST /api/auth/session success: userId=${session.userId}, hasSecret=${Boolean(session.secret)}`,
        );

        return NextResponse.json({
            success: true,
            session: session.secret ?? null,
            userId: session.userId,
        });
    } catch (error) {
        const rawStatus =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof (error as { code?: unknown }).code === "number"
                ? (error as { code: number }).code
                : 500;
        // Appwrite error codes are usually valid HTTP statuses, but clamp to
        // the 200-599 range so a malformed code never crashes the response.
        const status = rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 500;
        const message = error instanceof Error ? error.message : String(error);

        debugAuth(
            `POST /api/auth/session failed: emailHash=${hashEmail(email)}, status=${status}, error=${message}`,
        );

        // Never leak whether the email exists or Appwrite internals; treat
        // every credential failure as a generic invalid-credentials error.
        const failureStatus = status >= 400 && status < 500 ? 401 : 500;
        return NextResponse.json(
            {
                error:
                    failureStatus === 401
                        ? "Invalid email or password"
                        : "Unable to sign in",
            },
            { status: failureStatus },
        );
    }
}
