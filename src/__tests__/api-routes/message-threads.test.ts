import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockCreateDocument,
    mockUpdateDocument,
    mockGetChannelAccessForUser,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
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
            updateDocument: mockUpdateDocument,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            messages: "messages",
            messageAttachments: "message_attachments",
        },
        teams: {
            moderatorTeamId: "mod",
            adminTeamId: "admin",
        },
    })),
    perms: {
        message: vi.fn(() => ["read(any)", "update(user)", "delete(user)"]),
    },
}));

vi.mock("@/lib/server-channel-access", () => ({
    getChannelAccessForUser: mockGetChannelAccessForUser,
}));

vi.mock("node-appwrite", () => ({
    ID: { unique: () => "thread-msg-1" },
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (value: number) => `limit(${value})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
    },
}));

describe("Message Thread API", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGetChannelAccessForUser.mockResolvedValue({
            isMember: true,
            canRead: true,
            canSend: true,
            serverId: "server-1",
            isServerOwner: false,
        });
    });

    it("GET returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const { GET } =
            await import("../../app/api/messages/[messageId]/thread/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/thread",
        );

        const response = await GET(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("GET returns thread replies", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
        });
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "reply-1",
                    userId: "user-1",
                    text: "Reply",
                    channelId: "channel-1",
                    $createdAt: new Date().toISOString(),
                    threadId: "msg-1",
                },
            ],
        });

        const { GET } =
            await import("../../app/api/messages/[messageId]/thread/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/thread",
        );

        const response = await GET(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.items).toHaveLength(1);
        expect(data.items[0].threadId).toBe("msg-1");
    });

    it("POST creates thread reply and updates parent counters", async () => {
        mockGetServerSession.mockResolvedValue({
            $id: "user-1",
            name: "Test User",
        });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
            serverId: "server-1",
            threadMessageCount: 1,
            threadParticipants: ["user-2"],
        });

        mockCreateDocument.mockResolvedValue({
            $id: "thread-msg-1",
            userId: "user-1",
            userName: "Test User",
            text: "Thread reply",
            channelId: "channel-1",
            serverId: "server-1",
            threadId: "msg-1",
            $createdAt: new Date().toISOString(),
        });

        const { POST } =
            await import("../../app/api/messages/[messageId]/thread/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/thread",
            {
                method: "POST",
                body: JSON.stringify({ text: "Thread reply" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });

        expect(response.status).toBe(200);
        expect(mockCreateDocument).toHaveBeenCalledOnce();
        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "test-db",
            "messages",
            "msg-1",
            expect.objectContaining({
                threadMessageCount: 2,
                threadParticipants: ["user-2", "user-1"],
            }),
        );
    });

    it("POST returns 403 when user cannot send", async () => {
        mockGetServerSession.mockResolvedValue({
            $id: "user-1",
            name: "Test User",
        });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
            serverId: "server-1",
        });

        mockGetChannelAccessForUser.mockResolvedValue({
            isMember: true,
            canRead: true,
            canSend: false,
            serverId: "server-1",
            isServerOwner: false,
        });

        const { POST } =
            await import("../../app/api/messages/[messageId]/thread/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/thread",
            {
                method: "POST",
                body: JSON.stringify({ text: "Thread reply" }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
        expect(mockCreateDocument).not.toHaveBeenCalled();
    });
});
