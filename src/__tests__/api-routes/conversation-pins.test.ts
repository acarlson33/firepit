import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            getDocument: mockGetDocument,
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            directMessages: "direct_messages",
            pinnedMessages: "pinned_messages",
            conversations: "conversations",
        },
    })),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join(",") : value})`,
        limit: (value: number) => `limit(${value})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
    },
}));

describe("Conversation Pins List API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const { GET } =
            await import(
                "../../app/api/conversations/[conversationId]/pins/route"
            );
        const request = new NextRequest(
            "http://localhost/api/conversations/conv-1/pins",
            {
                method: "GET",
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ conversationId: "conv-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns 403 when user is not a conversation participant", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "conv-1",
            participants: ["user-2", "user-3"],
        });

        const { GET } =
            await import(
                "../../app/api/conversations/[conversationId]/pins/route"
            );
        const request = new NextRequest(
            "http://localhost/api/conversations/conv-1/pins",
            {
                method: "GET",
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ conversationId: "conv-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("returns empty list when no pins exist", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "conv-1",
            participants: ["user-1", "user-2"],
        });
        mockListDocuments.mockResolvedValue({
            total: 0,
            documents: [],
        });

        const { GET } =
            await import(
                "../../app/api/conversations/[conversationId]/pins/route"
            );
        const request = new NextRequest(
            "http://localhost/api/conversations/conv-1/pins",
            {
                method: "GET",
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ conversationId: "conv-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.items).toEqual([]);
    });

    it("returns pinned messages with their details", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({
            $id: "conv-1",
            participants: ["user-1", "user-2"],
        });

        const now = new Date().toISOString();
        mockListDocuments
            .mockResolvedValueOnce({
                total: 2,
                documents: [
                    {
                        $id: "pin-1",
                        messageId: "msg-1",
                        contextId: "conv-1",
                        contextType: "conversation",
                        pinnedBy: "user-1",
                        $createdAt: now,
                    },
                    {
                        $id: "pin-2",
                        messageId: "msg-2",
                        contextId: "conv-1",
                        contextType: "conversation",
                        pinnedBy: "user-2",
                        $createdAt: now,
                    },
                ],
            })
            .mockResolvedValueOnce({
                total: 2,
                documents: [
                    {
                        $id: "msg-1",
                        conversationId: "conv-1",
                        senderId: "user-1",
                        text: "Hello world",
                        $createdAt: now,
                    },
                    {
                        $id: "msg-2",
                        conversationId: "conv-1",
                        senderId: "user-2",
                        text: "Test message",
                        $createdAt: now,
                    },
                ],
            });

        const { GET } =
            await import(
                "../../app/api/conversations/[conversationId]/pins/route"
            );
        const request = new NextRequest(
            "http://localhost/api/conversations/conv-1/pins",
            {
                method: "GET",
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ conversationId: "conv-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.items).toHaveLength(2);
        expect(data.items[0]).toHaveProperty("pin");
        expect(data.items[0]).toHaveProperty("message");
        expect(data.items[0].message.text).toBe("Hello world");
    });
});
