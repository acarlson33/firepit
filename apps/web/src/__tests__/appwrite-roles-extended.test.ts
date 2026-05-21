import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock node-appwrite and appwrite with comprehensive team membership support
vi.mock("node-appwrite", () => ({
	Client: class MockClient {
		setEndpoint() {
			return this;
		}
		setProject() {
			return this;
		}
		setKey() {
			return this;
		}
	},
	Teams: class MockTeams {
		async listMemberships(teamId: string, _queries?: string[]) {
			const mockTeams = (globalThis as any).__mockTeamData || {};
			const members = mockTeams[teamId] || [];
			return { memberships: members, total: members.length };
		}
	},
	Databases: class MockDatabases {},
	Query: {
		limit: (n: number) => `limit(${n})`,
		offset: (n: number) => `offset(${n})`,
	},
}));

vi.mock("appwrite", () => ({
	Client: class MockClient {
		setEndpoint() {
			return this;
		}
		setProject() {
			return this;
		}
	},
	Teams: class MockTeams {
		async listMemberships(teamId: string, _queries?: string[]) {
			const mockTeams = (globalThis as any).__mockTeamData || {};
			const members = mockTeams[teamId] || [];
			return { memberships: members, total: members.length };
		}
	},
	Query: {
		limit: (n: number) => `limit(${n})`,
		offset: (n: number) => `offset(${n})`,
	},
}));

function setupEnv() {
	const env = process.env as Record<string, string>;
	env.APPWRITE_ENDPOINT = "http://localhost";
	env.APPWRITE_PROJECT_ID = "test-project";
	env.APPWRITE_DATABASE_ID = "test-db";
	env.APPWRITE_ADMIN_TEAM_ID = "team-admin";
	env.APPWRITE_MODERATOR_TEAM_ID = "team-mod";
	env.APPWRITE_API_KEY = "test-api-key";
}

function setTeamMemberships(
	teamId: string,
	userIds: string[]
) {
	const mockData = ((globalThis as any).__mockTeamData ||= {});
	mockData[teamId] = userIds.map((userId) => ({ userId }));
}

function clearTeamMemberships() {
	(globalThis as any).__mockTeamData = {};
}

