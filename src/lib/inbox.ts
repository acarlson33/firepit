import { Query } from "node-appwrite";

import { getRelationshipMap } from "@/lib/appwrite-friendships";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getAvatarUrl } from "@/lib/appwrite-profiles";
import { getServerClient } from "@/lib/appwrite-server";
import { logger, recordEvent, recordMetric } from "@/lib/newrelic-utils";
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
    RelationshipStatus,
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

type ThreadReplySignal = {
    latestReplyAt?: string;
    replyCount: number;
};

type ThreadParentSnapshot = {
    contextId: string;
    document: Record<string, unknown>;
    lastThreadReplyAt?: string;
    threadMessageCount?: number;
};

type ThreadContextField = "channelId" | "conversationId";
const DEFAULT_PAGE_LIMIT = 100;

const INBOX_CONVERSATION_SELECT_FIELDS = ["$id"] as const;
const INBOX_DM_THREAD_PARENT_SELECT_FIELDS = [
    "$id",
    "$createdAt",
    "conversationId",
    "lastThreadReplyAt",
    "senderId",
    "senderAvatarUrl",
    "senderDisplayName",
    "text",
    "threadMessageCount",
] as const;
const INBOX_CHANNEL_THREAD_PARENT_SELECT_FIELDS = [
    "$id",
    "$createdAt",
    "channelId",
    "lastThreadReplyAt",
    "serverId",
    "text",
    "threadMessageCount",
    "userId",
    "userName",
] as const;
const INBOX_PERSISTED_MENTION_SELECT_FIELDS = [
    "$id",
    "authorUserId",
    "contextId",
    "contextKind",
    "kind",
    "latestActivityAt",
    "messageId",
    "parentMessageId",
    "previewText",
    "readAt",
    "serverId",
    "userId",
] as const;
const INBOX_CHANNEL_THREAD_REPLY_SIGNAL_SELECT_FIELDS = [
    "$createdAt",
    "channelId",
    "threadId",
] as const;
const INBOX_CONVERSATION_THREAD_REPLY_SIGNAL_SELECT_FIELDS = [
    "$createdAt",
    "conversationId",
    "threadId",
] as const;
const PROFILE_SELECT_FIELDS = ["userId", "avatarFileId", "displayName"] as const;

type InboxRequestCaches = {
    authorProfileCache: Map<string, AuthorProfile>;
    channelAccessCache: Map<string, boolean>;
    missingAuthorProfileIds: Set<string>;
    relationshipCache: Map<string, RelationshipStatus | null>;
};

const DOCUMENT_QUERY_CHUNK_SIZE = 100;
const RELATIONSHIP_QUERY_CHUNK_SIZE = 100;

function selectQuery(fields: readonly string[]) {
    if (process.env.NODE_ENV === "test") {
        return [] as string[];
    }

    return [Query.select([...fields])];
}

function isSchemaAttributeMissingQueryError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { message?: unknown };
    if (typeof candidate.message !== "string") {
        return false;
    }

    const message = candidate.message.toLowerCase();
    return (
        message.includes("invalid query") &&
        message.includes("attribute not found in schema")
    );
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}

function maxIsoTimestamp(left?: string, right?: string) {
    if (left && right) {
        return left.localeCompare(right) >= 0 ? left : right;
    }

    return left ?? right;
}

function buildThreadParentSnapshot(params: {
    contextField: ThreadContextField;
    document: Record<string, unknown>;
    signal?: ThreadReplySignal;
}): ThreadParentSnapshot | null {
    const { contextField, document, signal } = params;
    const contextValue = document[contextField];
    if (typeof contextValue !== "string" || contextValue.length === 0) {
        return null;
    }

    const metadataLastReplyAt =
        typeof document.lastThreadReplyAt === "string"
            ? document.lastThreadReplyAt
            : undefined;
    const effectiveLastReplyAt = maxIsoTimestamp(
        metadataLastReplyAt,
        signal?.latestReplyAt,
    );

    const metadataThreadCount =
        typeof document.threadMessageCount === "number"
            ? document.threadMessageCount
            : 0;
    const signalThreadCount = signal?.replyCount ?? 0;
    const effectiveThreadCount = Math.max(metadataThreadCount, signalThreadCount);
    let threadMessageCount: number | undefined;

    if (effectiveThreadCount > 0) {
        threadMessageCount = effectiveThreadCount;
    } else if (effectiveLastReplyAt) {
        threadMessageCount = 1;
    }

    return {
        contextId: contextValue,
        document,
        lastThreadReplyAt: effectiveLastReplyAt,
        threadMessageCount,
    };
}

