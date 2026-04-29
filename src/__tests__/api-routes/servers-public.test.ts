/**
 * Tests for GET /api/servers/public endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/servers/public/route";

// Create mock databases object at module level
const mockDatabases = {
	listDocuments: vi.fn(),
};

// Mock membership counting
const mockGetActualMemberCounts = vi.fn();

// Mock dependencies
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
			memberships: "memberships-collection",
		},
	})),
}));

vi.mock("@/lib/membership-count", () => ({
	getActualMemberCounts: (
		databases: unknown,
		serverIds: string[],
	) => mockGetActualMemberCounts(databases, serverIds),
}));

vi.mock("node-appwrite", () => ({
	Query: {
		equal: (field: string, value: unknown) => `equal(${field},${String(value)})`,
		limit: (n: number) => `limit(${n})`,
		orderDesc: (field: string) => `orderDesc(${field})`,
	},
}));

describe("GET /api/servers/public", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetActualMemberCounts.mockResolvedValue(new Map());
	});

	it("should fetch public servers successfully", async () => {
		const mockServers = [
			{
				$id: "server1",
				name: "Public Server 1",
				ownerId: "owner1",
				isPublic: true,
				memberCount: 50,
				$createdAt: "2024-01-01T00:00:00.000Z",
			},
			{
				$id: "server2",
				name: "Public Server 2",
				ownerId: "owner2",
				isPublic: false,
				memberCount: 25,
				$createdAt: "2024-01-02T00:00:00.000Z",
			},
		];

		// Mock server list
		mockDatabases.listDocuments.mockResolvedValue({ documents: mockServers, total: 2 });

		// Mock batched member counts
		mockGetActualMemberCounts.mockResolvedValue(
			new Map([["server1", 50]]),
		);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.servers).toHaveLength(1);
		expect(data.servers[0]).toEqual({
			$createdAt: "2024-01-01T00:00:00.000Z",
			$id: "server1",
			defaultOnSignup: false,
			name: "Public Server 1",
			ownerId: "owner1",
			memberCount: 50,
			isPublic: true,
		});
		expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
			"test-db",
			"servers-collection",
			expect.arrayContaining([
				expect.stringContaining("equal(isPublic,true)"),
				expect.stringContaining("limit"),
				expect.stringContaining("orderDesc"),
			])
		);
		expect(mockGetActualMemberCounts).toHaveBeenCalledWith(mockDatabases, ["server1"]);
	});

	it("should exclude legacy servers with missing visibility", async () => {
		const mockServers = [
			{
				$id: "server1",
				name: "Server Without Count",
				ownerId: "owner1",
				$createdAt: "2024-01-01T00:00:00.000Z",
			},
		];

		mockDatabases.listDocuments.mockResolvedValue({ documents: mockServers, total: 1 });
		mockGetActualMemberCounts.mockResolvedValue(
			new Map([["server1", 0]]),
		);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.servers).toEqual([]);
	});

	it("should return empty array when no servers exist", async () => {
		mockDatabases.listDocuments.mockResolvedValue({ documents: [] });

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.servers).toEqual([]);
	});

	it("should handle database errors", async () => {
		mockDatabases.listDocuments.mockRejectedValue(new Error("Database connection failed"));

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Database connection failed");
	});

	it("should handle non-Error exceptions", async () => {
		mockDatabases.listDocuments.mockRejectedValue("Unknown error");

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch servers");
	});

	it("should convert all fields to proper types", async () => {
		const mockServers = [
			{
				$id: "123", // Appwrite always returns strings for $id
				name: "Test Server",
				ownerId: "owner1",
				isPublic: true,
				memberCount: 50, // Valid number
			},
		];

		mockDatabases.listDocuments.mockResolvedValue({ documents: mockServers });

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(typeof data.servers[0].$id).toBe("string");
		expect(typeof data.servers[0].name).toBe("string");
		expect(typeof data.servers[0].ownerId).toBe("string");
		expect(typeof data.servers[0].memberCount).toBe("number");
	});
});
