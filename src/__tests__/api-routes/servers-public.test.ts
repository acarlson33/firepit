/**
 * Tests for GET /api/servers/public endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
    getActualMemberCounts: (databases: unknown, serverIds: string[]) =>
        mockGetActualMemberCounts(databases, serverIds),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: unknown) =>
            `equal(${field},${String(value)})`,
        limit: (n: number) => `limit(${n})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
        cursorAfter: (value: string) => `cursorAfter(${value})`,
    },
}));

function createRequest(url: string = "http://localhost/api/servers/public") {
    return new NextRequest(url);
}

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
        mockDatabases.listDocuments.mockResolvedValue({
            documents: mockServers,
            total: 2,
        });

        // Mock batched member counts
        mockGetActualMemberCounts.mockResolvedValue(new Map([["server1", 50]]));

        const response = await GET(createRequest());
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
            ]),
        );
        expect(mockGetActualMemberCounts).toHaveBeenCalledWith(mockDatabases, [
            "server1",
        ]);
    });

    it("should paginate public servers with cursor", async () => {
        const pageOneServers = [
            {
                $id: "server3",
                name: "Public Server 3",
                ownerId: "owner3",
                isPublic: true,
                memberCount: 30,
                $createdAt: "2024-01-03T00:00:00.000Z",
            },
            {
                $id: "server2",
                name: "Public Server 2",
                ownerId: "owner2",
                isPublic: true,
                memberCount: 20,
                $createdAt: "2024-01-02T00:00:00.000Z",
            },
            {
                $id: "server1",
                name: "Public Server 1",
                ownerId: "owner1",
                isPublic: true,
                memberCount: 10,
                $createdAt: "2024-01-01T00:00:00.000Z",
            },
        ];

        mockDatabases.listDocuments
            .mockResolvedValueOnce({ documents: pageOneServers, total: 3 })
            .mockResolvedValueOnce({
                documents: [pageOneServers[2]],
                total: 1,
            });

        mockGetActualMemberCounts
            .mockResolvedValueOnce(
                new Map([
                    ["server3", 30],
                    ["server2", 20],
                ]),
            )
            .mockResolvedValueOnce(new Map([["server1", 10]]));

        const firstResponse = await GET(
            createRequest("http://localhost/api/servers/public?limit=2"),
        );
        const firstData = await firstResponse.json();

        expect(firstResponse.status).toBe(200);
        expect(firstData).toMatchObject({
            nextCursor: "server2",
            count: 2,
        });
        expect(
            firstData.servers.map((server: { $id: string }) => server.$id),
        ).toEqual(["server3", "server2"]);

        const secondResponse = await GET(
            createRequest(
                `http://localhost/api/servers/public?limit=2&cursor=${String(firstData.nextCursor)}`,
            ),
        );
        const secondData = await secondResponse.json();

        expect(secondResponse.status).toBe(200);
        expect(secondData).toMatchObject({
            nextCursor: null,
            count: 1,
        });
        expect(
            secondData.servers.map((server: { $id: string }) => server.$id),
        ).toEqual(["server1"]);
        expect(mockDatabases.listDocuments).toHaveBeenNthCalledWith(
            2,
            "test-db",
            "servers-collection",
            expect.arrayContaining([
                expect.stringContaining("cursorAfter(server2)"),
            ]),
        );
    });

    it("should paginate search results after the cursor boundary", async () => {
        const searchServers = [
            {
                $id: "server4",
                name: "Alpha Server",
                ownerId: "owner4",
                isPublic: true,
                memberCount: 40,
                $createdAt: "2024-01-04T00:00:00.000Z",
            },
            {
                $id: "server3",
                name: "Beta Server 3",
                ownerId: "owner3",
                isPublic: true,
                memberCount: 30,
                $createdAt: "2024-01-03T00:00:00.000Z",
            },
            {
                $id: "server2",
                name: "Beta Server 2",
                ownerId: "owner2",
                isPublic: true,
                memberCount: 20,
                $createdAt: "2024-01-02T00:00:00.000Z",
            },
            {
                $id: "server1",
                name: "Beta Server 1",
                ownerId: "owner1",
                isPublic: true,
                memberCount: 10,
                $createdAt: "2024-01-01T00:00:00.000Z",
            },
        ];

        mockDatabases.listDocuments.mockResolvedValueOnce({
            documents: searchServers,
            total: 4,
        });
        mockGetActualMemberCounts.mockResolvedValueOnce(
            new Map([
                ["server3", 30],
                ["server2", 20],
            ]),
        );

        const response = await GET(
            createRequest(
                "http://localhost/api/servers/public?search=beta&cursor=server4&limit=2",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toMatchObject({
            nextCursor: "server2",
            count: 2,
        });
        expect(
            data.servers.map((server: { $id: string }) => server.$id),
        ).toEqual(["server3", "server2"]);
        expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
            "test-db",
            "servers-collection",
            expect.arrayContaining([
                expect.stringContaining("cursorAfter(server4)"),
            ]),
        );
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

        mockDatabases.listDocuments.mockResolvedValue({
            documents: mockServers,
            total: 1,
        });
        mockGetActualMemberCounts.mockResolvedValue(new Map([["server1", 0]]));

        const response = await GET(createRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.servers).toEqual([]);
    });

    it("should return empty array when no servers exist", async () => {
        mockDatabases.listDocuments.mockResolvedValue({ documents: [] });

        const response = await GET(createRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.servers).toEqual([]);
    });

    it("should handle database errors", async () => {
        mockDatabases.listDocuments.mockRejectedValue(
            new Error("Database connection failed"),
        );

        const response = await GET(createRequest());
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to fetch servers");
    });

    it("should handle non-Error exceptions", async () => {
        mockDatabases.listDocuments.mockRejectedValue("Unknown error");

        const response = await GET(createRequest());
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

        mockDatabases.listDocuments.mockResolvedValue({
            documents: mockServers,
        });

        const response = await GET(createRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(typeof data.servers[0].$id).toBe("string");
        expect(typeof data.servers[0].name).toBe("string");
        expect(typeof data.servers[0].ownerId).toBe("string");
        expect(typeof data.servers[0].memberCount).toBe("number");
    });
});
