import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/servers/route";

const mockDatabases = {
    listDocuments: vi.fn(),
};

const mockGetServerSession = vi.fn();
const mockGetActualMemberCounts = vi.fn();

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join(",") : value})`,
        limit: (limit: number) => `limit(${String(limit)})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
        cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
    },
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({ databases: mockDatabases })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "https://example.appwrite.io/v1",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            servers: "servers-collection",
            memberships: "memberships-collection",
        },
        buckets: {
            images: "images-bucket",
        },
    })),
}));

vi.mock("@/lib/membership-count", () => ({
    getActualMemberCounts: (...args: unknown[]) =>
        mockGetActualMemberCounts(...args),
}));

describe("GET /api/servers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 for unauthenticated requests", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const request = new NextRequest("http://localhost/api/servers");
        const response = await GET(request);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe("Authentication required");
        expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
    });

    it("returns only servers the user is a member of", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });

        mockDatabases.listDocuments
            .mockResolvedValueOnce({
                documents: [
                    { $id: "membership-1", serverId: "server-1" },
                    { $id: "membership-2", serverId: "server-2" },
                ],
            })
            .mockResolvedValueOnce({
                total: 2,
                documents: [
                    {
                        $id: "server-1",
                        name: "Alpha",
                        ownerId: "owner-1",
                        description: "Alpha description",
                        iconFileId: "icon_1",
                        bannerFileId: "banner_1",
                        isPublic: false,
                        $createdAt: "2024-01-01T00:00:00.000Z",
                    },
                    {
                        $id: "server-2",
                        name: "Beta",
                        ownerId: "owner-2",
                        isPublic: true,
                        $createdAt: "2024-01-02T00:00:00.000Z",
                    },
                ],
            });

        mockGetActualMemberCounts.mockResolvedValue(
            new Map<string, number>([
                ["server-1", 4],
                ["server-2", 9],
            ]),
        );

        const request = new NextRequest("http://localhost/api/servers?limit=25");
        const response = await GET(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.servers).toHaveLength(2);
        expect(body.servers[0]).toMatchObject({
            $id: "server-1",
            name: "Alpha",
            ownerId: "owner-1",
            memberCount: 4,
            isPublic: false,
            description: "Alpha description",
            iconFileId: "icon_1",
            bannerFileId: "banner_1",
        });
        expect(body.servers[0].iconUrl).toContain("/storage/buckets/");
        expect(body.nextCursor).toBeNull();

        expect(mockDatabases.listDocuments).toHaveBeenNthCalledWith(
            1,
            "test-db",
            "memberships-collection",
            expect.arrayContaining([
                expect.stringContaining("equal(userId,user-1)"),
                expect.stringContaining("limit(100)"),
            ]),
        );
        expect(mockDatabases.listDocuments).toHaveBeenNthCalledWith(
            2,
            "test-db",
            "servers-collection",
            expect.arrayContaining([
                expect.stringContaining("equal($id,server-1,server-2)"),
                expect.stringContaining("limit(25)"),
                expect.stringContaining("orderAsc($createdAt)"),
            ]),
        );
    });

    it("returns empty payload when user has no memberships", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });

        const request = new NextRequest("http://localhost/api/servers");
        const response = await GET(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.servers).toEqual([]);
        expect(body.nextCursor).toBeNull();
        expect(mockGetActualMemberCounts).not.toHaveBeenCalled();
    });

    it("supports cursor pagination", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });

        mockDatabases.listDocuments
            .mockResolvedValueOnce({
                documents: [{ $id: "membership-1", serverId: "server-3" }],
            })
            .mockResolvedValueOnce({
                total: 1,
                documents: [
                    {
                        $id: "server-3",
                        name: "Gamma",
                        ownerId: "owner-3",
                        $createdAt: "2024-01-03T00:00:00.000Z",
                    },
                ],
            });

        mockGetActualMemberCounts.mockResolvedValue(
            new Map<string, number>([["server-3", 3]]),
        );

        const request = new NextRequest(
            "http://localhost/api/servers?limit=1&cursor=server-2",
        );
        const response = await GET(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.servers).toHaveLength(1);
        expect(body.nextCursor).toBe("server-3");
        expect(mockDatabases.listDocuments).toHaveBeenNthCalledWith(
            2,
            "test-db",
            "servers-collection",
            expect.arrayContaining([
                expect.stringContaining("cursorAfter(server-2)"),
            ]),
        );
    });

    it("paginates memberships when user has more than one page", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });

        const firstMembershipPage = Array.from({ length: 100 }, (_, index) => ({
            $id: `membership-${String(index + 1)}`,
            serverId: "server-1",
        }));
        const secondMembershipPage = Array.from(
            { length: 40 },
            (_, index) => ({
                $id: `membership-${String(index + 101)}`,
                serverId: "server-1",
            }),
        );

        mockDatabases.listDocuments
            .mockResolvedValueOnce({
                total: 140,
                documents: firstMembershipPage,
            })
            .mockResolvedValueOnce({
                total: 140,
                documents: secondMembershipPage,
            })
            .mockResolvedValueOnce({
                total: 1,
                documents: [
                    {
                        $id: "server-1",
                        name: "Alpha",
                        ownerId: "owner-1",
                        isPublic: true,
                        $createdAt: "2024-01-01T00:00:00.000Z",
                    },
                ],
            });

        mockGetActualMemberCounts.mockResolvedValue(
            new Map<string, number>([["server-1", 140]]),
        );

        const request = new NextRequest("http://localhost/api/servers?limit=25");
        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(mockDatabases.listDocuments).toHaveBeenNthCalledWith(
            2,
            "test-db",
            "memberships-collection",
            expect.arrayContaining([
                expect.stringContaining("equal(userId,user-1)"),
                expect.stringContaining("limit(100)"),
                expect.stringContaining("cursorAfter(membership-100)"),
            ]),
        );
        expect(mockDatabases.listDocuments).toHaveBeenNthCalledWith(
            3,
            "test-db",
            "servers-collection",
            expect.arrayContaining([
                expect.stringContaining("equal($id,server-1)"),
            ]),
        );
    });

    it("returns 500 on unexpected errors", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockDatabases.listDocuments.mockRejectedValue(new Error("Database down"));

        const request = new NextRequest("http://localhost/api/servers");
        const response = await GET(request);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe("Database down");
    });
});