describe("appwrite-roles - Extended Coverage", () => {
	beforeEach(() => {
		setupEnv();
		clearTeamMemberships();

		// Clear role tag cache
		const g = globalThis as any;
		if (g.__roleTagCache) {
			g.__roleTagCache.clear();
		}
	});

	afterEach(() => {
		clearTeamMemberships();
	});

	describe("getUserRoles", () => {
		it("should return false roles for null userId", async () => {
			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result = await getUserRoles(null);

			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(false);
		});

		it("should identify admin user from team membership", async () => {
			setTeamMemberships("team-admin", ["user-admin-1"]);

			const { getUserRoles } = await import("../lib/appwrite-roles");
			const result = await getUserRoles("user-admin-1");

			expect(result.isAdmin).toBe(true);
			expect(result.isModerator).toBe(true); // Admin implies moderator
		});

		it("should identify moderator user from team membership", async () => {
			setTeamMemberships("team-mod", ["user-mod-1"]);

			const { getUserRoles } = await import("../lib/appwrite-roles");
			const result = await getUserRoles("user-mod-1");

			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(true);
		});

		it("should return false roles for regular user", async () => {
			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result = await getUserRoles("regular-user");

			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(false);
		});

		it("should handle admin overrides from environment", async () => {
			(process.env as Record<string, string>).APPWRITE_ADMIN_USER_IDS =
				"override-admin-1,override-admin-2";


			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result = await getUserRoles("override-admin-1");

			expect(result.isAdmin).toBe(true);
			expect(result.isModerator).toBe(true);
		});

		it("should handle moderator overrides from environment", async () => {
			(process.env as Record<string, string>).APPWRITE_MODERATOR_USER_IDS =
				"override-mod-1";


			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result = await getUserRoles("override-mod-1");

			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(true);
		});

		it("should handle empty team IDs gracefully", async () => {
			delete (process.env as Record<string, string>)
				.APPWRITE_ADMIN_TEAM_ID;
			delete (process.env as Record<string, string>)
				.APPWRITE_MODERATOR_TEAM_ID;


			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result = await getUserRoles("user1");

			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(false);
		});

		it("should handle both admin and moderator team memberships", async () => {
			setTeamMemberships("team-admin", ["user-both"]);
			setTeamMemberships("team-mod", ["user-both"]);

			const { getUserRoles } = await import("../lib/appwrite-roles");
			const result = await getUserRoles("user-both");

			expect(result.isAdmin).toBe(true);
			expect(result.isModerator).toBe(true);
		});
	});

	describe("getUserRoleTags", () => {
		it("should return empty tags for null userId", async () => {
			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			const result = await getUserRoleTags(null);

			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(false);
			expect(result.tags).toEqual([]);
		});

		it("should add implicit admin tag when user is admin", async () => {
			setTeamMemberships("team-admin", ["admin-user"]);

			const { getUserRoleTags } = await import("../lib/appwrite-roles");
			const result = await getUserRoleTags("admin-user");

			expect(result.isAdmin).toBe(true);
			expect(result.tags.some((t) => t.label === "Admin")).toBe(true);
		});

		it("should add implicit mod tag when user is moderator", async () => {
			setTeamMemberships("team-mod", ["mod-user"]);

			const { getUserRoleTags } = await import("../lib/appwrite-roles");
			const result = await getUserRoleTags("mod-user");

			expect(result.isModerator).toBe(true);
			expect(result.tags.some((t) => t.label === "Mod")).toBe(true);
		});

		it("should cache role tags for subsequent calls", async () => {
			setTeamMemberships("team-admin", ["cached-user"]);

			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			// First call
			const result1 = await getUserRoleTags("cached-user");
			expect(result1.isAdmin).toBe(true);

			// Change underlying data
			clearTeamMemberships();

			// Second call should return cached value
			const result2 = await getUserRoleTags("cached-user");
			expect(result2.isAdmin).toBe(true); // Still cached
		});

		it("should parse custom team map from environment", async () => {
			(process.env as Record<string, string>).ROLE_TEAM_MAP =
				JSON.stringify({
					"team-vip": { label: "VIP", color: "bg-purple-600" },
				});
			setTeamMemberships("team-vip", ["vip-user"]);


			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			const result = await getUserRoleTags("vip-user");

			expect(result.tags.some((t) => t.label === "VIP")).toBe(true);
			const vipTag = result.tags.find((t) => t.label === "VIP");
			expect(vipTag?.color).toBe("bg-purple-600");
		});

		it("should handle invalid JSON in team map gracefully", async () => {
			(process.env as Record<string, string>).ROLE_TEAM_MAP =
				"invalid-json{";


			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			// Should not throw
			const result = await getUserRoleTags("user1");
			expect(result.tags).toBeDefined();
		});

		it("should not duplicate implicit tags", async () => {
			(process.env as Record<string, string>).ROLE_TEAM_MAP =
				JSON.stringify({
					"team-custom-admin": { label: "Admin", color: "bg-blue-600" },
				});
			setTeamMemberships("team-admin", ["admin-user"]);
			setTeamMemberships("team-custom-admin", ["admin-user"]);


			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			const result = await getUserRoleTags("admin-user");

			const adminTags = result.tags.filter(
				(t) => t.label.toLowerCase() === "admin"
			);
			// Should have custom admin tag, but not duplicate implicit one
			expect(adminTags.length).toBe(1);
		});

		it("should include both admin and mod implicit tags", async () => {
			setTeamMemberships("team-admin", ["super-user"]);

			const { getUserRoleTags } = await import("../lib/appwrite-roles");
			const result = await getUserRoleTags("super-user");

			expect(result.isAdmin).toBe(true);
			expect(result.isModerator).toBe(true);
			expect(result.tags.some((t) => t.label === "Admin")).toBe(true);
			expect(result.tags.some((t) => t.label === "Mod")).toBe(true);
		});
	});

	describe("Cache Behavior", () => {
		it("should expire cache after TTL", async () => {
			setTeamMemberships("team-admin", ["test-user"]);

			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			// First call
			const result1 = await getUserRoleTags("test-user");
			expect(result1.isAdmin).toBe(true);

			// Mock cache to be expired
			const g = globalThis as any;
			const cache = g.__roleTagCache;
			if (cache) {
				const entry = cache.get("test-user");
				if (entry) {
					entry.expires = Date.now() - 1000; // Expired 1 second ago
				}
			}

			// Clear team memberships
			clearTeamMemberships();

			// Should fetch fresh data
			const result2 = await getUserRoleTags("test-user");
			expect(result2.isAdmin).toBe(false); // No longer admin
		});

		it("should cache different users separately", async () => {
			setTeamMemberships("team-admin", ["admin-user"]);
			setTeamMemberships("team-mod", ["mod-user"]);

			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			const result1 = await getUserRoleTags("admin-user");
			const result2 = await getUserRoleTags("mod-user");

			expect(result1.isAdmin).toBe(true);
			expect(result1.isModerator).toBe(true);

			expect(result2.isAdmin).toBe(false);
			expect(result2.isModerator).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle large team with pagination", async () => {
			// Create a large team that would require pagination
			const largeTeam = Array.from({ length: 150 }, (_, i) => `user-${i}`);
			setTeamMemberships("team-admin", largeTeam);

			const { getUserRoles } = await import("../lib/appwrite-roles");

			// Test user at the end of the list
			const result = await getUserRoles("user-140");
			expect(result.isAdmin).toBe(true);
		});

		it("should handle comma-separated admin overrides with spaces", async () => {
			(process.env as Record<string, string>).APPWRITE_ADMIN_USER_IDS =
				" user1 , user2 ,user3  ";


			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result1 = await getUserRoles("user1");
			const result2 = await getUserRoles("user2");
			const result3 = await getUserRoles("user3");

			expect(result1.isAdmin).toBe(true);
			expect(result2.isAdmin).toBe(true);
			expect(result3.isAdmin).toBe(true);
		});

		it("should handle empty override strings", async () => {
			(process.env as Record<string, string>).APPWRITE_ADMIN_USER_IDS = "";
			(process.env as Record<string, string>).APPWRITE_MODERATOR_USER_IDS = "";


			const { getUserRoles } = await import("../lib/appwrite-roles");

			const result = await getUserRoles("user1");
			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(false);
		});

		it("should handle API failures gracefully", async () => {
			// Mock API to throw errors
			vi.doMock("appwrite", () => ({
				Client: class MockClient {
					setEndpoint() {
						return this;
					}
					setProject() {
						return this;
					}
				},
				Teams: class MockTeams {
					async listMemberships() {
						throw new Error("API Error");
					}
				},
				Query: {
					limit: (n: number) => `limit(${n})`,
					offset: (n: number) => `offset(${n})`,
				},
			}));


			const { getUserRoles } = await import("../lib/appwrite-roles");

			// Should not throw, returns false roles
			const result = await getUserRoles("user1");
			expect(result.isAdmin).toBe(false);
			expect(result.isModerator).toBe(false);
		});

		it("should handle multiple custom teams", async () => {
			(process.env as Record<string, string>).ROLE_TEAM_MAP =
				JSON.stringify({
					"team-gold": { label: "Gold", color: "bg-yellow-600" },
					"team-silver": { label: "Silver", color: "bg-gray-400" },
					"team-bronze": { label: "Bronze", color: "bg-orange-700" },
				});

			setTeamMemberships("team-gold", ["rich-user"]);
			setTeamMemberships("team-silver", ["rich-user"]);


			const { getUserRoleTags } = await import("../lib/appwrite-roles");

			const result = await getUserRoleTags("rich-user");

			expect(result.tags.some((t) => t.label === "Gold")).toBe(true);
			expect(result.tags.some((t) => t.label === "Silver")).toBe(true);
			expect(result.tags.some((t) => t.label === "Bronze")).toBe(false);
		});
	});

	describe("Integration Scenarios", () => {
		it("should handle full role lifecycle", async () => {
			// Start as regular user
			const { getUserRoles } = await import(
				"../lib/appwrite-roles"
			);

			let result = await getUserRoles("lifecycle-user");
			expect(result.isAdmin).toBe(false);

			// Promote to moderator
			clearTeamMemberships();
			setTeamMemberships("team-mod", ["lifecycle-user"]);

			const { getUserRoles: getRoles2 } = await import("../lib/appwrite-roles");

			result = await getRoles2("lifecycle-user");
			expect(result.isModerator).toBe(true);
			expect(result.isAdmin).toBe(false);
		});

		it("should work without API key (browser mode)", async () => {
			delete (process.env as Record<string, string>).APPWRITE_API_KEY;


			const { getUserRoles } = await import("../lib/appwrite-roles");

			// Should still work, just using browser client
			const result = await getUserRoles("user1");
			expect(result).toHaveProperty("isAdmin");
			expect(result).toHaveProperty("isModerator");
		});
	});
});
