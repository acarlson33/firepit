import { beforeEach, describe, expect, it, vi } from "vitest";

import { listInboxDigest, listInboxItems } from "@/lib/inbox";

const {
    mockGetChannelAccessForUser,
    mockGetFeatureFlag,
    mockGetNotificationSettings,
    mockGetRelationshipMap,
    mockListDocuments,
} = vi.hoisted(() => ({
    mockGetChannelAccessForUser: vi.fn(),
    mockGetFeatureFlag: vi.fn(),
    mockGetNotificationSettings: vi.fn(),
    mockGetRelationshipMap: vi.fn(),
    mockListDocuments: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: unknown) =>
            `equal(${field},${JSON.stringify(value)})`,
        contains: (field: string, value: unknown) =>
            `contains(${field},${JSON.stringify(value)})`,
        greaterThan: (field: string, value: unknown) =>
            `greaterThan(${field},${String(value)})`,
        isNull: (field: string) => `isNull(${field})`,
        limit: (value: number) => `limit(${value})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
        cursorAfter: (documentId: string) => `cursorAfter(${documentId})`,
    },
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            conversations: "conversations-collection",
            directMessages: "direct-messages-collection",
            inboxItems: "inbox-items-collection",
            messages: "messages-collection",
            profiles: "profiles-collection",
        },
    })),
}));

vi.mock("@/lib/appwrite-profiles", () => ({
    getAvatarUrl: vi.fn((fileId: string) => `https://avatar/${fileId}`),
}));

vi.mock("@/lib/appwrite-friendships", () => ({
    getRelationshipMap: mockGetRelationshipMap,
}));

vi.mock("@/lib/thread-read-store", () => ({
    listThreadReadsByContext: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/thread-read-states", () => ({
    isThreadUnread: vi.fn(() => true),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getChannelAccessForUser: mockGetChannelAccessForUser,
}));

vi.mock("@/lib/notification-settings", () => ({
    getNotificationSettings: mockGetNotificationSettings,
    getEffectiveNotificationLevel: vi.fn(
        (
            settings: {
                globalNotifications: string;
                channelOverrides?: Record<string, { level: string }>;
                conversationOverrides?: Record<string, { level: string }>;
                serverOverrides?: Record<string, { level: string }>;
            },
            context: {
                channelId?: string;
                conversationId?: string;
                serverId?: string;
            },
        ) => {
            if (context.conversationId) {
                const conversationOverride =
                    settings.conversationOverrides?.[context.conversationId];
                if (conversationOverride) {
                    return conversationOverride.level;
                }
            }

            if (context.channelId) {
                const channelOverride =
                    settings.channelOverrides?.[context.channelId];
                if (channelOverride) {
                    return channelOverride.level;
                }
            }

            if (context.serverId) {
                const serverOverride =
                    settings.serverOverrides?.[context.serverId];
                if (serverOverride) {
                    return serverOverride.level;
                }
            }

            return settings.globalNotifications;
        },
    ),
}));

vi.mock("@/lib/feature-flags", () => ({
    FEATURE_FLAGS: {},
    getFeatureFlag: mockGetFeatureFlag,
}));

