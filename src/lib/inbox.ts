import { Query } from "node-appwrite";

import { getRelationshipMap } from "@/lib/appwrite-friendships";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getAvatarUrl } from "@/lib/appwrite-profiles";
import { getServerClient } from "@/lib/appwrite-server";
import {
    getEffectiveNotificationLevel,
    getNotificationSettings,
} from "@/lib/notification-settings";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import { listThreadReadsByContext } from "@/lib/thread-read-store";
import { isThreadUnread } from "@/lib/thread-read-states";
import type {
    DirectMessage,
    InboxItem,
    InboxItemKind,
    Message,
} from "@/lib/types";

type InboxFilters = {
    kinds: InboxItemKind[];
    limit: number;
    userId: string;
};

type AuthorProfile = {
    avatarUrl?: string;
    displayName?: string;
};

type InboxItemDocument = {
    authorUserId: string;
    contextId: string;
    contextKind: "channel" | "conversation";
    kind: InboxItemKind;
    latestActivityAt: string;
    messageId: string;
    parentMessageId?: string;
    previewText?: string;
    readAt?: string;
    serverId?: string;
    userId: string;
};

function isBlockedRelationship(value: {
    blockedByMe?: boolean;
    blockedMe?: boolean;
}) {
    return Boolean(value.blockedByMe || value.blockedMe);
}

function toCountMap(items: InboxItem[]): Record<InboxItemKind, number> {
    return items.reduce<Record<InboxItemKind, number>>(
        (accumulator, item) => {
            accumulator[item.kind] += item.unreadCount;
            return accumulator;
        },
        { mention: 0, thread: 0 },
    );
}

function sortInboxItems(items: InboxItem[]) {
    return [...items].sort((left, right) => {
        const activityOrder = right.latestActivityAt.localeCompare(
            left.latestActivityAt,
        );
        if (activityOrder !== 0) {
            return activityOrder;
        }

        return left.id.localeCompare(right.id);
    });
}

async function listConversationDocuments(userId: string) {
    const env = getEnvConfig();
    const { databases } = getServerClient();

    const response = await databases.listDocuments(
        env.databaseId,
        env.collections.conversations,
        [
            Query.equal("participants", userId),
            Query.orderDesc("lastMessageAt"),
            Query.limit(100),
        ],
    );

    return response.documents as unknown as Array<Record<string, unknown>>;
}

