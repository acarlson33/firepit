import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/rate-limit";

const PUBLIC_FILE_PATTERN = /\.[a-z0-9]+$/i;

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
    "/",
    "/login",
    "/register",
    "/docs",
    "/manifest.json",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/robots.txt",
    "/sw.js",
];

const PUBLIC_ROUTE_PREFIXES = ["/docs/"];

const CORS_MAX_AGE = 60 * 60 * 24; // 24 hours

function getCorsOrigins(): string[] {
    const configured = process.env.FIREPIT_CORS_ORIGINS?.trim();
    if (!configured || configured === "*") {
        return ["*"];
    }
    return configured.split(",").map((o) => o.trim());
}

function isValidOrigin(
    origin: string | null,
    allowedOrigins: string[],
): boolean {
    if (!origin) {
        return false;
    }
    if (allowedOrigins.includes("*")) {
        return true;
    }
    return allowedOrigins.includes(origin);
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Handle API routes: rate limiting and CORS
    if (pathname.startsWith("/api")) {
        const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";
        let rateLimitHeaders: Headers | undefined;
        if (rateLimitEnabled) {
            const rateLimitResult = rateLimitRequest(request, pathname);

            if (!rateLimitResult.allowed) {
                const response = NextResponse.json(
                    {
                        error: "RATE_LIMIT_EXCEEDED",
                        message: "Too many requests. Please try again later.",
                        retryAfter: rateLimitResult.retryAfter,
                    },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": String(
                                rateLimitResult.retryAfter ??
                                    Math.ceil(
                                        (rateLimitResult.resetAt - Date.now()) /
                                            1000,
                                    ),
                            ),
                            "X-RateLimit-Remaining": "0",
                            "X-RateLimit-Reset": String(
                                rateLimitResult.resetAt,
                            ),
                        },
                    },
                );

                return response;
            }

            rateLimitHeaders = new Headers({
                "X-RateLimit-Remaining": String(rateLimitResult.remaining),
                "X-RateLimit-Reset": String(rateLimitResult.resetAt),
            });
        }

        const origin = request.headers.get("origin");
        const allowedOrigins = getCorsOrigins();
        let responseOrigin: string;
        if (isValidOrigin(origin, allowedOrigins)) {
            responseOrigin = origin ?? "";
        } else if (allowedOrigins.includes("*")) {
            responseOrigin = "*";
        } else {
            responseOrigin = allowedOrigins[0] ?? "";
        }

        const corsHeaders = new Headers();

        if (responseOrigin) {
            corsHeaders.set("Access-Control-Allow-Origin", responseOrigin);
            corsHeaders.set("Vary", "Origin");
        }

        corsHeaders.set(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        );
        corsHeaders.set(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Request-ID",
        );
        if (responseOrigin !== "*") {
            corsHeaders.set("Access-Control-Allow-Credentials", "true");
        }
        corsHeaders.set("Access-Control-Max-Age", String(CORS_MAX_AGE));

        if (request.method === "OPTIONS") {
            return new NextResponse(null, {
                status: 204,
                headers: corsHeaders,
            });
        }

        const requestId =
            request.headers.get("X-Request-ID") || crypto.randomUUID();
        corsHeaders.set("X-Request-ID", requestId);

        const response = NextResponse.next({
            request: {
                headers: new Headers(request.headers),
            },
        });

        for (const [key, value] of corsHeaders) {
            response.headers.set(key, value);
        }

        if (rateLimitHeaders) {
            for (const [key, value] of rateLimitHeaders) {
                response.headers.set(key, value);
            }
        }

        return response;
    }

    // Non-API routes: handle authentication
    const isPublicFile = PUBLIC_FILE_PATTERN.test(pathname);

    // Check if route is public (doesn't need authentication)
    const isPublicRoute =
        isPublicFile ||
        PUBLIC_ROUTES.some((route) => pathname === route) ||
        PUBLIC_ROUTE_PREFIXES.some((routePrefix) =>
            pathname.startsWith(routePrefix),
        );
    const isAuthRoute = pathname === "/login" || pathname === "/register";

    // Get session cookie
    const projectId = process.env.APPWRITE_PROJECT_ID;

    if (!projectId) {
        // Missing project config - allow through but log in production monitoring
        return NextResponse.next();
    }

    const sessionCookie = request.cookies.get(`a_session_${projectId}`);
    const hasSession = Boolean(sessionCookie?.value);

    // Redirect logic
    if (!isPublicRoute && !hasSession) {
        // User trying to access protected route without session
        // All routes except public ones require authentication
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    if (isAuthRoute && hasSession) {
        // Logged-in user trying to access auth pages
        const redirect = request.nextUrl.searchParams.get("redirect");
        const destination = redirect?.startsWith("/") ? redirect : "/";
        return NextResponse.redirect(new URL(destination, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - well-known static assets in the public directory
         * - api routes are explicitly included via /api/:path* and handled here
         */
        "/((?!api/|_next/static|_next/image|.*\\.[a-z0-9]+$).*)",
        "/api/:path*",
    ],
};
