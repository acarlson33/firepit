import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/servers/route";

// Mock node-appwrite for server-side
vi.mock("node-appwrite", () => ({
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
		orderAsc: (field: string) => `orderAsc(${field})`,
		cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
	},
}));

// Create mock databases object at module level
const mockDatabases = {
	listDocuments: vi.fn(),
};

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: vi.fn(),
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: mockDatabases,
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			servers: "servers-collection",
		},
	})),
}));

vi.mock("@/lib/appwrite-servers", () => ({
	listMembershipsForUser: vi.fn(),
}));

describe("Servers API Route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /api/servers", () => {
		it("should return list of servers", async () => {
			mockDatabases.listDocuments.mockResolvedValue({
				total: 2,
				documents: [
					{
						$id: "server-1",
						name: "Test Server",
						ownerId: "user-1",
						description: "A test server",
						$createdAt: "2024-01-01T00:00:00.000Z",
						$updatedAt: "2024-01-01T00:00:00.000Z",
					},
					{
						$id: "server-2",
						name: "Another Server",
						ownerId: "user-2",
						description: "Another server",
						$createdAt: "2024-01-02T00:00:00.000Z",
						$updatedAt: "2024-01-02T00:00:00.000Z",
					},
				],
			});

		const request = new NextRequest("http://localhost/api/servers");

		const response = await GET(request);
		const data = await response.json();

		if (response.status !== 200) {
			console.error("Servers test error:", data);
		}

		expect(response.status).toBe(200);
		expect(data.servers).toHaveLength(2);
		expect(data.servers[0].name).toBe("Test Server");
		});

		it("should support pagination with limit", async () => {
			mockDatabases.listDocuments.mockResolvedValue({
				total: 1,
				documents: [
					{
						$id: "server-1",
						name: "Test Server",
						ownerId: "user-1",
						description: "A test server",
						$createdAt: "2024-01-01T00:00:00.000Z",
						$updatedAt: "2024-01-01T00:00:00.000Z",
					},
				],
			});

			const request = new NextRequest("http://localhost/api/servers?limit=10");

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.servers).toHaveLength(1);
		});

		it("should support pagination with cursor", async () => {
			mockDatabases.listDocuments.mockResolvedValue({
				total: 1,
				documents: [
					{
						$id: "server-3",
						name: "Server 3",
						ownerId: "user-1",
						description: "Third server",
						$createdAt: "2024-01-03T00:00:00.000Z",
						$updatedAt: "2024-01-03T00:00:00.000Z",
					},
				],
			});

			const request = new NextRequest(
				"http://localhost/api/servers?cursor=cursor-123",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.servers).toHaveLength(1);
		});
	});
});
