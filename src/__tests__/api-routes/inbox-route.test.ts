import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, PATCH } from "@/app/api/inbox/route";
import { clearUnreadConsistencySnapshots } from "@/lib/unread-consistency";

const {
    mockListDocuments,
    mockListInboxItems,
    mockSession,
    mockUpsertThreadReads,
    mockUpdateDocument,
} = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
    mockListInboxItems: vi.fn(),
    mockSession: vi.fn(),
    mockUpsertThreadReads: vi.fn(),
    mockUpdateDocument: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/appwrite-admin", () => ({
    getAdminClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
            updateDocument: mockUpdateDocument,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        collections: {
            inboxItems: "inbox-items-collection",
        },
        databaseId: "test-db",
    })),
}));

vi.mock("@/lib/inbox", () => ({
    listInboxItems: mockListInboxItems,
}));

vi.mock("@/lib/thread-read-store", () => ({
    upsertThreadReads: mockUpsertThreadReads,
}));

describe("inbox route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearUnreadConsistencySnapshots();
    });

    it("returns 401 when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/inbox"),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("rejects invalid kinds", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?kind=invalid"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("kind");
        expect(mockListInboxItems).not.toHaveBeenCalled();
    });

    it("rejects invalid limits", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?limit=0"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("limit");
        expect(mockListInboxItems).not.toHaveBeenCalled();
    });

    it("returns the normalized inbox payload", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            counts: { mention: 1, thread: 0 },
            items: [
                {
                    authorAvatarUrl: "https://example.com/avatar.png",
                    authorLabel: "Alice",
                    authorUserId: "user-2",
                    contextId: "channel-1",
                    contextKind: "channel",
                    id: "mention:channel:channel-1:message-1",
                    kind: "mention",
                    latestActivityAt: "2026-03-11T12:00:00.000Z",
                    messageId: "message-1",
                    muted: false,
                    previewText: "Hello @user-1",
                    unreadCount: 1,
                },
            ],
            unreadCount: 1,
        });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/inbox?kind=mention,thread&limit=25",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListInboxItems).toHaveBeenCalledWith({
            contextKinds: undefined,
            kinds: ["mention", "thread"],
            limit: 25,
            userId: "user-1",
        });
        expect(data.items).toHaveLength(1);
        expect(data.counts.mention).toBe(1);
    });

    it("maps direct scope to conversation context filtering", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            contractVersion: "thread_v1",
            counts: { mention: 0, thread: 0 },
            items: [],
            unreadCount: 0,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?scope=direct"),
        );

        expect(response.status).toBe(200);
        expect(mockListInboxItems).toHaveBeenCalledWith({
            contextKinds: ["conversation"],
            kinds: ["mention", "thread"],
            limit: 50,
            userId: "user-1",
        });
    });

    it("returns a full context-scoped inbox when contextId/contextKind are provided", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            contractVersion: "message_v2",
            counts: { mention: 1, thread: 1 },
            items: [
                {
                    authorLabel: "Alice",
                    authorUserId: "user-2",
                    contextId: "channel-1",
                    contextKind: "channel",
                    id: "mention-1",
                    kind: "mention",
                    latestActivityAt: "2026-03-11T12:00:00.000Z",
                    messageId: "message-1",
                    muted: false,
                    previewText: "mention",
                    unreadCount: 1,
                },
                {
                    authorLabel: "Bob",
                    authorUserId: "user-3",
                    contextId: "channel-2",
                    contextKind: "channel",
                    id: "thread-2",
                    kind: "thread",
                    latestActivityAt: "2026-03-11T12:01:00.000Z",
                    messageId: "message-2",
                    muted: false,
                    previewText: "thread",
                    unreadCount: 2,
                },
            ],
            unreadCount: 3,
        });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/inbox?contextId=channel-1&contextKind=channel",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListInboxItems).toHaveBeenCalledWith({
            contextKinds: ["channel"],
            kinds: ["mention", "thread"],
            limit: Number.POSITIVE_INFINITY,
            userId: "user-1",
        });
        expect(data.items).toHaveLength(1);
        expect(data.items[0].contextId).toBe("channel-1");
        expect(data.unreadCount).toBe(1);
    });

    it("rejects incomplete context scope parameters", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?contextId=channel-1"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("contextId and contextKind");
        expect(mockListInboxItems).not.toHaveBeenCalled();
    });

    it("marks inbox items as read for the authenticated user", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "item-1" }, { $id: "item-2" }],
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({ itemIds: ["item-1", "item-2"] }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListDocuments).toHaveBeenCalled();
        expect(mockUpdateDocument).toHaveBeenCalledTimes(2);
        expect(data.ok).toBe(true);
    });

    it("rejects invalid scope values", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?scope=invalid"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("scope");
        expect(mockListInboxItems).not.toHaveBeenCalled();
    });

    it("marks all unread items read for a specific context", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            contractVersion: "message_v2",
            counts: { mention: 2, thread: 3 },
            items: [
                {
                    id: "item-mention-1",
                    kind: "mention",
                    contextKind: "channel",
                    contextId: "channel-1",
                    messageId: "message-1",
                    latestActivityAt: "2026-03-13T00:00:00.000Z",
                    unreadCount: 1,
                    previewText: "mention",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "item-mention-2",
                    kind: "mention",
                    contextKind: "channel",
                    contextId: "channel-2",
                    messageId: "message-9",
                    latestActivityAt: "2026-03-13T00:30:00.000Z",
                    unreadCount: 1,
                    previewText: "mention other context",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "thread:channel:channel-1:message-2",
                    kind: "thread",
                    contextKind: "channel",
                    contextId: "channel-1",
                    messageId: "message-2",
                    parentMessageId: "message-2",
                    latestActivityAt: "2026-03-13T01:00:00.000Z",
                    unreadCount: 2,
                    previewText: "thread",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "thread:channel:channel-2:message-8",
                    kind: "thread",
                    contextKind: "channel",
                    contextId: "channel-2",
                    messageId: "message-8",
                    parentMessageId: "message-8",
                    latestActivityAt: "2026-03-13T01:30:00.000Z",
                    unreadCount: 1,
                    previewText: "thread other context",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
            ],
            unreadCount: 5,
        });
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "item-mention-1" }],
        });
        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({
                    action: "mark-all-read",
                    contextId: "channel-1",
                    contextKind: "channel",
                }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListInboxItems).toHaveBeenCalledWith({
            contextKinds: ["channel"],
            kinds: ["mention", "thread"],
            limit: Number.POSITIVE_INFINITY,
            userId: "user-1",
        });
        expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
        expect(mockUpsertThreadReads).toHaveBeenCalledWith({
            contextId: "channel-1",
            contextType: "channel",
            reads: {
                "message-2": "2026-03-13T01:00:00.000Z",
            },
            userId: "user-1",
        });
        expect(mockUpdateDocument).not.toHaveBeenCalledWith(
            "test-db",
            "inbox-items-collection",
            "item-mention-2",
            expect.anything(),
        );
        expect(mockUpsertThreadReads).not.toHaveBeenCalledWith(
            expect.objectContaining({
                contextId: "channel-2",
            }),
        );
        expect(data.ok).toBe(true);
        expect(data.updatedMentionCount).toBe(1);
        expect(data.updatedThreadContextCount).toBe(1);
    });

    it("marks all unread items read for a context kind without requiring contextId", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            contractVersion: "message_v2",
            counts: { mention: 2, thread: 2 },
            items: [
                {
                    id: "item-mention-conv-1",
                    kind: "mention",
                    contextKind: "conversation",
                    contextId: "conversation-1",
                    messageId: "message-1",
                    latestActivityAt: "2026-03-13T00:00:00.000Z",
                    unreadCount: 1,
                    previewText: "dm mention",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "thread:conversation:conversation-1:message-2",
                    kind: "thread",
                    contextKind: "conversation",
                    contextId: "conversation-1",
                    messageId: "message-2",
                    parentMessageId: "message-2",
                    latestActivityAt: "2026-03-13T01:00:00.000Z",
                    unreadCount: 1,
                    previewText: "dm thread",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "item-mention-channel-1",
                    kind: "mention",
                    contextKind: "channel",
                    contextId: "channel-1",
                    messageId: "message-3",
                    latestActivityAt: "2026-03-13T02:00:00.000Z",
                    unreadCount: 1,
                    previewText: "channel mention",
                    authorUserId: "user-3",
                    authorLabel: "Bob",
                    muted: false,
                },
                {
                    id: "thread:channel:channel-1:message-4",
                    kind: "thread",
                    contextKind: "channel",
                    contextId: "channel-1",
                    messageId: "message-4",
                    parentMessageId: "message-4",
                    latestActivityAt: "2026-03-13T03:00:00.000Z",
                    unreadCount: 1,
                    previewText: "channel thread",
                    authorUserId: "user-3",
                    authorLabel: "Bob",
                    muted: false,
                },
            ],
            unreadCount: 4,
        });
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "item-mention-conv-1" }],
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({
                    action: "mark-all-read",
                    contextKind: "conversation",
                }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListInboxItems).toHaveBeenCalledWith({
            contextKinds: ["conversation"],
            kinds: ["mention", "thread"],
            limit: Number.POSITIVE_INFINITY,
            userId: "user-1",
        });
        expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
        expect(mockUpsertThreadReads).toHaveBeenCalledTimes(1);
        expect(mockUpsertThreadReads).toHaveBeenCalledWith({
            contextId: "conversation-1",
            contextType: "conversation",
            reads: {
                "message-2": "2026-03-13T01:00:00.000Z",
            },
            userId: "user-1",
        });
        expect(data.ok).toBe(true);
        expect(data.updatedMentionCount).toBe(1);
        expect(data.updatedThreadContextCount).toBe(1);
    });

    it("coalesces duplicate thread parents per context during mark-all-read", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            contractVersion: "message_v2",
            counts: { mention: 0, thread: 7 },
            items: [
                {
                    id: "thread:channel:channel-1:message-2",
                    kind: "thread",
                    contextKind: "channel",
                    contextId: "channel-1",
                    messageId: "message-2",
                    parentMessageId: "message-2",
                    latestActivityAt: "2026-03-13T01:00:00.000Z",
                    unreadCount: 2,
                    previewText: "thread",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "thread:channel:channel-1:message-2-duplicate",
                    kind: "thread",
                    contextKind: "channel",
                    contextId: "channel-1",
                    messageId: "message-2",
                    parentMessageId: "message-2",
                    latestActivityAt: "2026-03-13T02:00:00.000Z",
                    unreadCount: 3,
                    previewText: "thread newer",
                    authorUserId: "user-2",
                    authorLabel: "Alice",
                    muted: false,
                },
                {
                    id: "thread:channel:channel-2:message-2",
                    kind: "thread",
                    contextKind: "channel",
                    contextId: "channel-2",
                    messageId: "message-2",
                    parentMessageId: "message-2",
                    latestActivityAt: "2026-03-13T03:00:00.000Z",
                    unreadCount: 2,
                    previewText: "thread channel 2",
                    authorUserId: "user-3",
                    authorLabel: "Bob",
                    muted: false,
                },
            ],
            unreadCount: 7,
        });
        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({ action: "mark-all-read" }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpsertThreadReads).toHaveBeenCalledTimes(2);
        expect(mockUpsertThreadReads).toHaveBeenCalledWith({
            contextId: "channel-1",
            contextType: "channel",
            reads: {
                "message-2": "2026-03-13T02:00:00.000Z",
            },
            userId: "user-1",
        });
        expect(mockUpsertThreadReads).toHaveBeenCalledWith({
            contextId: "channel-2",
            contextType: "channel",
            reads: {
                "message-2": "2026-03-13T03:00:00.000Z",
            },
            userId: "user-1",
        });
        expect(data.updatedThreadContextCount).toBe(2);
    });

    it("rejects empty inbox read updates", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({ itemIds: [] }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("itemIds");
        expect(mockUpdateDocument).not.toHaveBeenCalled();
    });
});
