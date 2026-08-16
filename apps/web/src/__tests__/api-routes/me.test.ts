/**
 * Tests for GET /api/me endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/me/route";

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: vi.fn(),
}));

vi.mock("@/lib/appwrite-roles", () => ({
	getUserRoles: vi.fn(),
}));

import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";

describe("GET /api/me", () => {
	let mockGetServerSession: any;
	let mockGetUserRoles: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		const authServer = await import("@/lib/auth-server");
		const rolesLib = await import("@/lib/appwrite-roles");
		mockGetServerSession = authServer.getServerSession;
		mockGetUserRoles = rolesLib.getUserRoles;
	});

	it("should return 401 if user is not authenticated", async () => {
		mockGetServerSession.mockResolvedValue(null);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe("Not authenticated");
	});

	it("should return user info for authenticated user", async () => {
		const mockUser = {
			$id: "user123",
			name: "Test User",
			email: "test@example.com",
		};

		mockGetServerSession.mockResolvedValue(mockUser);
		mockGetUserRoles.mockResolvedValue({
			isAdmin: true,
			isModerator: false,
		});

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.userId).toBe("user123");
		expect(data.name).toBe("Test User");
		expect(data.email).toBe("test@example.com");
		expect(data.roles.isAdmin).toBe(true);
		expect(data.roles.isModerator).toBe(false);
	});

	it("should include helpful message for admin setup", async () => {
		const mockUser = {
			$id: "user456",
			name: "Admin User",
			email: "admin@example.com",
		};

		mockGetServerSession.mockResolvedValue(mockUser);
		mockGetUserRoles.mockResolvedValue({
			isAdmin: false,
			isModerator: false,
		});

		const response = await GET();
		const data = await response.json();

		expect(data.message).toContain("APPWRITE_ADMIN_USER_IDS");
	});

	it("should call getUserRoles with correct userId", async () => {
		const mockUser = {
			$id: "user789",
			name: "Another User",
			email: "another@example.com",
		};

		mockGetServerSession.mockResolvedValue(mockUser);
		mockGetUserRoles.mockResolvedValue({
			isAdmin: false,
			isModerator: true,
		});

		await GET();

		expect(mockGetUserRoles).toHaveBeenCalledWith("user789");
	});

	it("should return roles for moderator", async () => {
		const mockUser = {
			$id: "mod123",
			name: "Moderator",
			email: "mod@example.com",
		};

		mockGetServerSession.mockResolvedValue(mockUser);
		mockGetUserRoles.mockResolvedValue({
			isAdmin: false,
			isModerator: true,
		});

		const response = await GET();
		const data = await response.json();

		expect(data.roles.isAdmin).toBe(false);
		expect(data.roles.isModerator).toBe(true);
	});

	it("should handle user with both admin and moderator roles", async () => {
		const mockUser = {
			$id: "superuser",
			name: "Super User",
			email: "super@example.com",
		};

		mockGetServerSession.mockResolvedValue(mockUser);
		mockGetUserRoles.mockResolvedValue({
			isAdmin: true,
			isModerator: true,
		});

		const response = await GET();
		const data = await response.json();

		expect(data.roles.isAdmin).toBe(true);
		expect(data.roles.isModerator).toBe(true);
	});

	it("should handle user with no special roles", async () => {
		const mockUser = {
			$id: "regular123",
			name: "Regular User",
			email: "regular@example.com",
		};

		mockGetServerSession.mockResolvedValue(mockUser);
		mockGetUserRoles.mockResolvedValue({
			isAdmin: false,
			isModerator: false,
		});

		const response = await GET();
		const data = await response.json();

		expect(data.roles.isAdmin).toBe(false);
		expect(data.roles.isModerator).toBe(false);
	});
});
