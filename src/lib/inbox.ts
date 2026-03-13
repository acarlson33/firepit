import { Query } from "node-appwrite";

import { getRelationshipMap } from "@/lib/appwrite-friendships";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getAvatarUrl } from "@/lib/appwrite-profiles";
import { getServerClient } from "@/lib/appwrite-server";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import {
    getEffectiveNotificationLevel,
    getNotificationSettings,
} from "@/lib/notification-settings";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import { listThreadReadsByContext } from "@/lib/thread-read-store";
import { isThreadUnread } from "@/lib/thread-read-states";
import type {
    DirectMessage,
    InboxContextKind,
    InboxDigestResponse,
    InboxItem,
    InboxItemKind,
    Message,
} from "@/lib/types";

type InboxFilters = {
    contextKinds?: InboxContextKind[];
    kinds: InboxItemKind[];
    limit: number;
    userId: string;
};

type AuthorProfile = {
    avatarUrl?: string;
    displayName?: string;
};

type InboxItemDocument = {
    $id: string;
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

type UnreadThreadParentInput = {
    contextId: string;
    lastReadAt?: string;
    parentMessageId: string;
    threadMessageCount?: number;
};

type ThreadContextField = "channelId" | "conversationId";

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

async function runInBatches<T>(params: {
    batchSize: number;
    items: T[];
    worker: (item: T) => Promise<void>;
}) {
    const { batchSize, items, worker } = params;
    if (items.length === 0 || batchSize <= 0) {
        return;
    }

    const batches: T[][] = [];
    let startIndex = 0;

    while (startIndex < items.length) {
        batches.push(items.slice(startIndex, startIndex + batchSize));
        startIndex += batchSize;
    }

    const runSequentially = batches.reduce<Promise<void>>(
        (previousPromise, batch) =>
            previousPromise.then(() =>
                Promise.all(batch.map((item) => worker(item))).then(() => {
                    return;
                }),
            ),
        Promise.resolve(),
    );

    return runSequentially;
}

async function countUnreadRepliesByParent(params: {
    collectionId: string;
    contextField: ThreadContextField;
    parents: UnreadThreadParentInput[];
}) {
    const { collectionId, contextField, parents } = params;
    const env = getEnvConfig();
    const { databases } = getServerClient();

    const countsByParentId = new Map<string, number>();
    const parentsThatNeedQuery: UnreadThreadParentInput[] = [];

    for (const parent of parents) {
        const fallbackCount =
            typeof parent.threadMessageCount === "number" &&
            parent.threadMessageCount > 0
                ? parent.threadMessageCount
                : 1;

        if (!parent.lastReadAt) {
            countsByParentId.set(parent.parentMessageId, fallbackCount);
            continue;
        }

        parentsThatNeedQuery.push(parent);
    }

    await runInBatches({
        batchSize: 25,
        items: parentsThatNeedQuery,
        worker: async (parent) => {
            const lastReadAt = parent.lastReadAt;
            if (!lastReadAt) {
                countsByParentId.set(parent.parentMessageId, 1);
                return;
            }

            const result = await databases.listDocuments(
                env.databaseId,
                collectionId,
                [
                    Query.equal(contextField, parent.contextId),
                    Query.equal("threadId", parent.parentMessageId),
                    Query.greaterThan("$createdAt", lastReadAt),
                    Query.limit(1),
                ],
            );

            countsByParentId.set(
                parent.parentMessageId,
                Math.max(1, result.total || 0),
            );
        },
    });

    return countsByParentId;
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
    usePerMessageUnread: boolean,
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

    const unreadCountsByParent = usePerMessageUnread
        ? await countUnreadRepliesByParent({
              collectionId: env.collections.directMessages,
              contextField: "conversationId",
              parents: unreadDocuments.map((document) => {
                  const conversationId = String(document.conversationId);
                  const parentMessageId = String(document.$id);

                  return {
                      contextId: conversationId,
                      lastReadAt:
                          readStatesByConversationId.get(conversationId)?.[
                              parentMessageId
                          ],
                      parentMessageId,
                      threadMessageCount:
                          typeof document.threadMessageCount === "number"
                              ? document.threadMessageCount
                              : undefined,
                  } satisfies UnreadThreadParentInput;
              }),
          })
        : null;

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
                unreadCount:
                    unreadCountsByParent?.get(String(document.$id)) ?? 1,
            } satisfies InboxItem,
        ];
    });
}

