/**
 * API Middleware Utilities
 * Provides reusable authentication, authorization, and rate limiting helpers
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { UnauthorizedError, ForbiddenError } from "@/lib/appwrite-core";
import { logger } from "@/lib/posthog-utils";

/**
 * Session type returned by authentication
 */
export type SessionContext = {
	userId: string;
	email?: string;
	name?: string;
	$id?: string;
};

/**
 * Require authentication - throws UnauthorizedError if not authenticated
 */
export async function requireAuth(
	request: NextRequest,
): Promise<SessionContext> {
	const session = await getServerSession();

	if (!session) {
		logger.warn("Unauthorized access attempt", {
			path: request.nextUrl.pathname,
			method: request.method,
		});
		throw new UnauthorizedError("Authentication required");
	}

	return {
		userId: session.$id,
		email: session.email,
		name: session.name,
		$id: session.$id,
	};
}

/**
 * Higher-order function to wrap API handlers with authentication
 * @example
 * export const GET = withAuth(async (request, session) => {
 *   // Handler has access to validated session
 * });
 */
export function withAuth<T extends unknown[]>(
	handler: (
		request: NextRequest,
		session: SessionContext,
		...args: T
	) => Promise<Response>,
) {
	return async (request: NextRequest, ...args: T): Promise<Response> => {
		try {
			const session = await requireAuth(request);
			return await handler(request, session, ...args);
		} catch (error) {
			if (error instanceof UnauthorizedError) {
				return NextResponse.json(
					{ error: "Unauthorized - Authentication required" },
					{ status: 401 },
				);
			}
			throw error;
		}
	};
}

/**
 * Verify user has required permissions for a server
 */
export async function requireServerPermission(
	serverId: string,
	userId: string,
	permission: "owner" | "admin" | "moderator" | "member",
): Promise<void> {
	const roles = await getUserRoles(userId);

	// Global admins have full access
	if (roles.isAdmin || roles.isModerator) {
		return;
	}

	// Check server-specific permissions
	// TODO: Implement server-specific role checking
	// For now, we'll check if user is a member
	const { databases } = await import("@/lib/appwrite-core").then((m) =>
		m.getServerClient(),
	);
	const env = await import("@/lib/appwrite-core").then((m) =>
		m.getEnvConfig(),
	);

	try {
		const memberships = await databases.listDocuments(
			env.databaseId,
			env.collections.memberships || "memberships",
			[
				`serverId=${serverId}`,
				`userId=${userId}`,
			],
		);

		if (memberships.documents.length === 0) {
			throw new ForbiddenError("Not a member of this server");
		}

		// Check if owner
		const servers = await databases.listDocuments(
			env.databaseId,
			env.collections.servers,
			[`$id=${serverId}`],
		);

		if (servers.documents.length === 0) {
			throw new ForbiddenError("Server not found");
		}

		const server = servers.documents[0];
		const isOwner = server.ownerId === userId;

		if (permission === "owner" && !isOwner) {
			throw new ForbiddenError("Server owner access required");
		}

		if (permission === "admin" && !isOwner && !roles.isAdmin) {
			throw new ForbiddenError("Server admin access required");
		}

		// Member check already passed above
	} catch (error) {
		if (error instanceof ForbiddenError) {
			throw error;
		}
		logger.error("Permission check failed", {
			serverId,
			userId,
			permission,
			error: error instanceof Error ? error.message : String(error),
		});
		throw new ForbiddenError("Permission check failed");
	}
}

/**
 * Higher-order function to wrap API handlers with server permission checks
 */
export function withServerPermission(
	getServerId: (request: NextRequest, ...args: unknown[]) => Promise<string>,
	permission: "owner" | "admin" | "moderator" | "member",
) {
	return <T extends unknown[]>(
		handler: (
			request: NextRequest,
			session: SessionContext,
			...args: T
		) => Promise<Response>,
	) => {
		return withAuth(
			async (
				request: NextRequest,
				session: SessionContext,
				...args: T
			): Promise<Response> => {
				try {
					const serverId = await getServerId(request, ...args);
					await requireServerPermission(serverId, session.userId, permission);
					return await handler(request, session, ...args);
				} catch (error) {
					if (error instanceof ForbiddenError) {
						return NextResponse.json(
							{ error: error.message },
							{ status: 403 },
						);
					}
					throw error;
				}
			},
		);
	};
}

/**
 * CORS helper - validates origin and sets appropriate headers
 */
export function setCorsHeaders(request: NextRequest, headers: Headers): Headers {
	const allowedOrigins = [
		process.env.NEXT_PUBLIC_BASE_URL,
		"http://localhost:3000",
		"http://localhost:3001",
	].filter(Boolean) as string[];

	const origin = request.headers.get("origin");

	if (origin && allowedOrigins.includes(origin)) {
		headers.set("Access-Control-Allow-Origin", origin);
		headers.set("Access-Control-Allow-Credentials", "true");
		headers.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS",
		);
		headers.set(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization",
		);
	}

	return headers;
}

/**
 * Helper to create consistent error responses
 */
export const ErrorCodes = {
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
	VALIDATION_FAILED: "VALIDATION_FAILED",
	NOT_FOUND: "NOT_FOUND",
	RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
	INTERNAL_ERROR: "INTERNAL_ERROR",
	BAD_REQUEST: "BAD_REQUEST",
	CONFLICT: "CONFLICT",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type ApiErrorResponse = {
	error: {
		code: ErrorCode;
		message: string;
		requestId?: string;
		details?: Record<string, unknown>;
	};
};

/**
 * Sensitive patterns to remove from error messages
 */
const SENSITIVE_PATTERNS = [
	/api[_-]?key[s]?[\s:=]+[\w-]+/gi,
	/secret[s]?[\s:=]+[\w-]+/gi,
	/password[s]?[\s:=]+[\w-]+/gi,
	/token[s]?[\s:=]+[\w-]+/gi,
	/\/[\w-]+\/[\w-]+\.ts/gi, // Internal file paths
	/at\s+[\w.]+\s+\([^)]+\)/gi, // Stack trace function calls
];

/**
 * Sanitize error message to remove sensitive information
 */
function sanitizeErrorMessage(message: string): string {
	let sanitized = message;
	
	for (const pattern of SENSITIVE_PATTERNS) {
		sanitized = sanitized.replace(pattern, "[REDACTED]");
	}
	
	return sanitized;
}

/**
 * Generate a unique request ID for error tracking
 */
function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createErrorResponse(
	code: ErrorCode,
	message: string,
	status: number,
	details?: Record<string, unknown>,
	includeRequestId = true,
): Response {
	const requestId = includeRequestId ? generateRequestId() : undefined;
	
	// Sanitize message in production
	const sanitizedMessage = process.env.NODE_ENV === "production" 
		? sanitizeErrorMessage(message)
		: message;
	
	const response: ApiErrorResponse = {
		error: {
			code,
			message: sanitizedMessage,
			...(requestId && { requestId }),
			...(details && { details }),
		},
	};
	
	// Log error with full details for debugging
	if (status >= 500) {
		logger.error("API error response", {
			code,
			message, // Original unsanitized message
			status,
			requestId,
			details,
		});
	}

	return NextResponse.json(response, { status });
}
