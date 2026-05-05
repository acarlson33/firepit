import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerPermissionsForUser,
    mockGetChannelAccessForUser,
    mockListDocuments,
} = vi.hoisted(() => ({
    mockGetServerPermissionsForUser: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
    mockListDocuments: vi.fn(),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
    getChannelAccessForUser: mockGetChannelAccessForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            channels: "channels",
            memberships: "memberships",
            servers: "servers",
        },
    })),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: vi.fn((field, value) => `equal(${field},${value})`),
        limit: vi.fn((value) => `limit(${value})`),
    },
}));

let GET: typeof import("@/app/api/servers/[serverId]/permissions/route").GET;

beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/servers/[serverId]/permissions/route");
    GET = mod.GET;
});

describe("GET /api/servers/[serverId]/permissions", () => {
    it("returns 400 when userId is missing", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/servers/server-1/permissions",
        );

        const response = await GET(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: "userId is required",
        });
    });

    it("returns base server permissions when no channelId is provided", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isServerOwner: false,
            isMember: true,
            permissions: {
                readMessages: true,
                sendMessages: true,
                manageMessages: false,
                manageChannels: false,
                manageRoles: false,
                manageServer: false,
                mentionEveryone: false,
                administrator: false,
            },
            roleIds: ["role-1"],
            roles: [],
        });

        const request = new NextRequest(
            "http://localhost:3000/api/servers/server-1/permissions?userId=user-1",
        );

        const response = await GET(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            readMessages: true,
            sendMessages: true,
            manageMessages: false,
        });
        expect(mockListDocuments).not.toHaveBeenCalled();
    });

    it("applies matching channel overrides using returned roleIds", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isServerOwner: false,
            isMember: true,
            permissions: {
                readMessages: false,
                sendMessages: false,
                manageMessages: false,
                manageChannels: false,
                manageRoles: false,
                manageServer: false,
                mentionEveryone: false,
                administrator: false,
            },
            roleIds: ["role-1"],
            roles: [
                {
                    $id: "role-1",
                    serverId: "server-1",
                    name: "Member",
                    color: "#000000",
                    position: 1,
                    readMessages: false,
                    sendMessages: false,
                    manageMessages: false,
                    manageChannels: false,
                    manageRoles: false,
                    manageServer: false,
                    mentionEveryone: false,
                    administrator: false,
                    mentionable: true,
                },
            ],
        });
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "override-1",
                    channelId: "channel-1",
                    roleId: "role-1",
                    userId: "",
                    allow: ["readMessages", "manageMessages"],
                    deny: [],
                    $createdAt: "2024-01-01T00:00:00.000Z",
                },
            ],
        });
        mockGetChannelAccessForUser.mockResolvedValue({
            serverId: "server-1",
            isServerOwner: false,
            isMember: true,
            canRead: true,
            canSend: false,
        });

        const request = new NextRequest(
            "http://localhost:3000/api/servers/server-1/permissions?userId=user-1&channelId=channel-1",
        );

        const response = await GET(request, {
            params: Promise.resolve({ serverId: "server-1" }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            readMessages: true,
            manageMessages: true,
            sendMessages: false,
        });
    });
});
