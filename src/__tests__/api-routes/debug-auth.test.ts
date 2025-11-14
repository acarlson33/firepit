/**
 * Tests for GET /api/debug/auth endpoint
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/debug/auth/route";

// Mock auth-server
vi.mock("@/lib/auth-server", () => ({
	getServerSession: vi.fn(),
}));

import { getServerSession } from "@/lib/auth-server";

describe("GET /api/debug/auth", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("should return 404 in production mode", async () => {
		process.env.NODE_ENV = "production";

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Debug endpoints not available in production");
	});

	it("should return unauthenticated status when no session", async () => {
		process.env.NODE_ENV = "development";
		vi.mocked(getServerSession).mockResolvedValue(null);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.authenticated).toBe(false);
		expect(data.message).toBe("No session found");
	});

	it("should return authenticated user data when session exists", async () => {
		process.env.NODE_ENV = "development";
		const mockUser = {
			$id: "user123",
			email: "test@example.com",
			name: "Test User",
		};
		vi.mocked(getServerSession).mockResolvedValue(mockUser as any);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.authenticated).toBe(true);
		expect(data.userId).toBe("user123");
		expect(data.email).toBe("test@example.com");
		expect(data.name).toBe("Test User");
	});

	it("should handle errors when checking session", async () => {
		process.env.NODE_ENV = "development";
		vi.mocked(getServerSession).mockRejectedValue(new Error("Session error"));

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.authenticated).toBe(false);
		expect(data.error).toBe("Session error");
	});

	it("should handle non-Error exceptions", async () => {
		process.env.NODE_ENV = "development";
		vi.mocked(getServerSession).mockRejectedValue("String error");

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.authenticated).toBe(false);
		expect(data.error).toBe("Unknown error");
	});
});