async function listUnreadChannelThreadItems(
    userId: string,
    usePerMessageUnread: boolean,
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

    const unreadCountsByParent = usePerMessageUnread
        ? await countUnreadRepliesByParent({
              collectionId: env.collections.messages,
              contextField: "channelId",
              parents: readableDocuments.map((document) => {
                  const channelId = String(document.channelId);
                  const parentMessageId = String(document.$id);

                  return {
                      contextId: channelId,
                      lastReadAt:
                          readStatesByChannelId.get(channelId)?.[
                              parentMessageId
                          ],
                      parentMessageId,
                      threadMessageCount:
                          typeof document.threadMessageCount === "number"
                              ? document.threadMessageCount
                              : undefined,
                  } satisfies UnreadThreadParentInput;
              }),
          })
        : null;

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
                unreadCount:
                    unreadCountsByParent?.get(String(document.$id)) ?? 1,
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
                id: document.$id,
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

export async function listInboxItems({
    contextKinds,
    kinds,
    limit,
    userId,
}: InboxFilters): Promise<{
    contractVersion: InboxDigestResponse["contractVersion"];
    counts: Record<InboxItemKind, number>;
    items: InboxItem[];
    unreadCount: number;
}> {
    const usePerMessageUnread = await getFeatureFlag(
        FEATURE_FLAGS.ENABLE_PER_MESSAGE_UNREAD,
    ).catch(() => false);

    const requestedKinds = new Set(kinds);
    const itemGroups = await Promise.all([
        requestedKinds.has("thread")
            ? Promise.all([
                  listUnreadChannelThreadItems(userId, usePerMessageUnread),
                  listUnreadConversationThreadItems(
                      userId,
                      usePerMessageUnread,
                  ),
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
    const contextKindFilter =
        contextKinds && contextKinds.length > 0 ? new Set(contextKinds) : null;
    const filteredItems = contextKindFilter
        ? itemsWithMuteState.filter((item) =>
              contextKindFilter.has(item.contextKind),
          )
        : itemsWithMuteState;
    const sortedItems = sortInboxItems(filteredItems);
    const counts = toCountMap(sortedItems);

    return {
        contractVersion: usePerMessageUnread ? "message_v2" : "thread_v1",
        counts,
        items: sortedItems.slice(0, limit),
        unreadCount: sortedItems.reduce(
            (total, item) => total + item.unreadCount,
            0,
        ),
    };
}

export async function listInboxDigest(params: {
    contextId?: string;
    contextKind?: InboxContextKind;
    limit: number;
    userId: string;
}): Promise<InboxDigestResponse> {
    const { contextId, contextKind, limit, userId } = params;
    const isContextScoped = Boolean(contextId && contextKind);
    const upstreamLimit = isContextScoped
        ? Number.POSITIVE_INFINITY
        : Math.max(1, limit);
    const inbox = await listInboxItems({
        kinds: ["mention", "thread"],
        limit: upstreamLimit,
        userId,
    });

    const scopedItems = isContextScoped
        ? inbox.items.filter(
              (item) =>
                  item.contextId === contextId &&
                  item.contextKind === contextKind,
          )
        : inbox.items;

    const sortedItems = [...scopedItems].sort((left, right) =>
        right.latestActivityAt.localeCompare(left.latestActivityAt),
    );
    const totalUnreadCount = scopedItems.reduce(
        (total, item) => total + item.unreadCount,
        0,
    );
    const pagedItems = sortedItems.slice(0, limit).map((item) => ({
        activityAt: item.latestActivityAt,
        authorAvatarUrl: item.authorAvatarUrl,
        authorLabel: item.authorLabel,
        authorUserId: item.authorUserId,
        contextId: item.contextId,
        contextKind: item.contextKind,
        id: item.id,
        kind: item.kind,
        messageId: item.messageId,
        muted: item.muted,
        parentMessageId: item.parentMessageId,
        previewText: item.previewText,
        serverId: item.serverId,
        unreadCount: item.unreadCount,
    }));

    return {
        contractVersion: inbox.contractVersion,
        contextId,
        contextKind,
        items: pagedItems,
        totalUnreadCount,
    };
}
