import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/users/search/route";

// Mock node-appwrite for server-side
vi.mock("node-appwrite", () => ({
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
		search: (field: string, value: string) => `search(${field},${value})`,
	},
	Storage: vi.fn(),
}));

// Create mock databases object
const mockDatabases = {
	listDocuments: vi.fn(),
};

// Mock dependencies
vi.mock("@/lib/appwrite-admin", () => ({
	getAdminClient: vi.fn(() => ({
		databases: mockDatabases,
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			profiles: "profiles-collection",
		},
	})),
}));

vi.mock("@/lib/appwrite-profiles", () => ({
	getAvatarUrl: vi.fn((fileId: string) => `http://localhost/avatar/${fileId}`),
}));

describe("Users Search API Route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /api/users/search", () => {
		it("should search users by displayName", async () => {
			mockDatabases.listDocuments.mockResolvedValueOnce({
				documents: [],
			}).mockResolvedValueOnce({
				documents: [
					{
						userId: "user-1",
						displayName: "Alice",
						pronouns: "she/her",
						avatarFileId: "avatar-1",
					},
					{
						userId: "user-2",
						displayName: "Bob",
						avatarFileId: null,
					},
				],
			});

			const request = new NextRequest(
				"http://localhost/api/users/search?q=alice",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(2);
			expect(data.users[0].displayName).toBe("Alice");
			expect(data.users[0].avatarUrl).toBe("http://localhost/avatar/avatar-1");
		});

		it("should search by exact userId first", async () => {
			mockDatabases.listDocuments.mockResolvedValueOnce({
				documents: [
					{
						userId: "user-123",
						displayName: "Alice",
					},
				],
			});

			const request = new NextRequest(
				"http://localhost/api/users/search?q=user-123",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(1);
			expect(data.users[0].userId).toBe("user-123");
			// Should only call once (userId match), not twice
			expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(1);
		});

		it("should return 400 if query is too short", async () => {
			const request = new NextRequest(
				"http://localhost/api/users/search?q=a",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Search query must be at least 2 characters");
		});

		it("should return 400 if query is missing", async () => {
			const request = new NextRequest("http://localhost/api/users/search");

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Search query must be at least 2 characters");
		});

		it("should handle database errors", async () => {
			mockDatabases.listDocuments.mockRejectedValue(
				new Error("Database error"),
			);

			const request = new NextRequest(
				"http://localhost/api/users/search?q=alice",
			);

			const response = await GET(request);

			expect(response.status).toBe(500);
		});

		it("should limit results to 25", async () => {
			const docs = Array.from({ length: 30 }, (_, i) => ({
				userId: `user-${i}`,
				displayName: `User ${i}`,
			}));

			mockDatabases.listDocuments.mockResolvedValueOnce({
				documents: [],
			}).mockResolvedValueOnce({
				documents: docs.slice(0, 25),
			});

			const request = new NextRequest(
				"http://localhost/api/users/search?q=user",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(25);
		});
	});
});
