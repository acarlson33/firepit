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
            directMessages: "direct_messages",
            conversations: "conversations",
        },
    })),
}));

vi.mock("node-appwrite", () => ({
    ID: { unique: () => "reply-1" },
    Permission: {
        read: (role: string) => `read(${role})`,
        update: (role: string) => `update(${role})`,
        delete: (role: string) => `delete(${role})`,
    },
    Role: {
        user: (userId: string) => `user(${userId})`,
        users: (userIds: string[]) => `users(${userIds.join(",")})`,
    },
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join(",") : value})`,
        limit: (value: number) => `limit(${value})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
    },
}));

describe("DM Thread API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GET /api/direct-messages/[messageId]/thread", () => {
        it("returns 401 when unauthenticated", async () => {
            mockGetServerSession.mockResolvedValue(null);

            const { GET } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "GET",
                },
            );

            const response = await GET(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBe("Authentication required");
        });

        it("returns 403 when user is not a conversation participant", async () => {
            mockGetServerSession.mockResolvedValue({ $id: "user-1" });
            mockGetDocument
                .mockResolvedValueOnce({
                    $id: "msg-1",
                    conversationId: "conv-1",
                    senderId: "user-2",
                })
                .mockResolvedValueOnce({
                    $id: "conv-1",
                    participants: ["user-2", "user-3"],
                });

            const { GET } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "GET",
                },
            );

            const response = await GET(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("Forbidden");
        });

        it("returns thread replies successfully", async () => {
            mockGetServerSession.mockResolvedValue({ $id: "user-1" });
            const now = new Date().toISOString();

            mockGetDocument
                .mockResolvedValueOnce({
                    $id: "msg-1",
                    conversationId: "conv-1",
                    senderId: "user-1",
                    text: "Parent message",
                    $createdAt: now,
                })
                .mockResolvedValueOnce({
                    $id: "conv-1",
                    participants: ["user-1", "user-2"],
                });

            mockListDocuments.mockResolvedValue({
                total: 2,
                documents: [
                    {
                        $id: "reply-1",
                        conversationId: "conv-1",
                        senderId: "user-2",
                        text: "Reply 1",
                        threadId: "msg-1",
                        $createdAt: now,
                    },
                    {
                        $id: "reply-2",
                        conversationId: "conv-1",
                        senderId: "user-1",
                        text: "Reply 2",
                        threadId: "msg-1",
                        $createdAt: now,
                    },
                ],
            });

            const { GET } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "GET",
                },
            );

            const response = await GET(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.items).toBeDefined();
            expect(data.items).toHaveLength(2);
            expect(data.items[0].text).toBe("Reply 1");
        });
    });

    describe("POST /api/direct-messages/[messageId]/thread", () => {
        it("returns 401 when unauthenticated", async () => {
            mockGetServerSession.mockResolvedValue(null);

            const { POST } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "POST",
                    body: JSON.stringify({ text: "Reply text" }),
                },
            );

            const response = await POST(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBe("Authentication required");
        });

        it("returns 400 when text is missing or too long", async () => {
            mockGetServerSession.mockResolvedValue({ $id: "user-1" });

            const { POST } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "POST",
                    body: JSON.stringify({ text: "" }),
                },
            );

            const response = await POST(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it("creates thread reply successfully", async () => {
            mockGetServerSession.mockResolvedValue({ $id: "user-1" });
            const now = new Date().toISOString();

            mockGetDocument
                .mockResolvedValueOnce({
                    $id: "msg-1",
                    conversationId: "conv-1",
                    senderId: "user-2",
                    text: "Parent message",
                    threadMessageCount: 0,
                    threadParticipants: [],
                    $createdAt: now,
                })
                .mockResolvedValueOnce({
                    $id: "conv-1",
                    participants: ["user-1", "user-2"],
                });

            mockCreateDocument.mockResolvedValue({
                $id: "reply-1",
                conversationId: "conv-1",
                senderId: "user-1",
                text: "Reply text",
                threadId: "msg-1",
                $createdAt: now,
            });

            mockUpdateDocument.mockResolvedValue({
                $id: "msg-1",
                threadMessageCount: 1,
                threadParticipants: ["user-1"],
                lastThreadReplyAt: now,
            });

            const { POST } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "POST",
                    body: JSON.stringify({ text: "Reply text" }),
                },
            );

            const response = await POST(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.message).toBeDefined();
            expect(mockCreateDocument).toHaveBeenCalledOnce();
            expect(mockUpdateDocument).toHaveBeenCalledOnce();
        });

        it("returns 403 when user is not a conversation participant", async () => {
            mockGetServerSession.mockResolvedValue({ $id: "user-1" });
            mockGetDocument
                .mockResolvedValueOnce({
                    $id: "msg-1",
                    conversationId: "conv-1",
                    senderId: "user-2",
                })
                .mockResolvedValueOnce({
                    $id: "conv-1",
                    participants: ["user-2", "user-3"],
                });

            const { POST } =
                await import(
                    "../../app/api/direct-messages/[messageId]/thread/route"
                );
            const request = new NextRequest(
                "http://localhost/api/direct-messages/msg-1/thread",
                {
                    method: "POST",
                    body: JSON.stringify({ text: "Reply text" }),
                },
            );

            const response = await POST(request, {
                params: Promise.resolve({ messageId: "msg-1" }),
            });
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("Forbidden");
        });
    });
});
