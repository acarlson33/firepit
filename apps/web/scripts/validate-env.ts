#!/usr/bin/env bun
/**
 * Environment Variable Validation Script
 * 
 * Validates that all required environment variables are set correctly
 * and tests the connection to Appwrite before deployment.
 * 
 * Usage:
 *   bun run validate-env
 * 
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 */

import { Client, Databases } from "node-appwrite";

// ANSI color codes for terminal output
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	bold: "\x1b[1m",
};

interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Print colored output to console
 */
function print(message: string, color: keyof typeof colors = "reset"): void {
	// Console output is intentional for this CLI script
	console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print a section header
 */
function printSection(title: string): void {
	// Console output is intentional for this CLI script
	console.log();
	print(`${"=".repeat(60)}`, "cyan");
	print(`  ${title}`, "bold");
	print(`${"=".repeat(60)}`, "cyan");
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Validate Appwrite endpoint URL
 */
function validateEndpoint(endpoint: string | undefined): {
	valid: boolean;
	error?: string;
} {
	if (!endpoint) {
		return {
			valid: false,
			error: "APPWRITE_ENDPOINT is not set",
		};
	}

	if (!isValidUrl(endpoint)) {
		return {
			valid: false,
			error: `Invalid URL format: ${endpoint}`,
		};
	}

	if (!endpoint.endsWith("/v1")) {
		return {
			valid: false,
			error: `Endpoint must end with /v1: ${endpoint}`,
		};
	}

	return { valid: true };
}

/**
 * Validate project ID format (alphanumeric, hyphens, underscores)
 */
function validateProjectId(projectId: string | undefined): {
	valid: boolean;
	error?: string;
} {
	if (!projectId) {
		return {
			valid: false,
			error: "APPWRITE_PROJECT_ID is not set",
		};
	}

	if (projectId === "your-project-id-here" || projectId === "your-project-id") {
		return {
			valid: false,
			error: "Project ID still has placeholder value. Get real value from Appwrite Console.",
		};
	}

	if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
		return {
			valid: false,
			error: `Invalid project ID format: ${projectId}. Must contain only letters, numbers, hyphens, and underscores.`,
		};
	}

	return { valid: true };
}

/**
 * Validate API key format and presence
 */
function validateApiKey(apiKey: string | undefined): {
	valid: boolean;
	error?: string;
	warning?: string;
} {
	if (!apiKey) {
		return {
			valid: false,
			error: "APPWRITE_API_KEY is not set. Required for server-side operations and setup script.",
		};
	}

	if (apiKey === "your-api-key-here" || apiKey === "your-api-key") {
		return {
			valid: false,
			error: "API key still has placeholder value. Generate one in Appwrite Console > Settings > API Keys.",
		};
	}

	if (apiKey.length < 32) {
		return {
			valid: false,
			error: `API key seems too short (${apiKey.length} chars). Appwrite API keys are typically longer.`,
		};
	}

	// Warning if API key is exposed in logs
	const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
	return {
		valid: true,
		warning: `Using API key: ${maskedKey}`,
	};
}

/**
 * Validate required environment variables
 */
function validateRequiredVars(): ValidationResult {
	const result: ValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
	};

	printSection("Validating Required Variables");

	// Check endpoint
	const endpointResult = validateEndpoint(
		process.env.APPWRITE_ENDPOINT,
	);
	if (endpointResult.valid) {
		print(
			`✓ APPWRITE_ENDPOINT: ${process.env.APPWRITE_ENDPOINT}`,
			"green",
		);
	} else {
		print(`✗ ${endpointResult.error}`, "red");
		result.errors.push(endpointResult.error || "Endpoint validation failed");
		result.valid = false;
	}

	// Check project ID
	const projectIdResult = validateProjectId(
		process.env.APPWRITE_PROJECT_ID,
	);
	if (projectIdResult.valid) {
		print(
			`✓ APPWRITE_PROJECT_ID: ${process.env.APPWRITE_PROJECT_ID}`,
			"green",
		);
	} else {
		print(`✗ ${projectIdResult.error}`, "red");
		result.errors.push(projectIdResult.error || "Project ID validation failed");
		result.valid = false;
	}

	// Check API key
	const apiKeyResult = validateApiKey(process.env.APPWRITE_API_KEY);
	if (apiKeyResult.valid) {
		print(`✓ APPWRITE_API_KEY: ${apiKeyResult.warning}`, "green");
	} else {
		print(`✗ ${apiKeyResult.error}`, "red");
		result.errors.push(apiKeyResult.error || "API key validation failed");
		result.valid = false;
	}

	return result;
}

