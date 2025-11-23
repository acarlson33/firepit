/**
 * Input Validation Schemas
 * Centralized Zod schemas for API request validation
 */

import { z } from "zod";

/**
 * Message validation schema
 */
export const messageSchema = z.object({
	text: z
		.string()
		.min(1, "Message cannot be empty")
		.max(2000, "Message cannot exceed 2000 characters")
		.trim(),
	channelId: z.string().min(1, "Channel ID is required"),
	serverId: z.string().optional(),
	replyTo: z.string().optional(),
});

export type MessageInput = z.infer<typeof messageSchema>;

/**
 * Direct message validation schema
 */
export const directMessageSchema = z.object({
	text: z
		.string()
		.min(1, "Message cannot be empty")
		.max(2000, "Message cannot exceed 2000 characters")
		.trim(),
	recipientId: z.string().min(1, "Recipient ID is required"),
	replyTo: z.string().optional(),
});

export type DirectMessageInput = z.infer<typeof directMessageSchema>;

/**
 * Role validation schema
 */
export const roleSchema = z.object({
	name: z
		.string()
		.min(1, "Role name is required")
		.max(100, "Role name cannot exceed 100 characters")
		.trim(),
	color: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g., #FF5733)")
		.optional(),
	position: z
		.number()
		.int("Position must be an integer")
		.nonnegative("Position must be non-negative")
		.optional(),
	permissions: z.array(z.string()).optional(),
});

export type RoleInput = z.infer<typeof roleSchema>;

/**
 * Role update schema (all fields optional)
 */
export const roleUpdateSchema = z.object({
	name: z
		.string()
		.min(1, "Role name cannot be empty")
		.max(100, "Role name cannot exceed 100 characters")
		.trim()
		.optional(),
	color: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g., #FF5733)")
		.optional(),
	position: z
		.number()
		.int("Position must be an integer")
		.nonnegative("Position must be non-negative")
		.optional(),
	permissions: z.array(z.string()).optional(),
});

export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

/**
 * Invite code validation schema
 */
export const inviteCodeSchema = z
	.string()
	.min(6, "Invite code must be at least 6 characters")
	.max(12, "Invite code cannot exceed 12 characters")
	.regex(/^[A-Za-z0-9]+$/, "Invite code must be alphanumeric");

/**
 * Invite creation validation schema
 */
export const inviteCreateSchema = z.object({
	serverId: z.string().min(1, "serverId is required"),
	channelId: z.string().optional().nullable(),
	maxUses: z
		.number()
		.int("Max uses must be an integer")
		.positive("Max uses must be positive")
		.max(1000, "Max uses cannot exceed 1000")
		.optional()
		.nullable(),
	expiresAt: z.string().datetime().optional().nullable(),
	temporary: z.boolean().optional(),
});

export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;

/**
 * Server validation schema
 */
export const serverSchema = z.object({
	name: z
		.string()
		.min(1, "Server name is required")
		.max(100, "Server name cannot exceed 100 characters")
		.trim(),
	icon: z.string().optional(),
	description: z
		.string()
		.max(500, "Description cannot exceed 500 characters")
		.optional(),
});

export type ServerInput = z.infer<typeof serverSchema>;

/**
 * Server update schema (all fields optional)
 */
export const serverUpdateSchema = z.object({
	name: z
		.string()
		.min(1, "Server name cannot be empty")
		.max(100, "Server name cannot exceed 100 characters")
		.trim()
		.optional(),
	icon: z.string().optional(),
	description: z
		.string()
		.max(500, "Description cannot exceed 500 characters")
		.optional(),
});

export type ServerUpdateInput = z.infer<typeof serverUpdateSchema>;

/**
 * Channel validation schema
 */
export const channelSchema = z.object({
	name: z
		.string()
		.min(1, "Channel name is required")
		.max(100, "Channel name cannot exceed 100 characters")
		.regex(/^[a-z0-9-]+$/, "Channel name must be lowercase alphanumeric with hyphens")
		.trim(),
	serverId: z.string().min(1, "Server ID is required"),
	type: z.enum(["text", "voice"]).optional(),
	position: z
		.number()
		.int("Position must be an integer")
		.nonnegative("Position must be non-negative")
		.optional(),
});

export type ChannelInput = z.infer<typeof channelSchema>;

/**
 * Search query validation schema
 */
