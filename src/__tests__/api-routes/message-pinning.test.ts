import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockCreateDocument,
    mockDeleteDocument,
    mockGetChannelAccessForUser,
    mockGetServerPermissionsForUser,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
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

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            messages: "messages",
            pinnedMessages: "pinned_messages",
            directMessages: "direct_messages",
            conversations: "conversations",
        },
    })),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getChannelAccessForUser: mockGetChannelAccessForUser,
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("node-appwrite", () => ({
    ID: { unique: () => "pin-1" },
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (value: number) => `limit(${value})`,
    },
}));

describe("Message Pinning API", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGetChannelAccessForUser.mockResolvedValue({
            isMember: true,
            canRead: true,
            canSend: true,
            serverId: "server-1",
            isServerOwner: false,
        });

        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            isServerOwner: false,
            permissions: {
                readMessages: true,
                sendMessages: true,
                manageMessages: true,
                manageChannels: false,
                manageRoles: false,
                manageServer: false,
                mentionEveryone: false,
                administrator: false,
            },
            serverId: "server-1",
        });
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const { POST } =
            await import("../../app/api/messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/pin",
            {
                method: "POST",
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns 409 when channel pin limit is reached", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
            serverId: "server-1",
        });

        mockListDocuments
            .mockResolvedValueOnce({ total: 0, documents: [] })
            .mockResolvedValueOnce({ total: 50, documents: [] });

        const { POST } =
            await import("../../app/api/messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/pin",
            {
                method: "POST",
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(409);
        expect(data.error).toContain("Pin limit reached");
        expect(mockCreateDocument).not.toHaveBeenCalled();
    });

    it("creates pin successfully", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
            serverId: "server-1",
        });

        mockListDocuments
            .mockResolvedValueOnce({ total: 0, documents: [] })
            .mockResolvedValueOnce({ total: 0, documents: [] });

        mockCreateDocument.mockResolvedValue({
            $id: "pin-1",
            messageId: "msg-1",
            contextId: "channel-1",
            contextType: "channel",
            pinnedBy: "user-1",
            pinnedAt: new Date().toISOString(),
        });

        const { POST } =
            await import("../../app/api/messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/pin",
            {
                method: "POST",
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });

        expect(response.status).toBe(200);
        expect(mockCreateDocument).toHaveBeenCalledOnce();
    });

    it("deletes existing pin", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
            serverId: "server-1",
        });

        mockListDocuments.mockResolvedValue({
            total: 1,
            documents: [{ $id: "pin-1" }],
        });

        const { DELETE } =
            await import("../../app/api/messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/pin",
            {
                method: "DELETE",
            },
        );

        const response = await DELETE(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });

        expect(response.status).toBe(200);
        expect(mockDeleteDocument).toHaveBeenCalledWith(
            "test-db",
            "pinned_messages",
            "pin-1",
        );
    });
});
