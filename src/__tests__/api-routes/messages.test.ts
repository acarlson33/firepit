import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, PATCH, DELETE } from "../../app/api/messages/route";
import { MAX_MESSAGE_LENGTH } from "@/lib/message-constraints";

// Mock node-appwrite for server-side
vi.mock("node-appwrite", () => ({
    ID: { unique: () => "mock-id" },
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (n: number) => `limit(${n})`,
    },
}));

// Create persistent mocks using vi.hoisted
const {
    mockCreateDocument,
    mockUpdateDocument,
    mockDeleteDocument,
    mockGetDocument,
    mockGetServerSession,
    mockGetChannelAccessForUser,
} = vi.hoisted(() => ({
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockGetDocument: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            createDocument: mockCreateDocument,
            updateDocument: mockUpdateDocument,
            deleteDocument: mockDeleteDocument,
            getDocument: mockGetDocument,
        },
    })),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getChannelAccessForUser: mockGetChannelAccessForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            messages: "messages-collection",
            channels: "channels-collection",
            servers: "servers-collection",
            memberships: "memberships-collection",
        },
        teams: {
            moderatorTeamId: "mod-team",
            adminTeamId: "admin-team",
        },
    })),
    perms: {
        message: vi.fn(() => ["read(any)", "write(user:test-user)"]),
    },
}));

describe("Messages API Routes", () => {
    beforeEach(() => {
        mockGetServerSession.mockClear();
        mockCreateDocument.mockClear();
        mockUpdateDocument.mockClear();
        mockDeleteDocument.mockClear();
        mockGetDocument.mockClear();
        mockGetChannelAccessForUser.mockClear();

        mockGetChannelAccessForUser.mockResolvedValue({
            serverId: "server-1",
            isServerOwner: false,
            isMember: true,
            canRead: true,
            canSend: true,
        });
    });

    describe("POST /api/messages", () => {
        it("should create a message when authenticated", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            mockCreateDocument.mockResolvedValue({
                $id: "msg-1",
                userId: "user-1",
                userName: "Test User",
                text: "Hello",
                channelId: "channel-1",
                serverId: "server-1",
                $createdAt: new Date().toISOString(),
            });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    text: "Hello",
                    channelId: "channel-1",
                    serverId: "server-1",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.message).toBeDefined();
            expect(data.message.$id).toBe("msg-1");
            expect(data.message.text).toBe("Hello");
            expect(mockCreateDocument).toHaveBeenCalled();
        });
        it("should return 401 if not authenticated", async () => {
            mockGetServerSession.mockResolvedValue(null);

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    text: "Hello",
                    channelId: "channel-1",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBe("Authentication required");
        });

        it("should return 400 if text is missing", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel-1",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe(
                "text, imageFileId, or attachments, and channelId are required",
            );
        });

        it("should return 400 if channelId is missing", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    text: "Hello",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe(
                "text, imageFileId, or attachments, and channelId are required",
            );
        });

        it("should return 400 when message text exceeds max length", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    text: "a".repeat(MAX_MESSAGE_LENGTH + 1),
                    channelId: "channel-1",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.maxLength).toBe(MAX_MESSAGE_LENGTH);
            expect(String(data.error)).toContain("too long");
            expect(mockCreateDocument).not.toHaveBeenCalled();
        });

        it("should return 403 when user cannot send in channel", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });
            mockGetChannelAccessForUser.mockResolvedValue({
                serverId: "server-1",
                isServerOwner: false,
                isMember: true,
                canRead: true,
                canSend: false,
            });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    text: "Hello",
                    channelId: "channel-1",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("Forbidden");
            expect(mockCreateDocument).not.toHaveBeenCalled();
        });
    });

    describe("PATCH /api/messages", () => {
        it("should return 403 when editing another user's message", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });
            mockGetDocument.mockResolvedValue({
                $id: "msg-1",
                userId: "other-user",
                text: "Original",
            });

            const request = new NextRequest(
                "http://localhost/api/messages?id=msg-1",
                {
                    method: "PATCH",
                    body: JSON.stringify({ text: "Updated" }),
                },
            );

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("You can only edit your own messages");
            expect(mockUpdateDocument).not.toHaveBeenCalled();
        });
    });

    describe("DELETE /api/messages", () => {
        it("should return 403 when deleting another user's message", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });
            mockGetDocument.mockResolvedValue({
                $id: "msg-1",
                userId: "other-user",
                text: "Original",
            });

            const request = new NextRequest(
                "http://localhost/api/messages?id=msg-1",
                {
                    method: "DELETE",
                },
            );

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBe("You can only delete your own messages");
            expect(mockDeleteDocument).not.toHaveBeenCalled();
        });
    });
});