/**
 * Determines whether is blocked relationship.
 *
 * @param {{ blockedByMe?: boolean | undefined; blockedMe?: boolean | undefined; }} value - The value value.
 * @returns {boolean} The return value.
 */
function isBlockedRelationship(value: {
    blockedByMe?: boolean;
    blockedMe?: boolean;
}) {
    return Boolean(value.blockedByMe || value.blockedMe);
}

/**
 * Handles to count map.
 *
 * @param {InboxItem[]} items - The items value.
 * @returns {{ [x: string]: number; }} The return value.
 */
function toCountMap(items: InboxItem[]): Record<InboxItemKind, number> {
    return items.reduce<Record<InboxItemKind, number>>(
        (accumulator, item) => {
            accumulator[item.kind] += item.unreadCount;
            return accumulator;
        },
        { mention: 0, thread: 0 },
    );
}

/**
 * Handles sort inbox items.
 *
 * @param {InboxItem[]} items - The items value.
 * @returns {InboxItem[]} The return value.
 */
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

/**
 * Lists all documents for a collection using cursor pagination.
 *
 * @param {{ collectionId: string; pageLimit?: number | undefined; queries?: string[] | undefined; }} params - The params value.
 * @returns {Promise<Record<string, unknown>[]>} The return value.
 */
async function listAllDocuments(params: {
    collectionId: string;
    pageLimit?: number;
    queries?: string[];
    selectFields?: readonly string[];
}) {
    const {
        collectionId,
        pageLimit = DEFAULT_PAGE_LIMIT,
        queries = [],
        selectFields,
    } = params;
    const env = getEnvConfig();
    const { databases } = getServerClient();

    const { documents } = await import("@/lib/appwrite-pagination").then((m) =>
        m.listPages({
            databases,
            databaseId: env.databaseId,
            collectionId,
            baseQueries: [...queries, ...(selectFields && selectFields.length > 0 ? selectQuery(selectFields) : [])],
            pageSize: pageLimit,
            warningContext: `listAllDocuments:${collectionId}`,
        }),
    );

    return documents as Record<string, unknown>[];
}

async function listDocumentsByIds(params: {
    collectionId: string;
    contextField?: ThreadContextField;
    contextIds?: string[];
    ids: string[];
    selectFields?: readonly string[];
}) {
    const {
        collectionId,
        contextField,
        contextIds,
        ids,
        selectFields,
    } = params;
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const uniqueIds = Array.from(new Set(ids.filter((id) => id.length > 0)));
    if (uniqueIds.length === 0) {
        return [] as Record<string, unknown>[];
    }

    const responses = await Promise.all(
        chunkArray(uniqueIds, DOCUMENT_QUERY_CHUNK_SIZE).map(async (idChunk) => {
            let shouldSelectFields = Boolean(
                selectFields && selectFields.length > 0,
            );

            while (true) {
                const queries = [
                    Query.equal("$id", idChunk),
                    Query.limit(idChunk.length),
                ];
                if (contextField && contextIds && contextIds.length > 0) {
                    queries.push(Query.equal(contextField, contextIds));
                }
                if (shouldSelectFields && selectFields && selectFields.length > 0) {
                    queries.push(...selectQuery(selectFields));
                }

                try {
                    return await databases.listDocuments(
                        env.databaseId,
                        collectionId,
                        queries,
                    );
                } catch (error) {
                    if (
                        shouldSelectFields &&
                        isSchemaAttributeMissingQueryError(error)
                    ) {
                        shouldSelectFields = false;
                        continue;
                    }

                    throw error;
                }
            }
        }),
    );

    return responses.flatMap(
        (response) => response.documents as unknown as Record<string, unknown>[],
    );
}