/**
 * Validate optional but recommended variables
 */
function validateOptionalVars(): ValidationResult {
	const result: ValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
	};

	printSection("Checking Optional Variables");

	// Database ID (has default)
	const databaseId =
		process.env.APPWRITE_DATABASE_ID ||
		process.env.APPWRITE_DATABASE_ID ||
		"main";
	print(`✓ Database ID: ${databaseId} (using default: "main")`, "green");

	// Admin configuration
	const adminUserIds = process.env.APPWRITE_ADMIN_USER_IDS;
	const adminTeamId = process.env.APPWRITE_ADMIN_TEAM_ID;

	if (!adminUserIds && !adminTeamId) {
		print(
			"⚠ No admin configuration found (APPWRITE_ADMIN_USER_IDS or APPWRITE_ADMIN_TEAM_ID)",
			"yellow",
		);
		result.warnings.push(
			"You won't have admin access until you configure admin users or teams.",
		);
	} else {
		if (adminUserIds) {
			const userCount = adminUserIds.split(",").filter(Boolean).length;
			print(
				`✓ Admin User IDs configured: ${userCount} user(s)`,
				"green",
			);
		}
		if (adminTeamId) {
			print(`✓ Admin Team ID configured: ${adminTeamId}`, "green");
		}
	}

	// Moderator configuration
	const modUserIds = process.env.APPWRITE_MODERATOR_USER_IDS;
	const modTeamId = process.env.APPWRITE_MODERATOR_TEAM_ID;

	if (modUserIds || modTeamId) {
		if (modUserIds) {
			const userCount = modUserIds.split(",").filter(Boolean).length;
			print(`✓ Moderator User IDs configured: ${userCount} user(s)`, "green");
		}
		if (modTeamId) {
			print(`✓ Moderator Team ID configured: ${modTeamId}`, "green");
		}
	}

	return result;
}

/**
 * Test connection to Appwrite
 */