describe("inbox", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetChannelAccessForUser.mockResolvedValue({ canRead: false });
        mockGetFeatureFlag.mockResolvedValue(false);
        mockGetRelationshipMap.mockResolvedValue(new Map());
    });

    it("uses persisted mention inbox items and marks them muted when notifications are off", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "inbox-item-1",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-1",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "Hello @user-1",
                                authorUserId: "user-2",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            {
                                userId: "user-2",
                                displayName: "Alice",
                                avatarFileId: "avatar-1",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue({
            globalNotifications: "nothing",
        });

        const result = await listInboxItems({
            kinds: ["mention"],
            limit: 10,
            userId: "user-1",
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.id).toBe("inbox-item-1");
        expect(result.items[0]?.authorLabel).toBe("Alice");
        expect(result.items[0]?.muted).toBe(true);
        expect(result.counts.mention).toBe(1);
        expect(result.contractVersion).toBe("message_v2");
    });

    it("filters inbox items by context kind", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "inbox-item-1",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-1",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "Hello @user-1",
                                authorUserId: "user-2",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            {
                                userId: "user-2",
                                displayName: "Alice",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue(null);

        const result = await listInboxItems({
            contextKinds: ["channel"],
            kinds: ["mention"],
            limit: 10,
            userId: "user-1",
        });

        expect(result.items).toHaveLength(0);
        expect(result.unreadCount).toBe(0);
        expect(result.contractVersion).toBe("message_v2");
    });

    it("filters unread channel thread items when the user cannot read the channel", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "messages-collection") {
                    return {
                        documents: [
                            {
                                $id: "message-1",
                                channelId: "channel-1",
                                userId: "user-2",
                                text: "Thread root",
                                $createdAt: "2026-03-11T12:00:00.000Z",
                                threadMessageCount: 2,
                                lastThreadReplyAt: "2026-03-11T12:05:00.000Z",
                                serverId: "server-1",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue(null);

        const result = await listInboxItems({
            kinds: ["thread"],
            limit: 10,
            userId: "user-1",
        });

        expect(result.items).toHaveLength(0);
        expect(result.unreadCount).toBe(0);
    });

    it("suppresses thread unread items in mentions-only contexts", async () => {
        mockGetChannelAccessForUser.mockResolvedValue({ canRead: true });
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "messages-collection") {
                    return {
                        documents: [
                            {
                                $id: "message-thread-1",
                                channelId: "channel-1",
                                userId: "user-2",
                                text: "Thread root",
                                $createdAt: "2026-03-11T12:00:00.000Z",
                                threadMessageCount: 2,
                                lastThreadReplyAt: "2026-03-11T12:05:00.000Z",
                                serverId: "server-1",
                            },
                        ],
                    };
                }

                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-1",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "channel",
                                contextId: "channel-1",
                                messageId: "message-mention-1",
                                latestActivityAt: "2026-03-11T12:10:00.000Z",
                                previewText: "hello @user-1",
                                authorUserId: "user-3",
                                serverId: "server-1",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            {
                                userId: "user-2",
                                displayName: "Thread Author",
                            },
                            {
                                userId: "user-3",
                                displayName: "Mention Author",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue({
            globalNotifications: "mentions",
        });

        const result = await listInboxItems({
            kinds: ["mention", "thread"],
            limit: 10,
            userId: "user-1",
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.kind).toBe("mention");
        expect(result.counts).toEqual({ mention: 1, thread: 0 });
        expect(result.unreadCount).toBe(1);
        expect(result.contractVersion).toBe("message_v2");
    });

    it("returns digest items ordered by newest activity first", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-old",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-1",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "older mention",
                                authorUserId: "user-2",
                            },
                            {
                                $id: "mention-new",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-2",
                                latestActivityAt: "2026-03-11T13:00:00.000Z",
                                previewText: "newer mention",
                                authorUserId: "user-3",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            {
                                userId: "user-2",
                                displayName: "Alice",
                            },
                            {
                                userId: "user-3",
                                displayName: "Bob",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue(null);

        const digest = await listInboxDigest({
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: 10,
            userId: "user-1",
        });

        expect(digest.items).toHaveLength(2);
        expect(digest.items[0]?.id).toBe("mention-new");
        expect(digest.items[1]?.id).toBe("mention-old");
        expect(digest.contractVersion).toBe("message_v2");
    });

    it("keeps digest total unread count from full scoped set when paginated", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-1",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-1",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "one",
                                authorUserId: "user-2",
                            },
                            {
                                $id: "mention-2",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-2",
                                latestActivityAt: "2026-03-11T13:00:00.000Z",
                                previewText: "two",
                                authorUserId: "user-3",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            {
                                userId: "user-2",
                                displayName: "Alice",
                            },
                            {
                                userId: "user-3",
                                displayName: "Bob",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue(null);

        const digest = await listInboxDigest({
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: 1,
            userId: "user-1",
        });

        expect(digest.items).toHaveLength(1);
        expect(digest.totalUnreadCount).toBe(2);
        expect(digest.contractVersion).toBe("message_v2");
    });

    it("keeps v1.5 digest mode backward-compatible during rollout", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-a",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-a",
                                latestActivityAt: "2026-03-11T11:00:00.000Z",
                                previewText: "older",
                                authorUserId: "user-2",
                            },
                            {
                                $id: "mention-b",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-b",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "newer",
                                authorUserId: "user-3",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            {
                                userId: "user-2",
                                displayName: "Alice",
                            },
                            {
                                userId: "user-3",
                                displayName: "Bob",
                            },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue(null);

        const digest = await listInboxDigest({
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: 1,

            userId: "user-1",
        });

        expect(digest.contractVersion).toBe("message_v2");
        expect(digest.totalUnreadCount).toBe(2);
        expect(digest.items).toHaveLength(1);
        expect(digest.items[0]?.id).toBe("mention-b");
    });

    it("applies v1.5 triage ordering for mentions, muted state, and unread count", async () => {
        mockGetFeatureFlag.mockResolvedValue(true);
        mockGetChannelAccessForUser.mockResolvedValue({ canRead: true });
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "messages-collection") {
                    return {
                        documents: [
                            {
                                $id: "thread-high",
                                channelId: "channel-1",
                                userId: "user-2",
                                text: "high",
                                threadMessageCount: 4,
                                lastThreadReplyAt: "2026-03-11T13:00:00.000Z",
                                $createdAt: "2026-03-11T10:00:00.000Z",
                                serverId: "server-1",
                            },
                            {
                                $id: "thread-low",
                                channelId: "channel-1",
                                userId: "user-3",
                                text: "low",
                                threadMessageCount: 2,
                                lastThreadReplyAt: "2026-03-11T14:00:00.000Z",
                                $createdAt: "2026-03-11T11:00:00.000Z",
                                serverId: "server-1",
                            },
                        ],
                    };
                }

                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-muted",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-muted",
                                messageId: "message-muted",
                                latestActivityAt: "2026-03-11T15:00:00.000Z",
                                previewText: "muted mention",
                                authorUserId: "user-4",
                            },
                            {
                                $id: "mention-active",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-active",
                                messageId: "message-active",
                                latestActivityAt: "2026-03-11T12:30:00.000Z",
                                previewText: "active mention",
                                authorUserId: "user-5",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            { userId: "user-2", displayName: "Thread High" },
                            { userId: "user-3", displayName: "Thread Low" },
                            { userId: "user-4", displayName: "Mention Muted" },
                            { userId: "user-5", displayName: "Mention Active" },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue({
            globalNotifications: "nothing",
            conversationOverrides: {
                "conversation-active": {
                    level: "all",
                },
            },
        });

        const digest = await listInboxDigest({
            limit: 10,

            userId: "user-1",
        });

        expect(digest.items.map((item) => item.id)).toEqual([
            "mention-active",
            "mention-muted",
            "thread:channel:channel-1:thread-high",
            "thread:channel:channel-1:thread-low",
        ]);
        expect(digest.totalUnreadCount).toBe(8);
    });

    it("keeps v1.5 digest ordering deterministic across repeated calls", async () => {
        mockGetFeatureFlag.mockResolvedValue(true);
        mockGetChannelAccessForUser.mockResolvedValue({ canRead: true });
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "messages-collection") {
                    return {
                        documents: [
                            {
                                $id: "thread-a",
                                channelId: "channel-1",
                                userId: "user-2",
                                text: "A",
                                threadMessageCount: 2,
                                lastThreadReplyAt: "2026-03-11T12:00:00.000Z",
                                $createdAt: "2026-03-11T10:00:00.000Z",
                                serverId: "server-1",
                            },
                            {
                                $id: "thread-b",
                                channelId: "channel-1",
                                userId: "user-3",
                                text: "B",
                                threadMessageCount: 2,
                                lastThreadReplyAt: "2026-03-11T12:00:00.000Z",
                                $createdAt: "2026-03-11T11:00:00.000Z",
                                serverId: "server-1",
                            },
                        ],
                    };
                }

                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-a",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-a",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "A",
                                authorUserId: "user-4",
                            },
                            {
                                $id: "mention-b",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-2",
                                messageId: "message-b",
                                latestActivityAt: "2026-03-11T12:00:00.000Z",
                                previewText: "B",
                                authorUserId: "user-5",
                            },
                        ],
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [
                            { userId: "user-2", displayName: "Thread A" },
                            { userId: "user-3", displayName: "Thread B" },
                            { userId: "user-4", displayName: "Mention A" },
                            { userId: "user-5", displayName: "Mention B" },
                        ],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue({
            globalNotifications: "all",
        });

        const firstDigest = await listInboxDigest({
            limit: 10,

            userId: "user-1",
        });
        const secondDigest = await listInboxDigest({
            limit: 10,

            userId: "user-1",
        });

        expect(secondDigest.items.map((item) => item.id)).toEqual(
            firstDigest.items.map((item) => item.id),
        );
    });

    it("digest uses per-message unread contract", async () => {
        mockGetFeatureFlag.mockResolvedValue(true);
        mockGetChannelAccessForUser.mockResolvedValue({ canRead: true });
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
                                $id: "mention-1",
                                userId: "user-1",
                                kind: "mention",
                                contextKind: "conversation",
                                contextId: "conversation-1",
                                messageId: "message-mention-1",
                                latestActivityAt: "2025-06-01T10:00:00.000Z",
                                read: false,
                                muted: false,
                                threadMessageCount: 0,
                                unreadCount: 2,
                                channelId: null,
                                channelName: null,
                                serverId: null,
                                serverName: null,
                                contentSnippet: "hey there",
                                authorUserId: "user-2",
                                authorDisplayName: "Alice",
                                authorAvatarUrl: null,
                            },
                        ],
                        total: 1,
                    };
                }

                if (collectionId === "profiles-collection") {
                    return {
                        documents: [{ userId: "user-2", displayName: "Alice" }],
                    };
                }

                return { documents: [] };
            },
        );
        mockGetNotificationSettings.mockResolvedValue(null);

        const digest = await listInboxDigest({
            limit: 10,
            userId: "user-1",
        });

        expect(digest.contractVersion).toBe("message_v2");
        expect(digest.items[0]?.kind).toBe("mention");
        expect(digest.totalUnreadCount).toBe(1);
    });
});