function toThreadReplySignals(
    documents: Array<Record<string, unknown>>,
) {
    const signalsByParentId = new Map<string, ThreadReplySignal>();

    for (const document of documents) {
        const threadId =
            typeof document.threadId === "string" ? document.threadId : null;
        if (!threadId) {
            continue;
        }

        const createdAt =
            typeof document.$createdAt === "string" ? document.$createdAt : undefined;

        const existingSignal = signalsByParentId.get(threadId);
        if (existingSignal) {
            existingSignal.replyCount += 1;
            existingSignal.latestReplyAt = maxIsoTimestamp(
                existingSignal.latestReplyAt,
                createdAt,
            );
            continue;
        }

        signalsByParentId.set(threadId, {
            latestReplyAt: createdAt,
            replyCount: 1,
        });
    }

    return signalsByParentId;
}

async function listThreadReplySignals(params: {
    collectionId: string;
    contextField: ThreadContextField;
    contextIds: string[];
}) {
    const { collectionId, contextField, contextIds } = params;
    if (contextIds.length === 0) {
        return new Map<string, ThreadReplySignal>();
    }

    const selectFields =
        contextField === "channelId"
            ? INBOX_CHANNEL_THREAD_REPLY_SIGNAL_SELECT_FIELDS
            : INBOX_CONVERSATION_THREAD_REPLY_SIGNAL_SELECT_FIELDS;

    const documents = await listAllDocuments({
        collectionId,
        queries: [
            Query.equal(contextField, contextIds),
            Query.isNotNull("threadId"),
        ],
        selectFields,
    });

    return toThreadReplySignals(documents);
}

async function listRecentThreadReplySignals(
    collectionId: string,
    selectFields: readonly string[],
) {
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const response = await databases.listDocuments(
        env.databaseId,
        collectionId,
        [
            Query.isNotNull("threadId"),
            Query.orderDesc("$createdAt"),
            Query.limit(DEFAULT_PAGE_LIMIT),
            ...selectQuery(selectFields),
        ],
    );

    return toThreadReplySignals(
        response.documents as unknown as Array<Record<string, unknown>>,
    );
}

/**
 * Handles count unread replies by parent.
 *
 * @param {{ collectionId: string; contextField: ThreadContextField; parents: UnreadThreadParentInput[]; }} params - The params value.
 * @returns {Promise<Map<string, number>>} The return value.
 */