async function loadAuthorProfiles(userIds: string[]) {
    if (userIds.length === 0) {
        return new Map<string, AuthorProfile>();
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();
    const response = await databases.listDocuments(
        env.databaseId,
        env.collections.profiles,
        [Query.equal("userId", userIds), Query.limit(100)],
    );

    return response.documents.reduce<Map<string, AuthorProfile>>(
        (accumulator, document) => {
            const userId = String(document.userId);
            accumulator.set(userId, {
                avatarUrl:
                    typeof document.avatarFileId === "string"
                        ? getAvatarUrl(document.avatarFileId)
                        : undefined,
                displayName:
                    typeof document.displayName === "string"
                        ? document.displayName
                        : undefined,
            });
            return accumulator;
        },
        new Map(),
    );
}

async function filterReadableChannelContexts<T>(
    userId: string,
    items: T[],
    getChannelId: (item: T) => string | null,
) {
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const channelIds = Array.from(
        new Set(
            items
                .map((item) => getChannelId(item))
                .filter((channelId): channelId is string => Boolean(channelId)),
        ),
    );

    if (channelIds.length === 0) {
        return items;
    }

    const readableChannelIds = new Set<string>();
    await Promise.all(
        channelIds.map(async (channelId) => {
            try {
                const access = await getChannelAccessForUser(
                    databases,
                    env,
                    channelId,
                    userId,
                );
                if (access.canRead) {
                    readableChannelIds.add(channelId);
                }
            } catch {
                // Ignore inaccessible or deleted channels.
            }
        }),
    );

    return items.filter((item) => {
        const channelId = getChannelId(item);
        if (!channelId) {
            return true;
        }

        return readableChannelIds.has(channelId);
    });
}

async function applyMuteState(userId: string, items: InboxItem[]) {
    if (items.length === 0) {
        return items;
    }

    const settings = await getNotificationSettings(userId);
    if (!settings) {
        return items;
    }

    return items.map((item) => {
        const effectiveLevel = getEffectiveNotificationLevel(settings, {
            channelId:
                item.contextKind === "channel" ? item.contextId : undefined,
            conversationId:
                item.contextKind === "conversation"
                    ? item.contextId
                    : undefined,
            serverId: item.serverId,
        });

        return {
            ...item,
            muted: effectiveLevel === "nothing",
        } satisfies InboxItem;
    });
}

async function listUnreadConversationThreadItems(
    userId: string,
): Promise<InboxItem[]> {
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const conversations = await listConversationDocuments(userId);
    const conversationIds = conversations.map((conversation) =>
        String(conversation.$id),
    );

    if (conversationIds.length === 0) {
        return [];
    }

    const readStatesByConversationId = await listThreadReadsByContext({
        contextIds: conversationIds,
        contextType: "conversation",
        userId,
    });

    const threadParents = await databases.listDocuments(
        env.databaseId,
        env.collections.directMessages,
        [
            Query.equal("conversationId", conversationIds),
            Query.greaterThan("threadMessageCount", 0),
            Query.limit(500),
        ],
    );

    const unreadDocuments = threadParents.documents.filter((document) => {
        const conversationId = String(document.conversationId);
        const messageId = String(document.$id);

        return isThreadUnread({
            lastReadAt:
                readStatesByConversationId.get(conversationId)?.[messageId],
            lastThreadReplyAt:
                typeof document.lastThreadReplyAt === "string"
                    ? document.lastThreadReplyAt
                    : undefined,
            threadMessageCount:
                typeof document.threadMessageCount === "number"
                    ? document.threadMessageCount
                    : undefined,
        });
    });

    const authorIds = Array.from(
        new Set(unreadDocuments.map((document) => String(document.senderId))),
    );
    const [profileMap, relationshipMap] = await Promise.all([
        loadAuthorProfiles(authorIds),
        getRelationshipMap(userId, authorIds),
    ]);

    return unreadDocuments.flatMap((document) => {
        const authorUserId = String(document.senderId);
        const relationship = relationshipMap.get(authorUserId);
        if (relationship && isBlockedRelationship(relationship)) {
            return [] as InboxItem[];
        }

        const profile = profileMap.get(authorUserId);
        const directMessage = document as unknown as DirectMessage;

        return [
            {
                authorAvatarUrl:
                    profile?.avatarUrl ?? directMessage.senderAvatarUrl,
                authorLabel:
                    profile?.displayName ??
                    directMessage.senderDisplayName ??
                    authorUserId,
                authorUserId,
                contextId: String(document.conversationId),
                contextKind: "conversation",
                id: `thread:conversation:${String(document.conversationId)}:${String(document.$id)}`,
                kind: "thread",
                latestActivityAt:
                    typeof document.lastThreadReplyAt === "string"
                        ? document.lastThreadReplyAt
                        : String(document.$createdAt),
                messageId: String(document.$id),
                muted: false,
                parentMessageId: String(document.$id),
                previewText:
                    typeof document.text === "string" ? document.text : "",
                unreadCount: 1,
            } satisfies InboxItem,
        ];
    });
}

async function listUnreadChannelThreadItems(
    userId: string,
): Promise<InboxItem[]> {
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const threadParents = await databases.listDocuments(
        env.databaseId,
        env.collections.messages,
        [Query.greaterThan("threadMessageCount", 0), Query.limit(500)],
    );

    const channelIds = Array.from(
        new Set(
            threadParents.documents.flatMap((document) =>
                typeof document.channelId === "string"
                    ? [document.channelId]
                    : [],
            ),
        ),
    );

    if (channelIds.length === 0) {
        return [];
    }

    const readStatesByChannelId = await listThreadReadsByContext({
        contextIds: channelIds,
        contextType: "channel",
        userId,
    });

    const unreadDocuments = threadParents.documents.filter((document) => {
        if (typeof document.channelId !== "string") {
            return false;
        }

        const channelId = document.channelId;
        const messageId = String(document.$id);

        return isThreadUnread({
            lastReadAt: readStatesByChannelId.get(channelId)?.[messageId],
            lastThreadReplyAt:
                typeof document.lastThreadReplyAt === "string"
                    ? document.lastThreadReplyAt
                    : undefined,
            threadMessageCount:
                typeof document.threadMessageCount === "number"
                    ? document.threadMessageCount
                    : undefined,
        });
    });

    const readableDocuments = await filterReadableChannelContexts(
        userId,
        unreadDocuments,
        (document) =>
            typeof document.channelId === "string" ? document.channelId : null,
    );

    const authorIds = Array.from(
        new Set(readableDocuments.map((document) => String(document.userId))),
    );
    const [profileMap, relationshipMap] = await Promise.all([
        loadAuthorProfiles(authorIds),
        getRelationshipMap(userId, authorIds),
    ]);

    return readableDocuments.flatMap((document) => {
        const authorUserId = String(document.userId);
        const relationship = relationshipMap.get(authorUserId);
        if (relationship && isBlockedRelationship(relationship)) {
            return [] as InboxItem[];
        }

        const profile = profileMap.get(authorUserId);
        const message = document as unknown as Message;

        return [
            {
                authorAvatarUrl: profile?.avatarUrl ?? message.avatarUrl,
                authorLabel:
                    profile?.displayName ??
                    message.displayName ??
                    message.userName ??
                    authorUserId,
                authorUserId,
                contextId: String(document.channelId),
                contextKind: "channel",
                id: `thread:channel:${String(document.channelId)}:${String(document.$id)}`,
                kind: "thread",
                latestActivityAt:
                    typeof document.lastThreadReplyAt === "string"
                        ? document.lastThreadReplyAt
                        : String(document.$createdAt),
                messageId: String(document.$id),
                muted: false,
                parentMessageId: String(document.$id),
                previewText:
                    typeof document.text === "string" ? document.text : "",
                serverId:
                    typeof document.serverId === "string"
                        ? document.serverId
                        : undefined,
                unreadCount: 1,
            } satisfies InboxItem,
        ];
    });
}

async function listPersistedMentionItems(userId: string): Promise<InboxItem[]> {
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const result = await databases.listDocuments(
        env.databaseId,
        env.collections.inboxItems,
        [
            Query.equal("userId", userId),
            Query.equal("kind", "mention"),
            Query.orderDesc("latestActivityAt"),
            Query.limit(100),
        ],
    );

    const documents = (
        result.documents as unknown as InboxItemDocument[]
    ).filter((document) => !document.readAt);
    const visibleDocuments = await filterReadableChannelContexts(
        userId,
        documents,
        (document) =>
            document.contextKind === "channel" ? document.contextId : null,
    );

    const authorIds = Array.from(
        new Set(visibleDocuments.map((document) => document.authorUserId)),
    );
    const [profileMap, relationshipMap] = await Promise.all([
        loadAuthorProfiles(authorIds),
        getRelationshipMap(userId, authorIds),
    ]);

    return visibleDocuments.flatMap((document) => {
        const authorUserId = document.authorUserId;
        const relationship = relationshipMap.get(authorUserId);
        if (relationship && isBlockedRelationship(relationship)) {
            return [] as InboxItem[];
        }

        const profile = profileMap.get(authorUserId);

        return [
            {
                authorAvatarUrl: profile?.avatarUrl,
                authorLabel: profile?.displayName ?? authorUserId,
                authorUserId,
                contextId: document.contextId,
                contextKind: document.contextKind,
                id: `${document.kind}:${document.contextKind}:${document.contextId}:${document.messageId}`,
                kind: "mention",
                latestActivityAt: document.latestActivityAt,
                messageId: document.messageId,
                muted: false,
                parentMessageId: document.parentMessageId,
                previewText: document.previewText ?? "",
                serverId: document.serverId,
                unreadCount: 1,
            } satisfies InboxItem,
        ];
    });
}

export async function listInboxItems({ kinds, limit, userId }: InboxFilters) {
    const requestedKinds = new Set(kinds);
    const itemGroups = await Promise.all([
        requestedKinds.has("thread")
            ? Promise.all([
                  listUnreadChannelThreadItems(userId),
                  listUnreadConversationThreadItems(userId),
              ]).then(([channelItems, conversationItems]) => [
                  ...channelItems,
                  ...conversationItems,
              ])
            : Promise.resolve([]),
        requestedKinds.has("mention")
            ? listPersistedMentionItems(userId).catch(() => [])
            : Promise.resolve([]),
    ]);

    const itemsWithMuteState = await applyMuteState(userId, itemGroups.flat());
    const sortedItems = sortInboxItems(itemsWithMuteState);
    const counts = toCountMap(sortedItems);

    return {
        counts,
        items: sortedItems.slice(0, limit),
        unreadCount: sortedItems.reduce(
            (total, item) => total + item.unreadCount,
            0,
        ),
    };
}