async function testAppwriteConnection(): Promise<ValidationResult> {
	const result: ValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
	};

	printSection("Testing Appwrite Connection");

	const endpoint = process.env.APPWRITE_ENDPOINT;
	const projectId = process.env.APPWRITE_PROJECT_ID;
	const apiKey = process.env.APPWRITE_API_KEY;

	if (!endpoint || !projectId || !apiKey) {
		print("⊘ Skipping connection test (missing required vars)", "yellow");
		return result;
	}

	try {
		// Initialize client
		const client = new Client()
			.setEndpoint(endpoint)
			.setProject(projectId)
			.setKey(apiKey);

		const databases = new Databases(client);

		// Try to list databases (requires databases.read permission)
		print("→ Attempting to connect to Appwrite...", "blue");
		const response = await databases.list();

		print(`✓ Successfully connected to Appwrite!`, "green");
		print(`  Found ${response.total} database(s)`, "green");

		// Check for main database
		const databaseId =
			process.env.APPWRITE_DATABASE_ID ||
			process.env.APPWRITE_DATABASE_ID ||
			"main";
		const mainDb = response.databases.find((db) => db.$id === databaseId);

		if (mainDb) {
			print(`✓ Found database: "${databaseId}"`, "green");
		} else {
			print(
				`⚠ Database "${databaseId}" not found. Run 'bun run setup' to create it.`,
				"yellow",
			);
			result.warnings.push(
				`Database "${databaseId}" doesn't exist yet. This is normal for first-time setup.`,
			);
		}
	} catch (error) {
		result.valid = false;

		if (error instanceof Error) {
			const errorMessage = error.message.toLowerCase();

			if (errorMessage.includes("fetch failed") || errorMessage.includes("econnrefused")) {
				print(
					"✗ Connection failed: Cannot reach Appwrite endpoint",
					"red",
				);
				result.errors.push(
					"Unable to connect to Appwrite. Check your APPWRITE_ENDPOINT and network connection.",
				);
			} else if (errorMessage.includes("project not found") || errorMessage.includes("invalid credentials")) {
				print("✗ Authentication failed: Invalid project ID or API key", "red");
				result.errors.push(
					"Invalid APPWRITE_PROJECT_ID or APPWRITE_API_KEY. Verify these in Appwrite Console.",
				);
			} else if (errorMessage.includes("missing scope") || errorMessage.includes("not authorized")) {
				print(
					"✗ Authorization failed: API key missing required scopes",
					"red",
				);
				result.errors.push(
					"API key doesn't have required permissions. Ensure it has: databases.read, databases.write, collections.*, attributes.*, indexes.*",
				);
			} else {
				print(`✗ Connection error: ${error.message}`, "red");
				result.errors.push(error.message);
			}
		} else {
			print(`✗ Unknown error: ${String(error)}`, "red");
			result.errors.push(String(error));
		}
	}

	return result;
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
	print("\n🔍 Firepit Environment Validation", "bold");
	print("Checking your environment configuration...\n", "cyan");

	// Load .env.local if it exists
	const envLocalPath = new URL("../.env.local", import.meta.url).pathname;
	try {
		// @ts-expect-error - Bun.file is available in Bun runtime
		const envLocal = await Bun.file(envLocalPath).text();
		const lines = envLocal.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith("#")) {
				const [key, ...valueParts] = trimmed.split("=");
				const value = valueParts.join("=");
				if (key && value && !process.env[key]) {
					process.env[key] = value;
				}
			}
		}
		print(`✓ Loaded environment from .env.local`, "green");
	} catch {
		print(
			"⚠ No .env.local found. Copy .env.local.example to .env.local first!",
			"yellow",
		);
		print(
			"  Run: cp .env.local.example .env.local && nano .env.local\n",
			"cyan",
		);
		process.exit(1);
	}

	// Run all validations
	const requiredResult = validateRequiredVars();
	const optionalResult = validateOptionalVars();
	const connectionResult = await testAppwriteConnection();

	// Aggregate results
	const allErrors = [
		...requiredResult.errors,
		...optionalResult.errors,
		...connectionResult.errors,
	];
	const allWarnings = [
		...requiredResult.warnings,
		...optionalResult.warnings,
		...connectionResult.warnings,
	];

	// Print summary
	printSection("Validation Summary");

	if (allErrors.length === 0) {
		print("✓ All validations passed!", "green");
		if (allWarnings.length > 0) {
			print(`\n⚠ ${allWarnings.length} warning(s):`, "yellow");
			for (const warning of allWarnings) {
				print(`  • ${warning}`, "yellow");
			}
		}
		print("\n✨ Your environment is ready!", "green");
		print("Next steps:", "cyan");
		print("  1. Run: bun run setup      (initialize database)", "cyan");
		print("  2. Run: bun dev            (start development server)", "cyan");
		print("  3. Create account and make yourself admin\n", "cyan");
		process.exit(0);
	} else {
		print(`✗ ${allErrors.length} error(s) found:`, "red");
		for (const error of allErrors) {
			print(`  • ${error}`, "red");
		}

		if (allWarnings.length > 0) {
			print(`\n⚠ ${allWarnings.length} warning(s):`, "yellow");
			for (const warning of allWarnings) {
				print(`  • ${warning}`, "yellow");
			}
		}

		print("\n📖 For help, see DEPLOYMENT.md", "cyan");
		print("🐛 Still stuck? Open an issue: https://github.com/your-org/firepit/issues\n", "cyan");
		process.exit(1);
	}
}

// Run validation
main().catch((error: Error) => {
	print(`\n💥 Fatal error: ${error.message}`, "red");
	process.exit(1);
});
