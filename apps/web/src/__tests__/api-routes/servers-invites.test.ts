import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST, GET } from "@/app/api/servers/[serverId]/invites/route";
import * as authServer from "@/lib/auth-server";
import * as appwriteInvites from "@/lib/appwrite-invites";

const { mockGetServerPermissionsForUser } = vi.hoisted(() => ({
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("@/lib/auth-server");
vi.mock("@/lib/appwrite-roles", () => ({
    getUserRoles: vi.fn(),
}));
vi.mock("@/lib/appwrite-invites");
vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));
vi.mock("@/lib/newrelic-utils", () => ({
    returnUnauthorized: () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    returnForbidden: () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    recordError: vi.fn(),
}));
vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {},
    })),
}));
vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: () => ({
        databaseId: "test-db",
        collections: {
            servers: "servers",
            invites: "invites",
        },
    }),
}));

const ownerAccess = {
    isServerOwner: true,
    isMember: true,
    permissions: { administrator: false, manageServer: false },
};
const manageServerAccess = {
    isServerOwner: false,
    isMember: true,
    permissions: { administrator: false, manageServer: true },
};
const administratorAccess = {
    isServerOwner: false,
    isMember: true,
    permissions: { administrator: true, manageServer: false },
};

describe("POST /api/servers/[serverId]/invites", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should create invite when user is server owner", async () => {
        const mockUser = { $id: "user-1" };
        const mockInvite = {
            $id: "invite-1",
            code: "TEST123",
            serverId: "server-1",
            creatorId: "user-1",
            channelId: null,
            expiresAt: null,
            maxUses: null,
            currentUses: 0,
            temporary: false,
        };

        vi.mocked(authServer.getServerSession).mockResolvedValue(
            mockUser as never,
        );
        mockGetServerPermissionsForUser.mockResolvedValue(ownerAccess as never);
        vi.mocked(appwriteInvites.createInvite).mockResolvedValue(
            mockInvite as never,
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({
                    channelId: null,
                    expiresAt: null,
                    maxUses: null,
                    temporary: false,
                }),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.$id).toBe("invite-1");
        expect(data.code).toBe("TEST123");
        expect(appwriteInvites.createInvite).toHaveBeenCalledWith({
            serverId: "server-1",
            creatorId: "user-1",
            channelId: null,
            expiresAt: null,
            maxUses: null,
            temporary: false,
        });
    });

    it("should create invite when user has manageServer permission", async () => {
        const mockUser = { $id: "mod-user" };
        const mockInvite = {
            $id: "invite-1",
            code: "MOD123",
            serverId: "server-1",
            creatorId: "mod-user",
        };

        vi.mocked(authServer.getServerSession).mockResolvedValue(
            mockUser as never,
        );
        mockGetServerPermissionsForUser.mockResolvedValue(
            manageServerAccess as never,
        );
        vi.mocked(appwriteInvites.createInvite).mockResolvedValue(
            mockInvite as never,
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({}),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.code).toBe("MOD123");
    });

    it("should create invite with custom settings", async () => {
        const mockUser = { $id: "user-1" };
        const expiresAt = new Date(Date.now() + 86400000).toISOString();
        const mockInvite = {
            $id: "invite-1",
            code: "CUSTOM123",
            serverId: "server-1",
            creatorId: "user-1",
            channelId: "channel-1",
            expiresAt,
            maxUses: 10,
            temporary: true,
        };

        vi.mocked(authServer.getServerSession).mockResolvedValue(
            mockUser as never,
        );
        mockGetServerPermissionsForUser.mockResolvedValue(ownerAccess as never);
        vi.mocked(appwriteInvites.createInvite).mockResolvedValue(
            mockInvite as never,
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel-1",
                    expiresAt,
                    maxUses: 10,
                    temporary: true,
                }),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.channelId).toBe("channel-1");
        expect(data.maxUses).toBe(10);
        expect(data.temporary).toBe(true);
    });

    it("should return 401 if not authenticated", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue(null as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({}),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
    });

    it("should return 400 for invalid JSON payload", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue({
            $id: "user-1",
        } as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: "{not-json",
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid JSON payload");
    });

    it("should return 400 for invalid maxUses", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue({
            $id: "user-1",
        } as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({ maxUses: -1 }),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid invite fields");
    });

    it("should return 400 for an expiresAt in the past", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue({
            $id: "user-1",
        } as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({
                    expiresAt: new Date(Date.now() - 1000).toISOString(),
                }),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid invite fields");
    });

    it("should return 403 if user lacks permissions", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isServerOwner: false,
            isMember: true,
            permissions: { administrator: false, manageServer: false },
        } as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({}),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("should handle creation errors", async () => {
        const mockUser = { $id: "user-1" };

        vi.mocked(authServer.getServerSession).mockResolvedValue(
            mockUser as never,
        );
        mockGetServerPermissionsForUser.mockResolvedValue(ownerAccess as never);
        vi.mocked(appwriteInvites.createInvite).mockRejectedValue(
            new Error("Database error"),
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
            {
                method: "POST",
                body: JSON.stringify({}),
            },
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to create invite");
    });
});

