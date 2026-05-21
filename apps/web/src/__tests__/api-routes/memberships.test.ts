/**
 * Tests for /api/memberships endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Create persistent mocks
const { mockListDocuments, mockGetServerSession } = vi.hoisted(() => ({
	mockListDocuments: vi.fn(),
	mockGetServerSession: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			listDocuments: mockListDocuments,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			memberships: "memberships-collection",
		},
	})),
}));

vi.mock("node-appwrite", () => ({
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
	},
}));

describe("Memberships API", () => {
	let GET: () => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handler
		const module = await import("../../app/api/memberships/route");
		GET = module.GET;
	});

	describe("GET /api/memberships", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should fetch all memberships for authenticated user", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockListDocuments.mockResolvedValue({
				documents: [
					{
						$id: "membership-1",
						serverId: "server-1",
						userId: "user-1",
						role: "owner",
						$createdAt: "2024-01-01T00:00:00.000Z",
					},
					{
						$id: "membership-2",
						serverId: "server-2",
						userId: "user-1",
						role: "member",
						$createdAt: "2024-01-02T00:00:00.000Z",
					},
				],
			});

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.memberships).toHaveLength(2);
			expect(data.memberships[0].$id).toBe("membership-1");
			expect(data.memberships[0].serverId).toBe("server-1");
			expect(data.memberships[0].role).toBe("owner");
			expect(data.memberships[1].$id).toBe("membership-2");
			expect(data.memberships[1].role).toBe("member");

			expect(mockListDocuments).toHaveBeenCalledWith(
				"test-db",
				"memberships-collection",
				expect.arrayContaining([
					expect.stringContaining("user-1"),
					expect.stringContaining("limit"),
				])
			);
		});

		it("should return empty array if user has no memberships", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockListDocuments.mockResolvedValue({
				documents: [],
			});

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.memberships).toEqual([]);
		});

		it("should handle errors gracefully", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockListDocuments.mockRejectedValue(new Error("Database error"));

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBeTruthy();
		});

		it("should return empty array if memberships collection is not configured", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			// Re-mock the config to return no memberships collection
			vi.doMock("@/lib/appwrite-core", () => ({
				getEnvConfig: vi.fn(() => ({
					databaseId: "test-db",
					collections: {
						memberships: undefined,
					},
				})),
			}));

			// Re-import to get new config
			vi.resetModules();
			const module = await import("../../app/api/memberships/route");
			const GET2 = module.GET;

			const response = await GET2();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.memberships).toEqual([]);
		});
	});
});
