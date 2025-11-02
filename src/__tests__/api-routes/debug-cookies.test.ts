/**
 * Tests for GET /api/debug-cookies endpoint
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/debug-cookies/route";

// Mock next/headers
const mockGetAll = vi.fn();
const mockGet = vi.fn();

vi.mock("next/headers", () => ({
	cookies: vi.fn(() =>
		Promise.resolve({
			getAll: mockGetAll,
			get: mockGet,
		})
	),
}));

// Mock node-appwrite
const mockAccountGet = vi.fn();

vi.mock("node-appwrite", () => ({
	Client: vi.fn().mockImplementation(() => ({
		setEndpoint: vi.fn().mockReturnThis(),
		setProject: vi.fn().mockReturnThis(),
		setSession: vi.fn().mockReturnThis(),
	})),
	Account: vi.fn().mockImplementation(() => ({
		get: mockAccountGet,
	})),
}));

describe("GET /api/debug-cookies", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = {
			...originalEnv,
			NODE_ENV: "development", // Set to development for debug endpoints
			APPWRITE_PROJECT_ID: "test-project",
			APPWRITE_ENDPOINT: "https://test.appwrite.io/v1",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should return debug info when no session cookie exists", async () => {
		mockGetAll.mockReturnValue([
			{ name: "other-cookie", value: "value1" },
		]);
		mockGet.mockReturnValue(undefined);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.projectId).toBe("test-project");
		expect(data.endpoint).toBe("https://test.appwrite.io/v1");
		expect(data.expectedCookieName).toBe("a_session_test-project");
		expect(data.sessionCookieExists).toBe(false);
		expect(data.diagnosis).toContain("Session cookie NOT found");
	});

	it("should validate successful session cookie", async () => {
		const sessionValue = "valid-session-token-12345678901234567890";
		mockGetAll.mockReturnValue([
			{ name: "a_session_test-project", value: sessionValue },
		]);
		mockGet.mockReturnValue({ value: sessionValue });
		mockAccountGet.mockResolvedValue({
			$id: "user123",
			email: "test@example.com",
			name: "Test User",
		});

		const response = await GET();
		const data = await response.json();

		expect(data.sessionCookieExists).toBe(true);
		expect(data.sessionCookieValue).toBe("valid-session-token-...");
		expect(data.validation?.success).toBe(true);
		expect(data.validation?.userId).toBe("user123");
		expect(data.validation?.email).toBe("test@example.com");
		expect(data.validation?.name).toBe("Test User");
		expect(data.diagnosis).toContain(
			"Session cookie found AND validates with Appwrite"
		);
	});

	it("should handle failed session validation", async () => {
		const sessionValue = "invalid-session-token";
		mockGetAll.mockReturnValue([
			{ name: "a_session_test-project", value: sessionValue },
		]);
		mockGet.mockReturnValue({ value: sessionValue });
		mockAccountGet.mockRejectedValue(new Error("Invalid session"));

		const response = await GET();
		const data = await response.json();

		expect(data.sessionCookieExists).toBe(true);
		expect(data.validation?.success).toBe(false);
		expect(data.validation?.error).toBe("Invalid session");
		expect(data.diagnosis).toContain("Session cookie found but FAILS validation");
	});

	it("should list all cookie names", async () => {
		mockGetAll.mockReturnValue([
			{ name: "cookie1", value: "value1" },
			{ name: "cookie2", value: "value2" },
			{ name: "cookie3", value: "value3" },
		]);
		mockGet.mockReturnValue(undefined);

		const response = await GET();
		const data = await response.json();

		expect(data.allCookieNames).toEqual(["cookie1", "cookie2", "cookie3"]);
		expect(data.totalCookies).toBe(3);
	});

	it("should truncate session cookie value for security", async () => {
		const longSessionValue =
			"very-long-session-token-that-should-be-truncated-for-security-reasons";
		mockGetAll.mockReturnValue([
			{ name: "a_session_test-project", value: longSessionValue },
		]);
		mockGet.mockReturnValue({ value: longSessionValue });
		mockAccountGet.mockResolvedValue({
			$id: "user123",
			email: "test@example.com",
			name: "Test User",
		});

		const response = await GET();
		const data = await response.json();

		expect(data.sessionCookieValue).toBe("very-long-session-to...");
		expect(data.sessionCookieValue?.length).toBeLessThan(
			longSessionValue.length
		);
		expect(data.sessionCookieValueFull).toBe(longSessionValue);
	});

	it("should handle missing environment variables", async () => {
		process.env.APPWRITE_PROJECT_ID = undefined;
		process.env.APPWRITE_ENDPOINT = undefined;

		mockGetAll.mockReturnValue([]);
		mockGet.mockReturnValue(undefined);

		const response = await GET();
		const data = await response.json();

		expect(data.projectId).toBeUndefined();
		expect(data.endpoint).toBeUndefined();
		expect(data.validation).toBeNull();
	});

	it("should skip validation when no session cookie", async () => {
		mockGetAll.mockReturnValue([]);
		mockGet.mockReturnValue(undefined);

		const response = await GET();
		const data = await response.json();

		expect(data.validation).toBeNull();
		expect(mockAccountGet).not.toHaveBeenCalled();
	});

	it("should skip validation when endpoint is missing", async () => {
		process.env.APPWRITE_ENDPOINT = undefined;
		const sessionValue = "some-session-token";
		mockGetAll.mockReturnValue([
			{ name: "a_session_test-project", value: sessionValue },
		]);
		mockGet.mockReturnValue({ value: sessionValue });

		const response = await GET();
		const data = await response.json();

		expect(data.validation).toBeNull();
		expect(mockAccountGet).not.toHaveBeenCalled();
	});

	it("should skip validation when projectId is missing", async () => {
		process.env.APPWRITE_PROJECT_ID = undefined;
		const sessionValue = "some-session-token";
		mockGetAll.mockReturnValue([
			{ name: "a_session_undefined", value: sessionValue },
		]);
		mockGet.mockReturnValue({ value: sessionValue });

		const response = await GET();
		const data = await response.json();

		expect(data.validation).toBeNull();
		expect(mockAccountGet).not.toHaveBeenCalled();
	});

	it("should handle non-Error exceptions in validation", async () => {
		const sessionValue = "some-session-token";
		mockGetAll.mockReturnValue([
			{ name: "a_session_test-project", value: sessionValue },
		]);
		mockGet.mockReturnValue({ value: sessionValue });
		mockAccountGet.mockRejectedValue("String error");

		const response = await GET();
		const data = await response.json();

		expect(data.validation?.success).toBe(false);
		expect(data.validation?.error).toBe("Unknown error");
	});

	it("should return empty array when no cookies exist", async () => {
		mockGetAll.mockReturnValue([]);
		mockGet.mockReturnValue(undefined);

		const response = await GET();
		const data = await response.json();

		expect(data.allCookieNames).toEqual([]);
		expect(data.totalCookies).toBe(0);
	});

	it("should correctly identify expected cookie name format", async () => {
		process.env.APPWRITE_PROJECT_ID = "my-custom-project-123";

		mockGetAll.mockReturnValue([]);
		mockGet.mockReturnValue(undefined);

		const response = await GET();
		const data = await response.json();

		expect(data.expectedCookieName).toBe("a_session_my-custom-project-123");
	});
});
