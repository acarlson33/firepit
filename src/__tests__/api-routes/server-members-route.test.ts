import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockListDocuments,
    mockGetServerSession,
    mockGetServerPermissionsForUser,
} = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Client: vi.fn().mockImplementation(() => ({
        setEndpoint: vi.fn().mockReturnThis(),
        setProject: vi.fn().mockReturnThis(),
        setKey: vi.fn().mockReturnThis(),
    })),
    Databases: vi.fn().mockImplementation(() => ({
        listDocuments: mockListDocuments,
    })),
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (n: number) => `limit(${n})`,
    },
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "http://localhost/v1",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            memberships: "memberships",
            profiles: "profiles",
            servers: "servers",
            channels: "channels",
            roles: "roles",
        },
    })),
}));

const { GET } = await import("../../app/api/servers/[serverId]/members/route");

describe("server members route", () => {
    beforeEach(() => {
        mockListDocuments.mockReset();
        mockGetServerSession.mockReset();
        mockGetServerPermissionsForUser.mockReset();

        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageRoles: true },
        });
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns 403 when caller lacks manageRoles", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageRoles: false },
        });

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("returns enriched members when authorized", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [{ userId: "user-1" }, { userId: "user-2" }],
            })
            .mockResolvedValueOnce({
                documents: [
                    { userId: "user-1", roleIds: ["role-1"] },
                    { userId: "user-2", roleIds: [] },
                ],
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user-1",
                        displayName: "User One",
                        avatarUrl: "one.png",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(Array.isArray(data.members)).toBe(true);
        expect(data.members).toHaveLength(2);
        expect(data.members[0].userId).toBe("user-1");
        expect(data.members[0].roleIds).toEqual(["role-1"]);
    });
});
