import { beforeEach, describe, expect, it, vi } from "vitest";

import { listInboxItems } from "@/lib/inbox";

const {
    mockGetNotificationSettings,
    mockGetRelationshipMap,
    mockListDocuments,
} = vi.hoisted(() => ({
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
        limit: (value: number) => `limit(${value})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
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
    getChannelAccessForUser: vi.fn(async () => ({ canRead: false })),
}));

vi.mock("@/lib/notification-settings", () => ({
    getNotificationSettings: mockGetNotificationSettings,
    getEffectiveNotificationLevel: vi.fn(
        (settings: { globalNotifications: string }) =>
            settings.globalNotifications,
    ),
}));

describe("inbox", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRelationshipMap.mockResolvedValue(new Map());
    });

    it("uses persisted mention inbox items and marks them muted when notifications are off", async () => {
        mockListDocuments.mockImplementation(
            async (_databaseId, collectionId) => {
                if (collectionId === "inbox-items-collection") {
                    return {
                        documents: [
                            {
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
        expect(result.items[0]?.authorLabel).toBe("Alice");
        expect(result.items[0]?.muted).toBe(true);
        expect(result.counts.mention).toBe(1);
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
});
