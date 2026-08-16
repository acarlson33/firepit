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
    mockUpsertMentionInboxItems,
} = vi.hoisted(() => ({
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockGetDocument: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
    mockUpsertMentionInboxItems: vi.fn(),
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

vi.mock("@/lib/inbox-items", () => ({
    upsertMentionInboxItems: mockUpsertMentionInboxItems,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            messages: "messages-collection",
            polls: "polls-collection",
            pollVotes: "poll-votes-collection",
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
        mockUpsertMentionInboxItems.mockClear();

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

        it("should return 400 for invalid attachments payload", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel-1",
                    attachments: [{ fileId: "missing-required-fields" }],
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(String(data.error)).toContain("attachments[0]");
            expect(mockCreateDocument).not.toHaveBeenCalled();
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

        it("persists mention inbox items when mentions are present", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            mockCreateDocument.mockResolvedValue({
                $id: "msg-mention",
                userId: "user-1",
                userName: "Test User",
                text: "Hello @alice",
                channelId: "channel-1",
                serverId: "server-1",
                $createdAt: "2026-03-11T12:00:00.000Z",
                mentions: ["alice"],
            });

            const response = await POST(
                new NextRequest("http://localhost/api/messages", {
                    method: "POST",
                    body: JSON.stringify({
                        text: "Hello @alice",
                        channelId: "channel-1",
                        mentions: ["alice"],
                        serverId: "server-1",
                    }),
                }),
            );

            expect(response.status).toBe(200);
            expect(mockUpsertMentionInboxItems).toHaveBeenCalledWith({
                authorUserId: "user-1",
                contextId: "channel-1",
                contextKind: "channel",
                latestActivityAt: "2026-03-11T12:00:00.000Z",
                mentions: ["alice"],
                messageId: "msg-mention",
                previewText: "Hello @alice",
                serverId: "server-1",
            });
        });

        it("creates a poll when message text uses poll slash command", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });

            mockCreateDocument
                .mockResolvedValueOnce({
                    $id: "msg-poll",
                    userId: "user-1",
                    userName: "Test User",
                    text: "Lunch plans?",
                    channelId: "channel-1",
                    serverId: "server-1",
                    $createdAt: "2026-04-12T12:00:00.000Z",
                })
                .mockResolvedValueOnce({
                    $id: "poll-1",
                });

            const request = new NextRequest("http://localhost/api/messages", {
                method: "POST",
                body: JSON.stringify({
                    text: '/poll "Lunch plans?" | "Pizza" | "Tacos"',
                    channelId: "channel-1",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(mockCreateDocument).toHaveBeenCalledTimes(2);
            expect(mockCreateDocument).toHaveBeenNthCalledWith(
                2,
                "test-db",
                "polls-collection",
                "mock-id",
                expect.objectContaining({
                    messageId: "msg-poll",
                    channelId: "channel-1",
                    question: "Lunch plans?",
                    status: "open",
                    createdBy: "user-1",
                }),
                expect.any(Array),
            );
            expect(data.message.poll).toBeDefined();
            expect(data.message.poll.question).toBe("Lunch plans?");
            expect(data.message.poll.options).toHaveLength(2);
            expect(
                data.message.poll.options.map(
                    (option: { text: string }) => option.text,
                ),
            ).toEqual(["Pizza", "Tacos"]);

            const createPollCall = mockCreateDocument.mock.calls.find(
                (call) => call[1] === "polls-collection",
            );
            expect(createPollCall).toBeDefined();

            if (!createPollCall) {
                throw new Error(
                    "Expected poll create call for polls-collection",
                );
            }

            const pollCreateData = createPollCall[3] as {
                options?: string;
            };
            const serializedOptions = pollCreateData.options;
            expect(typeof serializedOptions).toBe("string");
            const parsedOptions = JSON.parse(serializedOptions) as Array<{
                text: string;
            }>;
            expect(parsedOptions.map((option) => option.text)).toEqual([
                "Pizza",
                "Tacos",
            ]);
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

        it("should return 404 when editing a missing message", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });
            mockGetDocument.mockResolvedValue(null);

            const request = new NextRequest(
                "http://localhost/api/messages?id=missing-msg",
                {
                    method: "PATCH",
                    body: JSON.stringify({ text: "Updated" }),
                },
            );

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data).toEqual({ error: "Message not found" });
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

        it("should return 404 when deleting a missing message", async () => {
            mockGetServerSession.mockResolvedValue({
                $id: "user-1",
                name: "Test User",
            });
            mockGetDocument.mockResolvedValue(null);

            const request = new NextRequest(
                "http://localhost/api/messages?id=missing-msg",
                {
                    method: "DELETE",
                },
            );

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data).toEqual({ error: "Message not found" });
            expect(mockDeleteDocument).not.toHaveBeenCalled();
        });
    });
});
