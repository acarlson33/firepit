import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockCreateDocument,
    mockDeleteDocument,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
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
            directMessages: "direct_messages",
            pinnedMessages: "pinned_messages",
            conversations: "conversations",
        },
    })),
}));

vi.mock("node-appwrite", () => ({
    ID: { unique: () => "pin-1" },
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join(",") : value})`,
        limit: (value: number) => `limit(${value})`,
    },
}));

describe("DM Pin API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const { POST } =
            await import("../../app/api/direct-messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/direct-messages/msg-1/pin",
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
            await import("../../app/api/direct-messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/direct-messages/msg-1/pin",
            {
                method: "POST",
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ messageId: "msg-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("returns 409 when conversation pin limit is reached", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument
            .mockResolvedValueOnce({
                $id: "msg-1",
                conversationId: "conv-1",
                senderId: "user-1",
            })
            .mockResolvedValueOnce({
                $id: "conv-1",
                participants: ["user-1", "user-2"],
            });

        mockListDocuments
            .mockResolvedValueOnce({ total: 0, documents: [] })
            .mockResolvedValueOnce({ total: 50, documents: [] });

        const { POST } =
            await import("../../app/api/direct-messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/direct-messages/msg-1/pin",
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
        mockGetDocument
            .mockResolvedValueOnce({
                $id: "msg-1",
                conversationId: "conv-1",
                senderId: "user-1",
            })
            .mockResolvedValueOnce({
                $id: "conv-1",
                participants: ["user-1", "user-2"],
            });

        mockListDocuments
            .mockResolvedValueOnce({ total: 0, documents: [] })
            .mockResolvedValueOnce({ total: 0, documents: [] });

        mockCreateDocument.mockResolvedValue({
            $id: "pin-1",
            messageId: "msg-1",
            contextId: "conv-1",
            contextType: "conversation",
            pinnedBy: "user-1",
            pinnedAt: new Date().toISOString(),
        });

        const { POST } =
            await import("../../app/api/direct-messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/direct-messages/msg-1/pin",
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
        mockGetDocument
            .mockResolvedValueOnce({
                $id: "msg-1",
                conversationId: "conv-1",
                senderId: "user-1",
            })
            .mockResolvedValueOnce({
                $id: "conv-1",
                participants: ["user-1", "user-2"],
            });

        mockListDocuments.mockResolvedValue({
            total: 1,
            documents: [{ $id: "pin-1" }],
        });

        const { DELETE } =
            await import("../../app/api/direct-messages/[messageId]/pin/route");
        const request = new NextRequest(
            "http://localhost/api/direct-messages/msg-1/pin",
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
