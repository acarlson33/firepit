import { describe, expect, it, vi, beforeEach } from "vitest";

// Setup environment before any imports
const env = process.env as Record<string, string>;
env.APPWRITE_ENDPOINT = "http://localhost";
env.APPWRITE_PROJECT_ID = "test-project";

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
	Client: class MockClient {
		setEndpoint() {
			return this;
		}
		setProject() {
			return this;
		}
		setSession() {
			return this;
		}
	},
	Account: class MockAccount {
		async get() {
			const mockUser = (globalThis as any).__mockAuthUser;
			if (mockUser === null || mockUser === undefined) {
				throw new Error("No session");
			}
			return mockUser;
		}
	},
}));

// Mock next/headers
vi.mock("next/headers", () => ({
	cookies: async () => {
		const mockCookies = (globalThis as any).__mockCookies || {};
		return {
			get: (name: string) => mockCookies[name] || null,
		};
	},
}));

// Mock appwrite-roles with dynamic function to access global state
vi.mock("../lib/appwrite-roles", () => ({
	getUserRoles: vi.fn(async (userId: string) => {
		const mockRoles = (globalThis as any).__mockUserRoles || {};
		return mockRoles[userId] || { isAdmin: false, isModerator: false };
	}),
}));

function setMockUser(user: { $id: string; name: string; email: string } | null) {
	(globalThis as any).__mockAuthUser = user;
}

function setMockCookies(cookies: Record<string, { value: string }>) {
	(globalThis as any).__mockCookies = cookies;
}

function setMockUserRoles(
	userId: string,
	roles: { isAdmin: boolean; isModerator: boolean }
) {
	const mockRoles = ((globalThis as any).__mockUserRoles ||= {});
	mockRoles[userId] = roles;
}

function clearMocks() {
	(globalThis as any).__mockAuthUser = undefined;
	(globalThis as any).__mockCookies = {};
	(globalThis as any).__mockUserRoles = {};
}

