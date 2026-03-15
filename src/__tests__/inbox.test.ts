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
        (settings: { globalNotifications: string }) =>
            settings.globalNotifications,
    ),
}));

vi.mock("@/lib/feature-flags", () => ({
    FEATURE_FLAGS: {
        ENABLE_PER_MESSAGE_UNREAD: "enable_per_message_unread",
    },
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
        expect(result.contractVersion).toBe("thread_v1");
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
        expect(result.contractVersion).toBe("thread_v1");
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
        expect(result.contractVersion).toBe("thread_v1");
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
        expect(digest.contractVersion).toBe("thread_v1");
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
        expect(digest.contractVersion).toBe("thread_v1");
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
            useDigestV15: true,
            userId: "user-1",
        });

        expect(digest.contractVersion).toBe("thread_v1");
        expect(digest.totalUnreadCount).toBe(2);
        expect(digest.items).toHaveLength(1);
        expect(digest.items[0]?.id).toBe("mention-b");
    });

    it.each([
        {
            useDigestV15: false,
            usePerMessageUnread: false,
            expectedContractVersion: "thread_v1",
            expectedFirstKind: "thread",
            expectedTotalUnreadCount: 2,
        },
        {
            useDigestV15: true,
            usePerMessageUnread: false,
            expectedContractVersion: "thread_v1",
            expectedFirstKind: "mention",
            expectedTotalUnreadCount: 2,
        },
        {
            useDigestV15: false,
            usePerMessageUnread: true,
            expectedContractVersion: "message_v2",
            expectedFirstKind: "thread",
            expectedTotalUnreadCount: 3,
        },
        {
            useDigestV15: true,
            usePerMessageUnread: true,
            expectedContractVersion: "message_v2",
            expectedFirstKind: "mention",
            expectedTotalUnreadCount: 3,
        },
    ])(
        "applies digest and unread flags together: $useDigestV15 / $usePerMessageUnread",
        async ({
            expectedContractVersion,
            expectedFirstKind,
            expectedTotalUnreadCount,
            useDigestV15,
            usePerMessageUnread,
        }) => {
            mockGetFeatureFlag.mockResolvedValue(usePerMessageUnread);
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
                                    latestActivityAt:
                                        "2026-03-11T11:00:00.000Z",
                                    previewText: "mention",
                                    authorUserId: "user-2",
                                },
                            ],
                        };
                    }

                    if (collectionId === "messages-collection") {
                        return {
                            documents: [
                                {
                                    $id: "thread-1",
                                    channelId: "channel-1",
                                    userId: "user-3",
                                    text: "thread",
                                    threadMessageCount: 2,
                                    lastThreadReplyAt:
                                        "2026-03-11T12:00:00.000Z",
                                    $createdAt: "2026-03-11T10:00:00.000Z",
                                    serverId: "server-1",
                                },
                            ],
                        };
                    }

                    if (collectionId === "profiles-collection") {
                        return {
                            documents: [
                                { userId: "user-2", displayName: "Mention" },
                                { userId: "user-3", displayName: "Thread" },
                            ],
                        };
                    }

                    return { documents: [] };
                },
            );
            mockGetNotificationSettings.mockResolvedValue(null);

            const digest = await listInboxDigest({
                limit: 10,
                useDigestV15,
                userId: "user-1",
            });

            expect(digest.contractVersion).toBe(expectedContractVersion);
            expect(digest.items[0]?.kind).toBe(expectedFirstKind);
            expect(digest.totalUnreadCount).toBe(expectedTotalUnreadCount);
        },
    );
});