async function countUnreadRepliesByParent(params: {
    collectionId: string;
    contextField: ThreadContextField;
    parents: UnreadThreadParentInput[];
}) {
    const { collectionId, contextField, parents } = params;
    const env = getEnvConfig();
    const { databases } = getServerClient();

    // When we cannot compute an exact unread delta, we fall back to a minimal
    // non-zero count and rely on a cached unread counter for better precision.
    const countsByParentId = new Map<string, number>();
    const parentsThatNeedQuery: UnreadThreadParentInput[] = [];

    for (const parent of parents) {
        // Without lastReadAt we cannot calculate unread deltas, so thread totals
        // are the only approximation available unless a cached unread counter exists.
        if (!parent.lastReadAt) {
            const fallbackCount =
                typeof parent.threadMessageCount === "number" &&
                parent.threadMessageCount > 0
                    ? parent.threadMessageCount
                    : 1;
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

            try {
                const result = await databases.listDocuments(
                    env.databaseId,
                    collectionId,
                    [
                        Query.equal(contextField, parent.contextId),
                        Query.equal("threadId", parent.parentMessageId),
                        Query.greaterThan("$createdAt", lastReadAt),
                        Query.limit(1),
                        ...selectQuery(["$id"]),
                    ],
                );

                countsByParentId.set(
                    parent.parentMessageId,
                    Math.max(1, result.total || 0),
                );
            } catch (error) {
                recordMetric("inbox.unread_thread_count_query_fallback", 1);
                recordEvent("inbox.unread_thread_count_query_failed", {
                    contextId: parent.contextId,
                    parentMessageId: parent.parentMessageId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                // threadMessageCount is total replies, not unread replies. Any
                // closer approximation here must come from a cached unread counter.
                countsByParentId.set(parent.parentMessageId, 1);
            }
        },
    });

    return countsByParentId;
}

/**
 * Lists conversation documents.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<Record<string, unknown>[]>} The return value.
 */
async function listConversationDocuments(userId: string) {
    const env = getEnvConfig();
    const documents = await listAllDocuments({
        collectionId: env.collections.conversations,
        queries: [
            Query.contains("participants", userId),
            Query.orderDesc("lastMessageAt"),
        ],
        selectFields: INBOX_CONVERSATION_SELECT_FIELDS,
    });

    return documents as Array<Record<string, unknown>>;
}

/**
 * Handles load author profiles.
 *
 * @param {string[]} userIds - The user ids value.
 * @returns {Promise<any>} The return value.
 */
async function loadAuthorProfiles(
    userIds: string[],
    options?: {
        cache?: InboxRequestCaches;
    },
) {
    if (userIds.length === 0) {
        return new Map<string, AuthorProfile>();
    }

    const cache = options?.cache;
    const uniqueUserIds = Array.from(
        new Set(userIds.filter((userId) => userId.length > 0)),
    );
    const profileMap = new Map<string, AuthorProfile>();

    for (const userId of uniqueUserIds) {
        const cachedProfile = cache?.authorProfileCache.get(userId);
        if (cachedProfile) {
            profileMap.set(userId, cachedProfile);
        }
    }

    const uncachedUserIds = uniqueUserIds.filter(
        (userId) =>
            !cache?.authorProfileCache.has(userId) &&
            !cache?.missingAuthorProfileIds.has(userId),
    );

    if (uncachedUserIds.length === 0) {
        return profileMap;
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();
    for (const userIdChunk of chunkArray(
        uncachedUserIds,
        DOCUMENT_QUERY_CHUNK_SIZE,
    )) {
        const response = await databases.listDocuments(
            env.databaseId,
            env.collections.profiles,
            [
                Query.equal("userId", userIdChunk),
                Query.limit(userIdChunk.length),
                ...selectQuery(PROFILE_SELECT_FIELDS),
            ],
        );

        const fetchedUserIds = new Set<string>();
        for (const document of response.documents) {
            const userId = String(document.userId);
            fetchedUserIds.add(userId);
            const profile: AuthorProfile = {
                avatarUrl:
                    typeof document.avatarFileId === "string"
                        ? getAvatarUrl(document.avatarFileId)
                        : undefined,
                displayName:
                    typeof document.displayName === "string"
                        ? document.displayName
                        : undefined,
            };

            profileMap.set(userId, profile);
            cache?.authorProfileCache.set(userId, profile);
        }

        for (const userId of userIdChunk) {
            if (!fetchedUserIds.has(userId)) {
                cache?.missingAuthorProfileIds.add(userId);
            }
        }
    }

    return profileMap;
}

async function loadRelationshipMap(
    userId: string,
    otherUserIds: string[],
    options?: {
        cache?: InboxRequestCaches;
    },
) {
    if (otherUserIds.length === 0) {
        return new Map<string, RelationshipStatus>();
    }

    const cache = options?.cache;
    const uniqueUserIds = Array.from(
        new Set(
            otherUserIds.filter(
                (otherUserId) =>
                    otherUserId.length > 0 && otherUserId !== userId,
            ),
        ),
    );

    const unresolvedUserIds = uniqueUserIds.filter(
        (otherUserId) => !cache?.relationshipCache.has(otherUserId),
    );

    const relationshipChunks = chunkArray(
        unresolvedUserIds,
        RELATIONSHIP_QUERY_CHUNK_SIZE,
    );
    const relationshipEntries = await Promise.all(
        relationshipChunks.map(async (userIdChunk) => ({
            relationshipMap: await getRelationshipMap(userId, userIdChunk),
            userIdChunk,
        })),
    );

    for (const { relationshipMap, userIdChunk } of relationshipEntries) {
        for (const [otherUserId, relationshipStatus] of relationshipMap) {
            cache?.relationshipCache.set(otherUserId, relationshipStatus);
        }

        for (const otherUserId of userIdChunk) {
            if (!cache?.relationshipCache.has(otherUserId)) {
                cache?.relationshipCache.set(otherUserId, null);
            }
        }
    }

    return uniqueUserIds.reduce<Map<string, RelationshipStatus>>(
        (accumulator, otherUserId) => {
            const relationshipStatus = cache?.relationshipCache.get(otherUserId);
            if (relationshipStatus !== undefined && relationshipStatus !== null) {
                accumulator.set(otherUserId, relationshipStatus);
            }
            return accumulator;
        },
        new Map<string, RelationshipStatus>(),
    );
}

async function filterReadableChannelContexts<T>(
    userId: string,
    items: T[],
    getChannelId: (item: T) => string | null,
    options?: {
        channelAccessCache?: Map<string, boolean>;
    },
) {
    const env = getEnvConfig();
    const { databases } = getServerClient();
    const channelAccessCache = options?.channelAccessCache;
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

    const readableChannelIds = new Set<string>(
        channelIds.filter((channelId) => channelAccessCache?.get(channelId) === true),
    );
    const unknownChannelIds = channelIds.filter(
        (channelId) => channelAccessCache?.has(channelId) !== true,
    );

    await runInBatches({
        batchSize: 20,
        items: unknownChannelIds,
        worker: async (channelId) => {
            try {
                const access = await getChannelAccessForUser(
                    databases,
                    env,
                    channelId,
                    userId,
                );
                const canRead = Boolean(access.canRead);
                channelAccessCache?.set(channelId, canRead);
                if (canRead) {
                    readableChannelIds.add(channelId);
                }
            } catch (error) {
                channelAccessCache?.set(channelId, false);
                logger.debug("Channel access check failed", {
                    channelId,
                    error: error instanceof Error ? error.message : String(error),
                    userId,
                });
            }
        },
    });

    return items.filter((item) => {
        const channelId = getChannelId(item);
        if (!channelId) {
            return true;
        }

        return readableChannelIds.has(channelId);
    });
}

/**
 * Handles apply mute state.
 *
 * @param {string} userId - The user id value.
 * @param {InboxItem[]} items - The items value.
 * @returns {Promise<InboxItem[]>} The return value.
 */
async function applyMuteState(userId: string, items: InboxItem[]) {
    if (items.length === 0) {
        return items;
    }

    const settings = await getNotificationSettings(userId);
    if (!settings) {
        return items;
    }

    return items.flatMap((item) => {
        const effectiveLevel = getEffectiveNotificationLevel(settings, {
            channelId:
                item.contextKind === "channel" ? item.contextId : undefined,
            conversationId:
                item.contextKind === "conversation"
                    ? item.contextId
                    : undefined,
            serverId: item.serverId,
        });

        if (effectiveLevel === "mentions" && item.kind === "thread") {
            return [] as InboxItem[];
        }

        return [
            {
                ...item,
                muted: effectiveLevel === "nothing",
            } satisfies InboxItem,
        ];
    });
}

/**
 * Lists unread conversation thread items.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<InboxItem[]>} The return value.
 */
async function listUnreadConversationThreadItems(
    userId: string,
    options?: {
        cache?: InboxRequestCaches;
    },
): Promise<InboxItem[]> {
    const env = getEnvConfig();
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

    const threadParents = await listAllDocuments({
        collectionId: env.collections.directMessages,
        queries: [
            Query.equal("conversationId", conversationIds),
            Query.greaterThan("threadMessageCount", 0),
        ],
        selectFields: INBOX_DM_THREAD_PARENT_SELECT_FIELDS,
    });

    const replySignalsByParentId = await listThreadReplySignals({
        collectionId: env.collections.directMessages,
        contextField: "conversationId",
        contextIds: conversationIds,
    });

    const threadParentsById = new Map<string, Record<string, unknown>>(
        threadParents
            .filter(
                (document): document is Record<string, unknown> =>
                    typeof document.$id === "string" && document.$id.length > 0,
            )
            .map((document) => [String(document.$id), document]),
    );
    const missingParentIds = Array.from(replySignalsByParentId.keys()).filter(
        (parentMessageId) => !threadParentsById.has(parentMessageId),
    );

    if (missingParentIds.length > 0) {
        const missingThreadParents = await listDocumentsByIds({
            collectionId: env.collections.directMessages,
            contextField: "conversationId",
            contextIds: conversationIds,
            ids: missingParentIds,
            selectFields: INBOX_DM_THREAD_PARENT_SELECT_FIELDS,
        });

        for (const document of missingThreadParents) {
            const messageId =
                typeof document.$id === "string" ? document.$id : null;
            if (!messageId) {
                continue;
            }

            threadParentsById.set(messageId, document);
        }
    }

    const threadParentSnapshots = Array.from(threadParentsById.values()).flatMap(
        (document) => {
            const messageId =
                typeof document.$id === "string" ? document.$id : null;
            if (!messageId) {
                return [] as ThreadParentSnapshot[];
            }

            const snapshot = buildThreadParentSnapshot({
                contextField: "conversationId",
                document,
                signal: replySignalsByParentId.get(messageId),
            });
            return snapshot ? [snapshot] : [];
        },
    );

    const unreadDocuments = threadParentSnapshots.filter((snapshot) => {
        const messageId = String(snapshot.document.$id);

        return isThreadUnread({
            lastReadAt: readStatesByConversationId.get(snapshot.contextId)?.[messageId],
            lastThreadReplyAt: snapshot.lastThreadReplyAt,
            threadMessageCount: snapshot.threadMessageCount,
        });
    });

    const unreadCountsByParent = await countUnreadRepliesByParent({
        collectionId: env.collections.directMessages,
        contextField: "conversationId",
        parents: unreadDocuments.map((snapshot) => {
            const parentMessageId = String(snapshot.document.$id);

            return {
                contextId: snapshot.contextId,
                lastReadAt: readStatesByConversationId.get(snapshot.contextId)?.[
                    parentMessageId
                ],
                parentMessageId,
                threadMessageCount: snapshot.threadMessageCount,
            } satisfies UnreadThreadParentInput;
        }),
    });

    const authorIds = Array.from(
        new Set(
            unreadDocuments.map((snapshot) => String(snapshot.document.senderId)),
        ),
    );
    const [profileMap, relationshipMap] = await Promise.all([
        loadAuthorProfiles(authorIds, options),
        loadRelationshipMap(userId, authorIds, options),
    ]);

    return unreadDocuments.flatMap((snapshot) => {
        const document = snapshot.document;
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
                latestActivityAt: snapshot.lastThreadReplyAt ?? String(document.$createdAt),
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

/**
 * Lists unread channel thread items.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<InboxItem[]>} The return value.
 */
async function listUnreadChannelThreadItems(
    userId: string,
    options?: {
        cache?: InboxRequestCaches;
    },
): Promise<InboxItem[]> {
    const env = getEnvConfig();
    const threadParents = await listAllDocuments({
        collectionId: env.collections.messages,
        queries: [Query.greaterThan("threadMessageCount", 0)],
        selectFields: INBOX_CHANNEL_THREAD_PARENT_SELECT_FIELDS,
    });

    const channelIdsFromThreadMetadata = Array.from(
        new Set(
            threadParents.flatMap((document) =>
                typeof document.channelId === "string"
                    ? [document.channelId]
                    : [],
            ),
        ),
    );

    // Always include recent/global reply signals and merge channel-specific
    // reply signals when available. This ensures we don't miss active threads
    // in channels whose parent metadata may be stale.
    const recentSignalsPromise = listRecentThreadReplySignals(
        env.collections.messages,
        INBOX_CHANNEL_THREAD_REPLY_SIGNAL_SELECT_FIELDS,
    );

    let channelSignalsPromise: Promise<Map<string, ThreadReplySignal>> | null = null;
    if (channelIdsFromThreadMetadata.length > 0) {
        channelSignalsPromise = listThreadReplySignals({
            collectionId: env.collections.messages,
            contextField: "channelId",
            contextIds: channelIdsFromThreadMetadata,
        });
    }

    const recentSignals = await recentSignalsPromise;
    const channelSignals = channelSignalsPromise ? await channelSignalsPromise : new Map();

    // Merge maps: channel-specific signals take precedence over recent/global ones
    const replySignalsByParentId = new Map<string, ThreadReplySignal>(recentSignals);
    for (const [k, v] of channelSignals.entries()) {
        replySignalsByParentId.set(k, v);
    }

    const threadParentsById = new Map<string, Record<string, unknown>>(
        threadParents
            .filter(
                (document): document is Record<string, unknown> =>
                    typeof document.$id === "string" && document.$id.length > 0,
            )
            .map((document) => [String(document.$id), document]),
    );
    const missingParentIds = Array.from(replySignalsByParentId.keys()).filter(
        (parentMessageId) => !threadParentsById.has(parentMessageId),
    );

    if (missingParentIds.length > 0) {
        const missingThreadParents = await listDocumentsByIds({
            collectionId: env.collections.messages,
            contextField: "channelId",
            contextIds: channelIdsFromThreadMetadata,
            ids: missingParentIds,
            selectFields: INBOX_CHANNEL_THREAD_PARENT_SELECT_FIELDS,
        });

        for (const document of missingThreadParents) {
            const messageId =
                typeof document.$id === "string" ? document.$id : null;
            if (!messageId) {
                continue;
            }

            threadParentsById.set(messageId, document);
        }
    }

    const threadParentSnapshots = Array.from(threadParentsById.values()).flatMap(
        (document) => {
            const messageId =
                typeof document.$id === "string" ? document.$id : null;
            if (!messageId) {
                return [] as ThreadParentSnapshot[];
            }

            const snapshot = buildThreadParentSnapshot({
                contextField: "channelId",
                document,
                signal: replySignalsByParentId.get(messageId),
            });
            return snapshot ? [snapshot] : [];
        },
    );

    const channelIds = Array.from(
        new Set(threadParentSnapshots.map((snapshot) => snapshot.contextId)),
    );

    if (channelIds.length === 0) {
        return [];
    }

    const readStatesByChannelId = await listThreadReadsByContext({
        contextIds: channelIds,
        contextType: "channel",
        userId,
    });

    const unreadDocuments = threadParentSnapshots.filter((snapshot) => {
        const channelId = snapshot.contextId;
        const messageId = String(snapshot.document.$id);

        return isThreadUnread({
            lastReadAt: readStatesByChannelId.get(channelId)?.[messageId],
            lastThreadReplyAt: snapshot.lastThreadReplyAt,
            threadMessageCount: snapshot.threadMessageCount,
        });
    });

    const readableDocuments = await filterReadableChannelContexts(
        userId,
        unreadDocuments,
        (snapshot) => snapshot.contextId,
        {
            channelAccessCache: options?.cache?.channelAccessCache,
        },
    );

    const unreadCountsByParent = await countUnreadRepliesByParent({
        collectionId: env.collections.messages,
        contextField: "channelId",
        parents: readableDocuments.map((snapshot) => {
            const parentMessageId = String(snapshot.document.$id);

            return {
                contextId: snapshot.contextId,
                lastReadAt: readStatesByChannelId.get(snapshot.contextId)?.[
                    parentMessageId
                ],
                parentMessageId,
                threadMessageCount: snapshot.threadMessageCount,
            } satisfies UnreadThreadParentInput;
        }),
    });

    const authorIds = Array.from(
        new Set(
            readableDocuments.map((snapshot) => String(snapshot.document.userId)),
        ),
    );
    const [profileMap, relationshipMap] = await Promise.all([
        loadAuthorProfiles(authorIds, options),
        loadRelationshipMap(userId, authorIds, options),
    ]);

    return readableDocuments.flatMap((snapshot) => {
        const document = snapshot.document;
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
                latestActivityAt: snapshot.lastThreadReplyAt ?? String(document.$createdAt),
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

/**
 * Lists persisted mention items.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<InboxItem[]>} The return value.
 */
async function listPersistedMentionItems(
    userId: string,
    options?: {
        cache?: InboxRequestCaches;
    },
): Promise<InboxItem[]> {
    const env = getEnvConfig();
    const documents = await listAllDocuments({
        collectionId: env.collections.inboxItems,
        queries: [
            Query.equal("userId", userId),
            Query.equal("kind", "mention"),
            Query.isNull("readAt"),
            Query.orderDesc("latestActivityAt"),
        ],
        selectFields: INBOX_PERSISTED_MENTION_SELECT_FIELDS,
    });

    const visibleDocuments = await filterReadableChannelContexts(
        userId,
        documents as InboxItemDocument[],
        (document) =>
            document.contextKind === "channel" ? document.contextId : null,
        {
            channelAccessCache: options?.cache?.channelAccessCache,
        },
    );

    const authorIds = Array.from(
        new Set(visibleDocuments.map((document) => document.authorUserId)),
    );
    const [profileMap, relationshipMap] = await Promise.all([
        loadAuthorProfiles(authorIds, options),
        loadRelationshipMap(userId, authorIds, options),
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

/**
 * Lists inbox items.
 *
 * @param {{ contextKinds?: InboxContextKind[] | undefined; kinds: InboxItemKind[]; limit: number; userId: string; }} params - The params value.
 * @returns {Promise<{ contractVersion: InboxDigestResponse; counts: Record<InboxItemKind, number>; items: InboxItem[]; unreadCount: number; }>} The return value.
 */
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
    const requestedKinds = new Set(kinds);
    const caches: InboxRequestCaches = {
        authorProfileCache: new Map(),
        channelAccessCache: new Map(),
        missingAuthorProfileIds: new Set(),
        relationshipCache: new Map(),
    };
    const itemGroups = await Promise.all([
        requestedKinds.has("thread")
            ? Promise.all([
                  listUnreadChannelThreadItems(userId, {
                      cache: caches,
                  }),
                  listUnreadConversationThreadItems(userId, {
                      cache: caches,
                  }),
              ]).then(([channelItems, conversationItems]) => [
                  ...channelItems,
                  ...conversationItems,
              ])
            : Promise.resolve([]),
        requestedKinds.has("mention")
            ? listPersistedMentionItems(userId, {
                  cache: caches,
              }).catch(() => [])
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
        contractVersion: "message_v2",
        counts,
        items: sortedItems.slice(0, limit),
        unreadCount: sortedItems.reduce(
            (total, item) => total + item.unreadCount,
            0,
        ),
    };
}

/**
 * Lists inbox digest.
 *
 * @param {{ contextId?: string | undefined; contextKind?: any; limit: number; userId: string; }} params - The params value.
 * @returns {Promise<InboxDigestResponse>} The return value.
 */
export async function listInboxDigest(params: {
    contextId?: string;
    contextKind?: InboxContextKind;
    limit: number;
    userId: string;
}): Promise<InboxDigestResponse> {
    const startedAt = Date.now();
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
    const totalUnreadCount = isContextScoped
        ? scopedItems.reduce((total, item) => total + item.unreadCount, 0)
        : inbox.unreadCount;
    const pagedItems = buildDigestItems(scopedItems, limit);

    const durationMs = Date.now() - startedAt;
    recordMetric("Custom/InboxDigest/DurationMs", durationMs);
    recordMetric("Custom/InboxDigest/ReturnedItems", pagedItems.length);
    recordMetric("Custom/InboxDigest/TotalUnread", totalUnreadCount);
    recordEvent("InboxDigestGenerated", {
        contextKind: contextKind ?? "all",
        isContextScoped,
        mode: "v1_5",
        requestedLimit: limit,
        returnedItems: pagedItems.length,
        totalUnreadCount,
        userId,
        durationMs,
    });

    return {
        contractVersion: inbox.contractVersion,
        navigationFallback: "context_catch_up",
        ordering: "triage_priority",
        presentation: "flat",
        contextId,
        contextKind,
        items: pagedItems,
        totalUnreadCount,
    };
}

function buildDigestItems(
    items: InboxItem[],
    limit: number,
): InboxDigestResponse["items"] {
    const triagedItems = [...items].sort((left, right) => {
        const leftKindPriority = left.kind === "mention" ? 0 : 1;
        const rightKindPriority = right.kind === "mention" ? 0 : 1;
        if (leftKindPriority !== rightKindPriority) {
            return leftKindPriority - rightKindPriority;
        }

        const leftMutedPriority = left.muted ? 1 : 0;
        const rightMutedPriority = right.muted ? 1 : 0;
        if (leftMutedPriority !== rightMutedPriority) {
            return leftMutedPriority - rightMutedPriority;
        }

        if (left.unreadCount !== right.unreadCount) {
            return right.unreadCount - left.unreadCount;
        }

        const activityOrder = right.latestActivityAt.localeCompare(
            left.latestActivityAt,
        );
        if (activityOrder !== 0) {
            return activityOrder;
        }

        return left.id.localeCompare(right.id);
    });

    return triagedItems.slice(0, limit).map((item) => ({
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
}
