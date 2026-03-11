import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
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
         * - api routes (handle auth separately if needed)
         */
        "/((?!api/|_next/static|_next/image|.*\\.[a-z0-9]+$).*)",
    ],
};
