import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.stubEnv("APPWRITE_DATABASE_ID", "test-db");
vi.stubEnv("APPWRITE_SERVERS_COLLECTION_ID", "servers");
vi.stubEnv("APPWRITE_MEMBERSHIPS_COLLECTION_ID", "memberships");
vi.stubEnv("APPWRITE_BANNED_USERS_COLLECTION_ID", "banned_users");
vi.stubEnv("APPWRITE_MUTED_USERS_COLLECTION_ID", "muted_users");

const {
    mockGetDocument,
    mockListDocuments,
    mockCreateDocument,
    mockDeleteDocument,
    mockSession,
    mockGetUserRoles,
    mockRecordAudit,
    mockGetServerPermissionsForUser,
} = vi.hoisted(() => ({
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockSession: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockRecordAudit: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: vi.fn(
            (field: string, value: string) => `equal(${field},${value})`,
        ),
        limit: vi.fn((n: number) => `limit(${n})`),
    },
    ID: {
        unique: vi.fn(() => "doc-1"),
    },
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            getDocument: mockGetDocument,
            listDocuments: mockListDocuments,
            createDocument: mockCreateDocument,
            deleteDocument: mockDeleteDocument,
        },
    })),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/appwrite-roles", () => ({
    getUserRoles: mockGetUserRoles,
}));

vi.mock("@/lib/appwrite-audit", () => ({
    recordAudit: mockRecordAudit,
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
        },
    })),
}));

const { POST } =
    await import("../../app/api/servers/[serverId]/moderation/route");

describe("server moderation route", () => {
    beforeEach(() => {
        mockGetDocument.mockReset();
        mockListDocuments.mockReset();
        mockCreateDocument.mockReset();
        mockDeleteDocument.mockReset();
        mockSession.mockReset();
        mockGetUserRoles.mockReset();
        mockRecordAudit.mockReset();
        mockGetServerPermissionsForUser.mockReset();

        mockSession.mockResolvedValue({ $id: "moderator-1" });
        mockGetDocument.mockResolvedValue({
            $id: "server-1",
            ownerId: "owner-1",
        });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isServerOwner: false,
            isMember: true,
            permissions: {
                administrator: false,
                manageServer: true,
            },
        });
        mockGetUserRoles.mockResolvedValue({
            isAdmin: false,
            isModerator: false,
        });
        mockRecordAudit.mockResolvedValue(undefined);
    });

    it("returns 401 when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);

        const request = new NextRequest(
            "http://localhost/api/servers/server-1/moderation",
            {
                method: "POST",
                body: JSON.stringify({ action: "ban", userId: "user-1" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        expect(response.status).toBe(401);
    });

    it("returns 403 when caller lacks moderation permissions", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isServerOwner: false,
            isMember: true,
            permissions: { administrator: false, manageServer: false },
        });

        const request = new NextRequest(
            "http://localhost/api/servers/server-1/moderation",
            {
                method: "POST",
                body: JSON.stringify({ action: "ban", userId: "user-1" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        expect(response.status).toBe(403);
    });

    it("returns 400 when attempting to moderate yourself", async () => {
        const request = new NextRequest(
            "http://localhost/api/servers/server-1/moderation",
            {
                method: "POST",
                body: JSON.stringify({ action: "mute", userId: "moderator-1" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        const data = await response.json();
        expect(response.status).toBe(400);
        expect(data.error).toBe("You cannot moderate yourself");
    });

    it("returns 403 when attempting to moderate server owner", async () => {
        const request = new NextRequest(
            "http://localhost/api/servers/server-1/moderation",
            {
                method: "POST",
                body: JSON.stringify({ action: "kick", userId: "owner-1" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        const data = await response.json();
        expect(response.status).toBe(403);
        expect(data.error).toBe("Cannot moderate the server owner");
    });

    it("returns 404 when muting non-member", async () => {
        mockListDocuments.mockResolvedValue({ documents: [] });

        const request = new NextRequest(
            "http://localhost/api/servers/server-1/moderation",
            {
                method: "POST",
                body: JSON.stringify({ action: "mute", userId: "user-2" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        expect(response.status).toBe(404);
    });

    it("allows kick for authorized moderator and records audit", async () => {
        mockListDocuments.mockResolvedValueOnce({
            documents: [{ $id: "membership-1" }],
        });
        mockDeleteDocument.mockResolvedValue({});

        const request = new NextRequest(
            "http://localhost/api/servers/server-1/moderation",
            {
                method: "POST",
                body: JSON.stringify({
                    action: "kick",
                    userId: "user-3",
                    reason: "rule",
                }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockRecordAudit).toHaveBeenCalled();
    });
});
