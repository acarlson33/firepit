import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.APPWRITE_BANNED_USERS_COLLECTION_ID = "banned";
process.env.APPWRITE_MUTED_USERS_COLLECTION_ID = "muted";

vi.mock("node-appwrite", () => ({
    Query: {
        equal: vi.fn(() => "equal"),
        greaterThan: vi.fn(() => "greaterThan"),
        limit: vi.fn(() => "limit"),
    },
}));

const { mockGetDocument, mockListDocuments } = vi.hoisted(() => ({
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
}));

const { mockSession, mockGetServerPermissionsForUser } = vi.hoisted(() => ({
    mockSession: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            getDocument: mockGetDocument,
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            servers: "servers",
            memberships: "memberships",
            roles: "roles",
            channels: "channels",
            bannedUsers: "banned",
            mutedUsers: "muted",
        },
    })),
}));

const { GET } = await import("../../app/api/servers/[serverId]/stats/route");

describe("Server stats route", () => {
    beforeEach(() => {
        mockGetDocument.mockReset();
        mockListDocuments.mockReset();
        mockSession.mockReset();
        mockGetServerPermissionsForUser.mockReset();
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageServer: true },
        });
    });

    it("returns 401 when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/stats"),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns 403 when caller lacks manageServer", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageServer: false },
        });

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/stats"),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("returns stats for an existing server", async () => {
        mockGetDocument.mockResolvedValue({ $id: "server-1" });
        mockListDocuments
            .mockResolvedValueOnce({ total: 5 }) // members
            .mockResolvedValueOnce({ total: 3 }) // channels
            .mockResolvedValueOnce({ total: 40 }) // messages
            .mockResolvedValueOnce({ total: 4 }) // recent messages
            .mockResolvedValueOnce({ total: 2 }) // banned
            .mockResolvedValueOnce({ total: 1 }); // muted

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/stats"),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.totalMembers).toBe(5);
        expect(data.totalChannels).toBe(3);
        expect(data.totalMessages).toBe(40);
        expect(data.recentMessages).toBe(4);
        expect(data.bannedUsers).toBe(2);
        expect(data.mutedUsers).toBe(1);
    });

    it("returns 404 when server is missing", async () => {
        mockGetDocument.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/stats"),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(404);
        expect(data.error).toBe("Server not found");
    });
});
