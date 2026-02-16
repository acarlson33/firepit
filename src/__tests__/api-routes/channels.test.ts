/**
 * Tests for GET /api/channels endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/channels/route";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockListDocuments, mockGetDocument } = vi.hoisted(
    () => ({
        mockGetServerSession: vi.fn(),
        mockListDocuments: vi.fn(),
        mockGetDocument: vi.fn(),
    }),
);

// Mock dependencies
vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
            getDocument: mockGetDocument,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            servers: "servers-collection",
            memberships: "memberships-collection",
            channels: "channels-collection",
        },
    })),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

describe("GET /api/channels", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue({
            $id: "user-1",
            name: "Test User",
        });
        mockGetDocument.mockResolvedValue({
            $id: "server1",
            ownerId: "user-1",
        });
        mockListDocuments.mockResolvedValue({ documents: [] });
    });

    it("should return 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("should return 400 if serverId is missing", async () => {
        const request = new NextRequest("http://localhost:3000/api/channels");

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("serverId is required");
    });

    it("should fetch channels for a given serverId", async () => {
        const mockChannels = [
            {
                $id: "channel1",
                serverId: "server1",
                name: "general",
                $createdAt: "2024-01-01T00:00:00.000Z",
            },
            {
                $id: "channel2",
                serverId: "server1",
                name: "random",
                $createdAt: "2024-01-02T00:00:00.000Z",
            },
        ];

        mockListDocuments.mockResolvedValue({
            documents: mockChannels,
        });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channels).toHaveLength(2);
        expect(data.channels[0].$id).toBe("channel1");
        expect(data.channels[1].$id).toBe("channel2");
        expect(data.nextCursor).toBeNull();
    });

    it("should return 403 for non-members who are not server owner", async () => {
        mockGetDocument.mockResolvedValue({
            $id: "server1",
            ownerId: "owner-1",
        });

        mockListDocuments
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValue({ documents: [] });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("should filter channels by readMessages permission", async () => {
        mockGetDocument.mockResolvedValue({
            $id: "server1",
            ownerId: "owner-1",
        });

        mockListDocuments
            // membership lookup
            .mockResolvedValueOnce({ documents: [{ $id: "m1" }] })
            // channels lookup
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "channel1",
                        serverId: "server1",
                        name: "general",
                        $createdAt: "2024-01-01T00:00:00.000Z",
                    },
                    {
                        $id: "channel2",
                        serverId: "server1",
                        name: "admin",
                        $createdAt: "2024-01-02T00:00:00.000Z",
                    },
                ],
            })
            // role assignment lookup
            .mockResolvedValueOnce({
                documents: [{ roleIds: ["role-member"] }],
            })
            // roles lookup
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "role-member",
                        serverId: "server1",
                        name: "Member",
                        position: 1,
                        readMessages: false,
                        sendMessages: true,
                        manageMessages: false,
                        manageChannels: false,
                        manageRoles: false,
                        manageServer: false,
                        mentionEveryone: false,
                        administrator: false,
                        mentionable: true,
                        $createdAt: "2024-01-01T00:00:00.000Z",
                    },
                ],
            })
            // channel overrides lookup
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "ov1",
                        channelId: "channel2",
                        roleId: "role-member",
                        allow: ["readMessages"],
                        deny: [],
                        $createdAt: "2024-01-01T00:00:00.000Z",
                    },
                ],
            });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channels).toHaveLength(1);
        expect(data.channels[0].$id).toBe("channel2");
    });

    it("should apply default limit of 50", async () => {
        mockListDocuments.mockResolvedValue({ documents: [] });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        await GET(request);

        expect(mockListDocuments).toHaveBeenCalledWith(
            "test-db",
            "channels-collection",
            expect.arrayContaining([expect.stringContaining("limit")]),
        );
    });

    it("should use custom limit if provided", async () => {
        mockListDocuments.mockResolvedValue({ documents: [] });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1&limit=10",
        );

        await GET(request);

        expect(mockListDocuments).toHaveBeenCalledWith(
            "test-db",
            "channels-collection",
            expect.arrayContaining([expect.stringContaining("limit")]),
        );
    });

    it("should return nextCursor when results match limit", async () => {
        const mockChannels = Array.from({ length: 10 }, (_, i) => ({
            $id: `channel${i}`,
            serverId: "server1",
            name: `channel-${i}`,
            $createdAt: `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        }));

        mockListDocuments.mockResolvedValue({ documents: mockChannels });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1&limit=10",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channels).toHaveLength(10);
        expect(data.nextCursor).toBe("channel9");
    });

    it("should return null nextCursor when results are less than limit", async () => {
        const mockChannels = [
            {
                $id: "channel1",
                serverId: "server1",
                name: "general",
                $createdAt: "2024-01-01T00:00:00.000Z",
            },
        ];

        mockListDocuments.mockResolvedValue({ documents: mockChannels });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1&limit=10",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channels).toHaveLength(1);
        expect(data.nextCursor).toBeNull();
    });

    it("should use cursor for pagination", async () => {
        mockListDocuments.mockResolvedValue({ documents: [] });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1&cursor=channel5",
        );

        await GET(request);

        expect(mockListDocuments).toHaveBeenCalledWith(
            "test-db",
            "channels-collection",
            expect.arrayContaining([expect.stringContaining("cursorAfter")]),
        );
    });

    it("should handle database errors gracefully", async () => {
        mockListDocuments.mockRejectedValue(
            new Error("Database connection failed"),
        );

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Database connection failed");
    });

    it("should handle non-Error exceptions", async () => {
        mockListDocuments.mockRejectedValue("Unknown error");

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to fetch channels");
    });

    it("should return empty array when no channels exist", async () => {
        mockListDocuments.mockResolvedValue({ documents: [] });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channels).toEqual([]);
        expect(data.nextCursor).toBeNull();
    });

    it("should handle channels with missing $createdAt", async () => {
        const mockChannels = [
            {
                $id: "channel1",
                serverId: "server1",
                name: "general",
                // Missing $createdAt
            },
        ];

        mockListDocuments.mockResolvedValue({ documents: mockChannels });

        const request = new NextRequest(
            "http://localhost:3000/api/channels?serverId=server1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channels[0].$createdAt).toBe("");
    });
});
