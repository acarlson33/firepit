import { NextResponse } from "next/server";

export interface ApiErrorResponse {
	error: string;
	message: string;
	details?: Record<string, string[]>;
	requestId?: string;
}

export type ApiErrorCode =
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "BAD_REQUEST"
	| "VALIDATION_ERROR"
	| "INTERNAL_ERROR"
	| "RATE_LIMIT_EXCEEDED"
	| "CONFLICT"
	| "GONE";

const HTTP_STATUS_MAP: Record<ApiErrorCode, number> = {
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	VALIDATION_ERROR: 422,
	INTERNAL_ERROR: 500,
	RATE_LIMIT_EXCEEDED: 429,
	CONFLICT: 409,
	GONE: 410,
};

export function createApiError(
	code: ApiErrorCode,
	message: string,
	options?: {
		details?: Record<string, string[]>;
		requestId?: string;
	},
): NextResponse<ApiErrorResponse> {
	const status = HTTP_STATUS_MAP[code];

	return NextResponse.json(
		{
			error: code,
			message,
			details: options?.details,
			requestId: options?.requestId,
		},
		{ status },
	);
}

export function getRequestIdFromRequest(request: Request): string | undefined {
	return request.headers.get("X-Request-ID") || undefined;
}

export function unauthorized(
	message = "Authentication required",
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("UNAUTHORIZED", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function forbidden(
	message = "You do not have permission to perform this action",
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("FORBIDDEN", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function notFound(
	message = "Resource not found",
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("NOT_FOUND", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function badRequest(
	message: string,
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("BAD_REQUEST", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function validationError(
	errors: Record<string, string[]>,
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("VALIDATION_ERROR", "Validation failed", {
		details: errors,
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function conflict(
	message: string,
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("CONFLICT", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function gone(
	message: string,
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("GONE", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function internalError(
	message = "An unexpected error occurred",
	request?: Request,
): NextResponse<ApiErrorResponse> {
	return createApiError("INTERNAL_ERROR", message, {
		requestId: request ? getRequestIdFromRequest(request) : undefined,
	});
}

export function isApiErrorResponse(response: unknown): response is ApiErrorResponse {
	if (!response || typeof response !== "object") {
		return false;
	}

	const candidate = response as Record<string, unknown>;

	return (
		typeof candidate.error === "string" &&
		typeof candidate.message === "string"
	);
}