export const searchQuerySchema = z.object({
	q: z
		.string()
		.min(2, "Search query must be at least 2 characters")
		.max(200, "Search query cannot exceed 200 characters")
		.trim(),
	limit: z
		.number()
		.int("Limit must be an integer")
		.positive("Limit must be positive")
		.max(100, "Limit cannot exceed 100")
		.optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/**
 * Pagination validation schema
 */
export const paginationSchema = z.object({
	cursor: z.string().optional(),
	limit: z
		.number()
		.int("Limit must be an integer")
		.positive("Limit must be positive")
		.max(100, "Limit cannot exceed 100")
		.default(25),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Helper function to validate request body
 */
export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): {
	success: true;
	data: T;
} | {
	success: false;
	error: string;
	issues: z.ZodIssue[];
} {
	const result = schema.safeParse(data);
	
	if (result.success) {
		return { success: true, data: result.data };
	}
	
	return {
		success: false,
		error: result.error.issues[0]?.message ?? "Validation failed",
		issues: result.error.issues,
	};
}

/**
 * Helper function to validate query parameters
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): {
	success: true;
	data: T;
} | {
	success: false;
	error: string;
	issues: z.ZodIssue[];
} {
	// Convert URLSearchParams to object
	const data: Record<string, string | string[]> = {};
	
	for (const [key, value] of searchParams.entries()) {
		const existing = data[key];
		if (existing) {
			// Multiple values for same key - convert to array
			data[key] = Array.isArray(existing) ? [...existing, value] : [String(existing), value];
		} else {
			data[key] = value;
		}
	}
	
	const result = schema.safeParse(data);
	
	if (result.success) {
		return { success: true, data: result.data };
	}
	
	return {
		success: false,
		error: result.error.issues[0]?.message ?? "Validation failed",
		issues: result.error.issues,
	};
}

/**
 * Security validation patterns
 */
const SECURITY_PATTERNS = {
	// XSS patterns - detect common XSS attack vectors
	xss: /<script|javascript:|onerror=|onload=|<iframe|<embed|<object/i,
	
	// SQL injection patterns - detect common SQL injection attempts
	sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)|('|--|;|\/\*|\*\/)/i,
	
	// Path traversal patterns - detect directory traversal attempts
	pathTraversal: /\.\.[/\\]|\.\.%2f|\.\.%5c/i,
	
	// Null byte injection
	nullByte: /%00|\\0/,
};

/**
 * Check for potential XSS payloads in user input
 */
export function containsXSS(input: string): boolean {
	return SECURITY_PATTERNS.xss.test(input);
}

/**
 * Check for potential SQL injection patterns
 */
export function containsSQLInjection(input: string): boolean {
	return SECURITY_PATTERNS.sqlInjection.test(input);
}

/**
 * Check for path traversal attempts
 */
export function containsPathTraversal(input: string): boolean {
	return SECURITY_PATTERNS.pathTraversal.test(input);
}

/**
 * Check for null byte injection
 */
export function containsNullByte(input: string): boolean {
	return SECURITY_PATTERNS.nullByte.test(input);
}

/**
 * Comprehensive security validation for user input
 */
export function validateSecurity(input: string, fieldName = "input"): {
	safe: true;
} | {
	safe: false;
	reason: string;
} {
	if (containsXSS(input)) {
		return {
			safe: false,
			reason: `${fieldName} contains potentially malicious content (XSS)`,
		};
	}
	
	if (containsSQLInjection(input)) {
		return {
			safe: false,
			reason: `${fieldName} contains potentially malicious content (SQL injection)`,
		};
	}
	
	if (containsPathTraversal(input)) {
		return {
			safe: false,
			reason: `${fieldName} contains potentially malicious content (path traversal)`,
		};
	}
	
	if (containsNullByte(input)) {
		return {
			safe: false,
			reason: `${fieldName} contains invalid characters`,
		};
	}
	
	return { safe: true };
}

/**
 * Enhanced message schema with security validation
 */
export const messageSchemaSecure = messageSchema.refine(
	(data) => {
		const result = validateSecurity(data.text, "Message text");
		return result.safe;
	},
	{
		message: "Message contains potentially malicious content",
	}
);

/**
 * URL validation schema with security checks
 */
export const urlSchema = z
	.string()
	.url("Invalid URL format")
	.refine(
		(url) => {
			try {
				const parsed = new URL(url);
				// Only allow http and https protocols
				return parsed.protocol === "http:" || parsed.protocol === "https:";
			} catch {
				return false;
			}
		},
		{
			message: "URL must use http or https protocol",
		}
	);
