/**
 * Tests for GET /api/test-env endpoint
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/test-env/route";

describe("GET /api/test-env", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should return environment variables when all are set", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "test-project-id",
			APPWRITE_ENDPOINT: "https://server.appwrite.io/v1",
			APPWRITE_PROJECT_ID: "server-project-id",
		};

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.endpoint).toBe("https://cloud.appwrite.io/v1");
		expect(data.projectId).toBe("test-project-id");
		expect(data.hasServerEndpoint).toBe(true);
		expect(data.hasServerProjectId).toBe(true);
	});

	it('should return "missing" for undefined public endpoint', async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: undefined,
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "test-project-id",
			APPWRITE_ENDPOINT: "https://server.appwrite.io/v1",
			APPWRITE_PROJECT_ID: "server-project-id",
		};

		const response = await GET();
		const data = await response.json();

		expect(data.endpoint).toBe("missing");
	});

	it('should return "missing" for undefined public project ID', async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: undefined,
			APPWRITE_ENDPOINT: "https://server.appwrite.io/v1",
			APPWRITE_PROJECT_ID: "server-project-id",
		};

		const response = await GET();
		const data = await response.json();

		expect(data.projectId).toBe("missing");
	});

	it("should return false for hasServerEndpoint when not set", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "test-project-id",
			APPWRITE_ENDPOINT: undefined,
			APPWRITE_PROJECT_ID: "server-project-id",
		};

		const response = await GET();
		const data = await response.json();

		expect(data.hasServerEndpoint).toBe(false);
	});

	it("should return false for hasServerProjectId when not set", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "test-project-id",
			APPWRITE_ENDPOINT: "https://server.appwrite.io/v1",
			APPWRITE_PROJECT_ID: undefined,
		};

		const response = await GET();
		const data = await response.json();

		expect(data.hasServerProjectId).toBe(false);
	});

	it("should handle all variables missing", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: undefined,
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: undefined,
			APPWRITE_ENDPOINT: undefined,
			APPWRITE_PROJECT_ID: undefined,
		};

		const response = await GET();
		const data = await response.json();

		expect(data.endpoint).toBe("missing");
		expect(data.projectId).toBe("missing");
		expect(data.hasServerEndpoint).toBe(false);
		expect(data.hasServerProjectId).toBe(false);
	});

	it("should handle empty string values", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "",
			APPWRITE_ENDPOINT: "",
			APPWRITE_PROJECT_ID: "",
		};

		const response = await GET();
		const data = await response.json();

		expect(data.endpoint).toBe("missing");
		expect(data.projectId).toBe("missing");
		expect(data.hasServerEndpoint).toBe(false);
		expect(data.hasServerProjectId).toBe(false);
	});

	it("should return all four expected fields", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://cloud.appwrite.io/v1",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "test-project",
			APPWRITE_ENDPOINT: "https://server.appwrite.io/v1",
			APPWRITE_PROJECT_ID: "server-project",
		};

		const response = await GET();
		const data = await response.json();

		expect(Object.keys(data)).toEqual([
			"endpoint",
			"projectId",
			"hasServerEndpoint",
			"hasServerProjectId",
		]);
	});

	it("should handle special characters in environment variables", async () => {
		process.env = {
			...originalEnv,
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "https://test.com/v1?key=value",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "project-123_test",
			APPWRITE_ENDPOINT: "https://server.com",
			APPWRITE_PROJECT_ID: "server-123",
		};

		const response = await GET();
		const data = await response.json();

		expect(data.endpoint).toBe("https://test.com/v1?key=value");
		expect(data.projectId).toBe("project-123_test");
	});
});