describe("auth-server", () => {
	beforeEach(() => {
		clearMocks();
		// Reset env vars
		const env = process.env as Record<string, string>;
		env.APPWRITE_ENDPOINT = "http://localhost";
		env.APPWRITE_PROJECT_ID = "test-project";
	});

	describe("getServerSession", () => {
		it("should return null when no endpoint configured", async () => {
			delete (process.env as Record<string, string>)
				.APPWRITE_ENDPOINT;

			const { getServerSession } = await import("../lib/auth-server");

			const session = await getServerSession();
			expect(session).toBeNull();
		});

		it("should return null when no project configured", async () => {
			delete (process.env as Record<string, string>)
				.APPWRITE_PROJECT_ID;

			const { getServerSession } = await import("../lib/auth-server");

			const session = await getServerSession();
			expect(session).toBeNull();
		});

		it("should return null when no session cookie exists", async () => {
			setMockCookies({});

			const { getServerSession } = await import("../lib/auth-server");

			const session = await getServerSession();
			expect(session).toBeNull();
		});

		it("should return user when valid session exists", async () => {
			const mockUser = {
				$id: "user123",
				name: "Test User",
				email: "test@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-session-token" },
			});

			const { getServerSession } = await import("../lib/auth-server");
			const session = await getServerSession();
			expect(session).toEqual(mockUser);
		});

		it("should return null when session is invalid", async () => {
			setMockUser(null);
			setMockCookies({
				"a_session_test-project": { value: "invalid-token" },
			});

			const { getServerSession } = await import("../lib/auth-server");

			const session = await getServerSession();
			expect(session).toBeNull();
		});

		it("should handle account.get() errors gracefully", async () => {
			setMockUser(null); // Will throw error
			setMockCookies({
				"a_session_test-project": { value: "some-token" },
			});

			const { getServerSession } = await import("../lib/auth-server");

			const session = await getServerSession();
			expect(session).toBeNull();
		});
	});

	describe("checkUserRoles", () => {
		it("should return user roles", async () => {
			setMockUserRoles("admin-user", { isAdmin: true, isModerator: true });

			const { checkUserRoles } = await import("../lib/auth-server");

			const roles = await checkUserRoles("admin-user");
			expect(roles.isAdmin).toBe(true);
			expect(roles.isModerator).toBe(true);
		});

		it("should return false roles for regular user", async () => {
			setMockUserRoles("regular-user", { isAdmin: false, isModerator: false });

			const { checkUserRoles } = await import("../lib/auth-server");

			const roles = await checkUserRoles("regular-user");
			expect(roles.isAdmin).toBe(false);
			expect(roles.isModerator).toBe(false);
		});
	});

	describe("requireAuth", () => {
		it("should throw when no session exists", async () => {
			setMockUser(null);
			setMockCookies({});

			const { requireAuth } = await import("../lib/auth-server");

			await expect(requireAuth()).rejects.toThrow("Unauthorized");
		});

		it("should return user when session exists", async () => {
			const mockUser = {
				$id: "user456",
				name: "Authenticated User",
				email: "auth@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-token" },
			});

			const { requireAuth } = await import("../lib/auth-server");

			const user = await requireAuth();
			expect(user).toEqual(mockUser);
		});
	});

	describe("requireAdmin", () => {
		it("should throw when user is not authenticated", async () => {
			setMockUser(null);
			setMockCookies({});

			const { requireAdmin } = await import("../lib/auth-server");

			await expect(requireAdmin()).rejects.toThrow("Unauthorized");
		});

		it("should throw when user is not admin", async () => {
			const mockUser = {
				$id: "regular-user",
				name: "Regular User",
				email: "regular@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-token" },
			});
			setMockUserRoles("regular-user", { isAdmin: false, isModerator: false });

			const { requireAdmin } = await import("../lib/auth-server");

			await expect(requireAdmin()).rejects.toThrow(
				"Forbidden: Admin access required"
			);
		});

		it("should return user and roles when user is admin", async () => {
			const mockUser = {
				$id: "admin-user",
				name: "Admin User",
				email: "admin@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-token" },
			});
			setMockUserRoles("admin-user", { isAdmin: true, isModerator: true });

			const { requireAdmin } = await import("../lib/auth-server");

			const result = await requireAdmin();
			expect(result.user).toEqual(mockUser);
			expect(result.roles.isAdmin).toBe(true);
			expect(result.roles.isModerator).toBe(true);
		});
	});

	describe("requireModerator", () => {
		it("should throw when user is not authenticated", async () => {
			setMockUser(null);
			setMockCookies({});

			const { requireModerator } = await import("../lib/auth-server");

			await expect(requireModerator()).rejects.toThrow("Unauthorized");
		});

		it("should throw when user is neither moderator nor admin", async () => {
			const mockUser = {
				$id: "regular-user",
				name: "Regular User",
				email: "regular@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-token" },
			});
			setMockUserRoles("regular-user", { isAdmin: false, isModerator: false });

			const { requireModerator } = await import("../lib/auth-server");

			await expect(requireModerator()).rejects.toThrow(
				"Forbidden: Moderator access required"
			);
		});

		it("should return user and roles when user is moderator", async () => {
			const mockUser = {
				$id: "mod-user",
				name: "Mod User",
				email: "mod@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-token" },
			});
			setMockUserRoles("mod-user", { isAdmin: false, isModerator: true });

			const { requireModerator } = await import("../lib/auth-server");

			const result = await requireModerator();
			expect(result.user).toEqual(mockUser);
			expect(result.roles.isModerator).toBe(true);
		});

		it("should return user and roles when user is admin", async () => {
			const mockUser = {
				$id: "admin-user",
				name: "Admin User",
				email: "admin@example.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "valid-token" },
			});
			setMockUserRoles("admin-user", { isAdmin: true, isModerator: true });

			const { requireModerator } = await import("../lib/auth-server");

			const result = await requireModerator();
			expect(result.user).toEqual(mockUser);
			expect(result.roles.isAdmin).toBe(true);
			expect(result.roles.isModerator).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle malformed user object", async () => {
			setMockUser({ $id: "test", name: "", email: "" });
			setMockCookies({
				"a_session_test-project": { value: "token" },
			});

			const { getServerSession } = await import("../lib/auth-server");

			const session = await getServerSession();
			expect(session).toHaveProperty("$id");
		});

		it("should handle concurrent requireAdmin calls", async () => {
			const mockUser = {
				$id: "admin",
				name: "Admin",
				email: "admin@test.com",
			};

			setMockUser(mockUser);
			setMockCookies({
				"a_session_test-project": { value: "token" },
			});
			setMockUserRoles("admin", { isAdmin: true, isModerator: true });

			const { requireAdmin } = await import("../lib/auth-server");

			const results = await Promise.all([
				requireAdmin(),
				requireAdmin(),
				requireAdmin(),
			]);

			expect(results).toHaveLength(3);
			results.forEach((result) => {
				expect(result.roles.isAdmin).toBe(true);
			});
		});
	});
});
