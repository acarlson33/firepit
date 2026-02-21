import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockCreateDocument,
    mockUpdateDocument,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
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
        expect(data.replies).toHaveLength(1);
        expect(data.replies[0].threadId).toBe("msg-1");
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

        expect(response.status).toBe(201);
        expect(mockCreateDocument).toHaveBeenCalledOnce();
        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "test-db",
            "messages",
            "msg-1",
            expect.objectContaining({
                threadReplyCount: 1,
                threadParticipants: JSON.stringify(["user-2", "user-1"]),
            }),
        );
    });

    it("POST returns 400 when body has no message content", async () => {
        mockGetServerSession.mockResolvedValue({
            $id: "user-1",
            name: "Test User",
        });

        const { POST } =
            await import("../../app/api/messages/[messageId]/thread/route");
        const request = new NextRequest(
            "http://localhost/api/messages/msg-1/thread",
            {
                method: "POST",
                body: JSON.stringify({}),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("text, imageFileId, or attachments required");
        expect(mockCreateDocument).not.toHaveBeenCalled();
    });
});
