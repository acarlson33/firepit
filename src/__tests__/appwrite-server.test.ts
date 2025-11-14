/**
 * Tests for Appwrite server client initialization
 */
import { describe, expect, it, beforeEach } from "vitest";

describe("Appwrite Server Client", () => {
	beforeEach(() => {
		// Reset env vars
		process.env.APPWRITE_ENDPOINT = "http://localhost";
		process.env.APPWRITE_PROJECT_ID = "test-project";
		process.env.APPWRITE_DATABASE_ID = "main";
		process.env.APPWRITE_API_KEY = "test-api-key";
	});

	it("should create server client with API key", async () => {
		const { getServerClient } = await import("@/lib/appwrite-server");
		const { client, databases, teams, storage } = getServerClient();
		
		expect(client).toBeDefined();
		expect(databases).toBeDefined();
		expect(teams).toBeDefined();
		expect(storage).toBeDefined();
	});

	it("should throw error when APPWRITE_API_KEY is missing", async () => {
		delete process.env.APPWRITE_API_KEY;
		
		const { getServerClient } = await import("@/lib/appwrite-server");
		
		expect(() => getServerClient()).toThrow("APPWRITE_API_KEY not configured");
	});

	it("should throw error when APPWRITE_API_KEY is empty string", async () => {
		process.env.APPWRITE_API_KEY = "";
		
		const { getServerClient } = await import("@/lib/appwrite-server");
		
		expect(() => getServerClient()).toThrow("APPWRITE_API_KEY not configured");
	});
});
