import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Protected route patterns
const PROTECTED_ROUTES = ["/chat", "/admin", "/moderation"];
const AUTH_ROUTES = ["/login", "/register"];

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Check if route needs protection
	const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
		pathname.startsWith(route),
	);
	const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

	// Get session cookie
	const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

	if (!projectId) {
		// Missing project config - allow through but log in production monitoring
		return NextResponse.next();
	}

	const cookieStore = await cookies();
	const sessionCookie = cookieStore.get(`a_session_${projectId}`);
	const hasSession = Boolean(sessionCookie?.value);

	// Redirect logic
	if (isProtectedRoute && !hasSession) {
		// User trying to access protected route without session
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
		 * - favicon.ico, etc (static assets)
		 * - api routes (handle auth separately if needed)
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
	],
};