describe("GET /api/servers/[serverId]/invites", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should list invites when user is server owner", async () => {
        const mockUser = { $id: "user-1" };
        const mockInvites = [
            {
                $id: "invite-1",
                code: "INVITE1",
                serverId: "server-1",
                creatorId: "user-1",
            },
            {
                $id: "invite-2",
                code: "INVITE2",
                serverId: "server-1",
                creatorId: "user-1",
            },
        ];

        vi.mocked(authServer.getServerSession).mockResolvedValue(
            mockUser as never,
        );
        mockGetServerPermissionsForUser.mockResolvedValue(ownerAccess as never);
        vi.mocked(appwriteInvites.listServerInvites).mockResolvedValue(
            mockInvites as never,
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(2);
        expect(data[0].code).toBe("INVITE1");
        expect(appwriteInvites.listServerInvites).toHaveBeenCalledWith(
            "server-1",
        );
    });

    it("should list invites when user has administrator permission", async () => {
        const mockUser = { $id: "admin-user" };
        const mockInvites = [
            {
                $id: "invite-1",
                code: "ADMIN1",
            },
        ];

        vi.mocked(authServer.getServerSession).mockResolvedValue(
            mockUser as never,
        );
        mockGetServerPermissionsForUser.mockResolvedValue(
            administratorAccess as never,
        );
        vi.mocked(appwriteInvites.listServerInvites).mockResolvedValue(
            mockInvites as never,
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(1);
    });

    it("should return empty array when no invites exist", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue({
            $id: "user-1",
        } as never);
        mockGetServerPermissionsForUser.mockResolvedValue(ownerAccess as never);
        vi.mocked(appwriteInvites.listServerInvites).mockResolvedValue(
            [] as never,
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveLength(0);
    });

    it("should return 401 if not authenticated", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue(null as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
    });

    it("should return 403 if user lacks permissions", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue({
            $id: "user-2",
        } as never);
        mockGetServerPermissionsForUser.mockResolvedValue({
            isServerOwner: false,
            isMember: false,
            permissions: { administrator: false, manageServer: false },
        } as never);

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("should handle listing errors", async () => {
        vi.mocked(authServer.getServerSession).mockResolvedValue({
            $id: "user-1",
        } as never);
        mockGetServerPermissionsForUser.mockResolvedValue(ownerAccess as never);
        vi.mocked(appwriteInvites.listServerInvites).mockRejectedValue(
            new Error("Query failed"),
        );

        const request = new Request(
            "http://localhost/api/servers/server-1/invites",
        );
        const params = Promise.resolve({ serverId: "server-1" });

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to list invites");
    });
});
