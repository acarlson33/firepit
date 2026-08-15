import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Query, Permission, Role } from "node-appwrite";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { FileAttachment, RelationshipStatus } from "@/lib/types";
import {
    getRelationshipMap,
    getRelationshipStatus,
    getFriendshipByPair,
    getBlockStatus,
} from "@/lib/appwrite-friendships";
import {
    getNotificationSettings,
} from "@/lib/notification-settings";
import { getAvatarUrl, getUserProfile, getUserProfilesBatch } from "@/lib/appwrite-profiles";
import { listThreadReadsByContext } from "@/lib/thread-read-store";
import { isThreadUnread } from "@/lib/thread-read-states";
import {
    logger,
    recordError,
    recordEvent,
    setTransactionName,
    trackApiCall,
    trackMessage,
    addTransactionAttributes,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import { upsertMentionInboxItems, upsertMessageInboxItems } from "@/lib/inbox-items";
import { resolveMessageImageUrl } from "@/lib/message-image-url";
import { apiCache } from "@/lib/cache-utils";
import {
    buildAttachmentDocumentData,
    buildLegacyAttachmentDocumentData,
    isUnknownAttachmentAttributeError,
    normalizeFileAttachmentsInput,
} from "@/lib/file-attachments";
import { rememberDmUnreadThreadSnapshot } from "@/lib/unread-consistency";
import { listPages } from "@/lib/appwrite-pagination";
import { dispatchPushNotification } from "@/lib/push-notifications";
import { parseReactions } from "@/lib/reactions-utils";
import {
    buildMessagePoll,
    isPollCommand,
    parsePollCommand,
    parsePollOptions,
    serializePollOptions,
} from "@/lib/polls";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const CONVERSATIONS_COLLECTION = env.collections.conversations;
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const MESSAGE_ATTACHMENTS_COLLECTION_ID = env.collections.messageAttachments;
const SYSTEM_SENDER_USER_ID = process.env.SYSTEM_SENDER_USER_ID?.trim() || null;
const SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON =
    "Replies are disabled for system announcements";
const DIRECT_MESSAGES_CACHE_TTL_MS = 10 * 1000;

if (SYSTEM_SENDER_USER_ID === null && process.env.NODE_ENV !== "test") {
    logger.warn(
        "SYSTEM_SENDER_USER_ID is not configured. System announcement threads will be read-only for all users.",
        {
            envVar: "SYSTEM_SENDER_USER_ID",
            impact:
                "Replies to system announcement threads are disabled unless this is set to the system sender user id.",
        },
    );
}

function canUseDirectMessageCache(): boolean {
    return (
        process.env.ENABLE_DIRECT_MESSAGE_CACHE === "true" ||
        process.env.NODE_ENV === "production"
    );
}

function dedupeDirectMessageCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = DIRECT_MESSAGES_CACHE_TTL_MS,
): Promise<T> {
    if (!canUseDirectMessageCache()) {
        return fetcher();
    }

    return apiCache.dedupe(key, fetcher, ttl);
}

function clearDmConversationsCache(participantIds: string[]): void {
    const uniqueParticipantIds = new Set(
        participantIds
            .map((participantId) => participantId.trim())
            .filter((participantId) => participantId.length > 0),
    );

    for (const participantId of uniqueParticipantIds) {
        apiCache.clearPrefix(`dm:conversations:${participantId}`);
    }
}

function normalizeDistinctIds(ids: string[], excluding?: string): string[] {
    return Array.from(
        new Set(
            ids.filter(
                (id) =>
                    id.length > 0 &&
                    (excluding === undefined || id !== excluding),
            ),
        ),
    ).sort();
}



function getReadOnlyReason(relationship: {
    blockedByMe: boolean;
    blockedMe: boolean;
    directMessagePrivacy: "everyone" | "friends";
    isFriend: boolean;
}) {
    if (relationship.blockedByMe) {
        return "You blocked this user";
    }

    if (relationship.blockedMe) {
        return "This user blocked you";
    }

    if (
        relationship.directMessagePrivacy === "friends" &&
        !relationship.isFriend
    ) {
        return "This user only accepts direct messages from friends";
    }

    return undefined;
}

function includesSystemSenderParticipant(participants: string[]): boolean {
    return (
        SYSTEM_SENDER_USER_ID !== null &&
        participants.includes(SYSTEM_SENDER_USER_ID)
    );
}

async function getDmEncryptionStateForPair(
    userId: string,
    peerUserId: string,
): Promise<{
    dmEncryptionMutualEnabled: boolean;
    dmEncryptionPeerEnabled: boolean;
    dmEncryptionPeerPublicKey?: string;
    dmEncryptionSelfEnabled: boolean;
}> {
    const [selfSettings, peerSettings, peerProfile] = await Promise.all([
        getNotificationSettings(userId)
            .then((settings) => settings ?? { dmEncryptionEnabled: false })
            .catch((error) => {
                logger.warn("Failed to load self notification settings for DM encryption", {
                    error: error instanceof Error ? error.message : String(error),
                    userId,
                    peerUserId,
                });
                return { dmEncryptionEnabled: false };
            }),
        getNotificationSettings(peerUserId)
            .then((settings) => settings ?? { dmEncryptionEnabled: false })
            .catch((error) => {
                logger.warn(
                    "Failed to load peer notification settings for DM encryption",
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        userId,
                        peerUserId,
                    },
                );
                return { dmEncryptionEnabled: false };
            }),
        getUserProfile(peerUserId).catch((error) => {
            logger.warn("Failed to load peer profile for DM encryption", {
                error: error instanceof Error ? error.message : String(error),
                userId,
                peerUserId,
            });
            return null;
        }),
    ]);

    const dmEncryptionSelfEnabled = Boolean(selfSettings.dmEncryptionEnabled);
    const dmEncryptionPeerEnabled = Boolean(peerSettings.dmEncryptionEnabled);
    const dmEncryptionPeerPublicKey =
        typeof peerProfile?.dmEncryptionPublicKey === "string"
            ? peerProfile.dmEncryptionPublicKey
            : undefined;

    return {
        dmEncryptionMutualEnabled:
            dmEncryptionSelfEnabled && dmEncryptionPeerEnabled,
        dmEncryptionPeerEnabled,
        dmEncryptionPeerPublicKey,
        dmEncryptionSelfEnabled,
    };
}

/**
 * Helper to create attachment records for a direct message
 * Returns array of created attachment document IDs
 */
async function createAttachments(
    databases: ReturnType<typeof getServerClient>["databases"],
    messageId: string,
    attachments: FileAttachment[],
): Promise<string[]> {
    if (!attachments || attachments.length === 0) {
        return [];
    }

    if (!MESSAGE_ATTACHMENTS_COLLECTION_ID) {
        throw new Error("attachment storage not configured");
    }

    const createdIds: string[] = [];

    const rethrowWithCreatedIds = (error: unknown): never => {
        const attachmentError =
            error instanceof Error ? error : new Error(String(error));
        (attachmentError as Error & { createdIds: string[] }).createdIds = [
            ...createdIds,
        ];
        throw attachmentError;
    };

    for (const attachment of attachments) {
        try {
            const payload = buildAttachmentDocumentData({
                attachment,
                messageId,
                messageType: "dm",
            });
            const result = await databases.createDocument(
                DATABASE_ID,
                MESSAGE_ATTACHMENTS_COLLECTION_ID,
                ID.unique(),
                payload,
            );
            createdIds.push(String(result.$id));
        } catch (error) {
            if (!isUnknownAttachmentAttributeError(error)) {
                rethrowWithCreatedIds(error);
            }

            try {
                const legacyResult = await databases.createDocument(
                    DATABASE_ID,
                    MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    ID.unique(),
                    buildLegacyAttachmentDocumentData({
                        attachment,
                        messageId,
                        messageType: "dm",
                    }),
                );
                createdIds.push(String(legacyResult.$id));
            } catch (legacyError) {
                rethrowWithCreatedIds(legacyError);
            }
        }
    }

    return createdIds;
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

if (ALLOWED_ORIGINS.length === 0) {
    logger.warn(
        "ALLOWED_ORIGINS is empty; direct-messages route will only allow same-origin requests",
    );
}

function getAllowedOrigin(request?: Request) {
    const origin = request?.headers.get("origin");
    if (!origin) {
        return undefined;
    }

    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

function isSameOrigin(request: Request, originHeader: string): boolean {
    try {
        return new URL(request.url).origin === originHeader;
    } catch {
        return false;
    }
}

function ensureAllowedRequestOrigin(request: Request): string | null {
    const origin = request.headers.get("origin");
    if (!origin) {
        return null;
    }

    if (isSameOrigin(request, origin)) {
        return null;
    }

    return ALLOWED_ORIGINS.includes(origin) ? null : origin;
}

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit, request?: Request) {
    const headers = new Headers(init?.headers);
    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS",
    );
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
        headers.set("Access-Control-Allow-Origin", allowedOrigin);
        headers.set("Access-Control-Allow-Credentials", "true");
    }

    return NextResponse.json(data, {
        ...init,
        headers,
    });
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
    const disallowedOrigin = ensureAllowedRequestOrigin(request);
    if (disallowedOrigin) {
        return jsonResponse(
            { error: "Origin is not allowed" },
            { status: 403 },
            request,
        );
    }

    return jsonResponse({}, undefined, request);
}

/**
 * GET /api/direct-messages
 *
 * Operations:
 * - List conversations: ?type=conversations
 * - List messages: ?type=messages&conversationId=xxx
 * - Get/create conversation: ?type=conversation&userId1=xxx&userId2=xxx
 */
export async function GET(request: NextRequest) {
    const startTime = Date.now();

    try {
        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized DM access attempt");
            return returnUnauthorized();
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");

        setTransactionName(
            `GET /api/direct-messages?type=${type || "unknown"}`,
        );
        addTransactionAttributes({
            userId: session.$id,
            operationType: type || "unknown",
        });

        // List all conversations for current user
        if (type === "conversations") {
            if (!CONVERSATIONS_COLLECTION) {
                return jsonResponse({ conversations: [] }, request);
            }

            const { databases } = getServerClient();
            const dbStartTime = Date.now();
            const response = await dedupeDirectMessageCache(
                `dm:conversations:${session.$id}`,
                () =>
                    databases.listDocuments(DATABASE_ID, CONVERSATIONS_COLLECTION, [
                        Query.contains("participants", session.$id),
                        Query.orderDesc("lastMessageAt"),
                        Query.limit(100),
                    ]),
                DIRECT_MESSAGES_CACHE_TTL_MS,
            );

            trackApiCall(
                "/api/direct-messages",
                "GET",
                200,
                Date.now() - dbStartTime,
                {
                    operation: "listConversations",
                    count: response.documents.length,
                },
            );

            const conversations = response.documents.map((doc) => ({
                $id: doc.$id,
                participants: doc.participants as string[],
                lastMessageAt: doc.lastMessageAt as string | undefined,
                $createdAt: doc.$createdAt,
                isGroup:
                    Boolean((doc as Record<string, unknown>).isGroup) ||
                    (Array.isArray(doc.participants) &&
                        doc.participants.length > 2),
                name: (doc as Record<string, unknown>).name as
                    | string
                    | undefined,
                avatarUrl: (doc as Record<string, unknown>).avatarUrl as
                    | string
                    | undefined,
                createdBy: (doc as Record<string, unknown>).createdBy as
                    | string
                    | undefined,
                isSystemAnnouncementThread: Boolean(
                    (doc as Record<string, unknown>).isSystemAnnouncementThread,
                ),
                announcementThreadKey: (doc as Record<string, unknown>)
                    .announcementThreadKey as string | undefined,
                participantCount: Array.isArray(doc.participants)
                    ? (doc.participants as unknown[]).length
                    : undefined,
            }));

            const oneToOneOtherUserIds = conversations
                .filter((conversation) => !conversation.isGroup)
                .map((conversation) =>
                    conversation.participants.find((id) => id !== session.$id),
                )
                .filter((value): value is string => Boolean(value));
            const unreadThreadsByConversationId = new Map<string, number>();
            let unreadThreadCountsTruncated = false;
            let readStatesByConversationId = new Map<
                string,
                Record<string, string>
            >();

            const conversationIds = conversations.map(
                (conversation) => conversation.$id,
            );
            const pageSize = 500;
            const maxThreadParentPages = 20;

            const [readStatesResult, threadParentsResult, relationshipResult, profilesResult] =
                await Promise.allSettled([
                    listThreadReadsByContext({
                        contextIds: conversationIds,
                        contextType: "conversation",
                        userId: session.$id,
                    }),
                    conversations.length > 0
                        ? listPages({
                              databases,
                              databaseId: DATABASE_ID,
                              collectionId: DIRECT_MESSAGES_COLLECTION,
                              baseQueries: [
                                  Query.equal("conversationId", conversationIds),
                                  Query.greaterThan("threadMessageCount", 0),
                              ],
                              pageSize,
                              maxPages: maxThreadParentPages,
                              warningContext: "direct-messages-thread-parents",
                          })
                        : Promise.resolve({ documents: [] as Array<Record<string, unknown>>, truncated: false }),
                    getRelationshipMap(session.$id, oneToOneOtherUserIds),
                    getUserProfilesBatch(oneToOneOtherUserIds),
                ]);

            if (readStatesResult.status === "fulfilled") {
                readStatesByConversationId = readStatesResult.value;
            } else {
                unreadThreadCountsTruncated = true;
                logger.warn("Thread read lookup failed for conversations", {
                    error:
                        readStatesResult.reason instanceof Error
                            ? readStatesResult.reason.message
                            : String(readStatesResult.reason),
                    userId: session.$id,
                });
            }

            if (conversations.length > 0 && readStatesResult.status === "fulfilled") {
                try {
                    const threadParentsById = new Map<
                        string,
                        Record<string, unknown>
                    >();
                    let threadParentPages: { documents: Array<Record<string, unknown>>; truncated: boolean };
                    if (threadParentsResult.status === "fulfilled") {
                        threadParentPages = threadParentsResult.value;
                    } else {
                        unreadThreadCountsTruncated = true;
                        logger.warn("Failed to load thread parents", {
                            error:
                                threadParentsResult.reason instanceof Error
                                    ? threadParentsResult.reason.message
                                    : String(threadParentsResult.reason),
                            userId: session.$id,
                        });
                        threadParentPages = { documents: [], truncated: false };
                    }

                    for (const document of threadParentPages.documents) {
                        const threadParent = document as Record<string, unknown>;
                        const parentMessageId =
                            typeof threadParent.$id === "string"
                                ? threadParent.$id
                                : null;
                        if (!parentMessageId) {
                            continue;
                        }

                        threadParentsById.set(parentMessageId, threadParent);
                    }

                    const threadParentsTruncated = threadParentPages.truncated;

                    for (const threadParent of threadParentsById.values()) {
                        const conversationId =
                            typeof threadParent.conversationId === "string"
                                ? threadParent.conversationId
                                : null;
                        const messageId =
                            typeof threadParent.$id === "string"
                                ? threadParent.$id
                                : null;
                        if (!conversationId || !messageId) {
                            continue;
                        }

                        const lastThreadReplyAt =
                            typeof threadParent.lastThreadReplyAt === "string"
                                ? threadParent.lastThreadReplyAt
                                : undefined;
                        const threadMessageCount =
                            typeof threadParent.threadMessageCount === "number"
                                ? threadParent.threadMessageCount
                                : undefined;

                        const lastReadAt =
                            readStatesByConversationId.get(conversationId)?.[
                                messageId
                            ];

                        if (
                            isThreadUnread({
                                lastReadAt,
                                lastThreadReplyAt,
                                threadMessageCount,
                            })
                        ) {
                            unreadThreadsByConversationId.set(
                                conversationId,
                                (unreadThreadsByConversationId.get(
                                    conversationId,
                                ) ?? 0) + 1,
                            );
                        }
                    }

                    if (threadParentsTruncated) {
                        unreadThreadCountsTruncated = true;
                        logger.warn(
                            "Thread unread aggregation reached pagination cap",
                            {
                                conversationCount: conversations.length,
                                pageSize,
                                userId: session.$id,
                            },
                        );
                    }
                } catch (error) {
                    unreadThreadCountsTruncated = true;
                    logger.error("Failed to aggregate unread thread counts", {
                        error: error instanceof Error ? error.message : String(error),
                        userId: session.$id,
                    });
                }
            }

            const relationshipMap =
                relationshipResult.status === "fulfilled"
                    ? relationshipResult.value
                    : new Map();
            const profilesBatch =
                profilesResult.status === "fulfilled"
                    ? profilesResult.value
                    : new Map();

            const profileMap = new Map<string, {
                userId: string;
                displayName?: string;
                avatarUrl?: string;
                pronouns?: string;
            }>();
            for (const [uid, profile] of profilesBatch) {
                profileMap.set(uid, {
                    userId: uid,
                    displayName: profile.displayName,
                    avatarUrl: profile.avatarFileId
                        ? getAvatarUrl(profile.avatarFileId)
                        : undefined,
                    pronouns: profile.pronouns,
                });
            }

            const enrichedConversations = conversations.map((conversation) => {
                const unreadThreadCount =
                    unreadThreadsByConversationId.get(conversation.$id) ?? 0;

                if (conversation.isSystemAnnouncementThread) {
                    const isSystemSender =
                        SYSTEM_SENDER_USER_ID !== null &&
                        session.$id === SYSTEM_SENDER_USER_ID;
                    const readOnly = !isSystemSender;

                    return {
                        ...conversation,
                        hasUnread: unreadThreadCount > 0,
                        readOnly,
                        readOnlyReason: readOnly
                            ? SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON
                            : undefined,
                        unreadThreadCount,
                        unreadThreadCountTruncated: unreadThreadCountsTruncated,
                    };
                }

                if (conversation.isGroup) {
                    return {
                        ...conversation,
                        hasUnread: unreadThreadCount > 0,
                        unreadThreadCount,
                        unreadThreadCountTruncated: unreadThreadCountsTruncated,
                    };
                }

                const otherUserId = conversation.participants.find(
                    (id) => id !== session.$id,
                );
                if (!otherUserId) {
                    return {
                        ...conversation,
                        hasUnread: unreadThreadCount > 0,
                        unreadThreadCount,
                        unreadThreadCountTruncated: unreadThreadCountsTruncated,
                    };
                }

                const relationship = relationshipMap.get(otherUserId);
                const readOnly = relationship
                    ? !relationship.canSendDirectMessage
                    : false;
                const otherUser = otherUserId
                    ? profileMap.get(otherUserId) ?? { userId: otherUserId }
                    : undefined;

                return {
                    ...conversation,
                    hasUnread: unreadThreadCount > 0,
                    readOnly,
                    readOnlyReason: relationship
                        ? getReadOnlyReason(relationship)
                        : undefined,
                    relationship,
                    otherUser,
                    unreadThreadCount,
                    unreadThreadCountTruncated: unreadThreadCountsTruncated,
                };
            });

            logger.info("Listed conversations", {
                userId: session.$id,
                count: enrichedConversations.length,
            });

            const totalUnreadThreadCount = enrichedConversations.reduce(
                (total, conversation) => total + conversation.unreadThreadCount,
                0,
            );
            rememberDmUnreadThreadSnapshot({
                conversationCount: enrichedConversations.length,
                totalUnreadThreadCount,
                truncated: unreadThreadCountsTruncated,
                userId: session.$id,
            });

            return jsonResponse({ conversations: enrichedConversations }, request);
        }

        // Get or create a conversation between two users
        if (type === "conversation") {
            const userId1 = searchParams.get("userId1");
            const userId2 = searchParams.get("userId2");

            if (!userId1 || !userId2) {
                return jsonResponse(
                    { error: "userId1 and userId2 are required" },
                    { status: 400 },
                 request);
            }

            if (!CONVERSATIONS_COLLECTION) {
                return jsonResponse(
                    { error: "Conversations not configured" },
                    { status: 500 },
                 request);
            }

            // Sort user IDs to ensure consistent ordering
            const [user1, user2] = [userId1, userId2].sort();
            const participants = [user1, user2];
            if (!participants.includes(session.$id)) {
                return jsonResponse(
                    { error: "You can only access your own direct messages" },
                    { status: 403 },
                 request);
            }

            if (includesSystemSenderParticipant(participants)) {
                return jsonResponse(
                    { error: SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON },
                    { status: 403 },
                 request);
            }

            const targetUserId = participants.find((id) => id !== session.$id);
            if (!targetUserId) {
                return jsonResponse(
                    { error: "A target user is required" },
                    { status: 400 },
                 request);
            }

            const { databases } = getServerClient();

            // Try to find existing conversation
            try {
                type ConversationCandidate = {
                    $id: string;
                    $createdAt?: string;
                    participants?: unknown;
                    lastMessageAt?: unknown;
                    [key: string]: unknown;
                };

                let oneToOne: ConversationCandidate | undefined;
                let cursorAfter: string | null = null;
                let existingDocuments: ConversationCandidate[] = [];
                const pageSize = 100;
                const maxConversationSearchPages = 20;
                let searchPageCount = 0;
                let conversationLookupTruncated = false;

                while (
                    !oneToOne &&
                    searchPageCount < maxConversationSearchPages
                ) {
                    searchPageCount += 1;
                    const queries = [
                        Query.contains("participants", user1),
                        Query.contains("participants", user2),
                        Query.orderAsc("$createdAt"),
                        Query.limit(pageSize),
                    ];

                    if (cursorAfter) {
                        queries.push(Query.cursorAfter(cursorAfter));
                    }

                    const existing = await databases.listDocuments(
                        DATABASE_ID,
                        CONVERSATIONS_COLLECTION,
                        queries,
                    );

                    existingDocuments =
                        existing.documents as ConversationCandidate[];
                    oneToOne = existingDocuments.find((doc) => {
                        const participantsList = doc.participants;
                        return (
                            Array.isArray(participantsList) &&
                            participantsList.length === 2 &&
                            participantsList.includes(user1) &&
                            participantsList.includes(user2)
                        );
                    });

                    if (oneToOne || existingDocuments.length < pageSize) {
                        break;
                    }

                    const lastDocument = existingDocuments.at(-1);
                    cursorAfter =
                        typeof lastDocument?.$id === "string"
                            ? lastDocument.$id
                            : null;

                    if (!cursorAfter) {
                        break;
                    }
                }

                if (
                    !oneToOne &&
                    searchPageCount === maxConversationSearchPages &&
                    existingDocuments.length === pageSize
                ) {
                    conversationLookupTruncated = true;
                    logger.warn(
                        "One-to-one conversation lookup reached pagination cap",
                        {
                            requesterId: session.$id,
                            targetUserId,
                            maxConversationSearchPages,
                            pageSize,
                        },
                    );
                }

                if (oneToOne) {
                    const [relationship, encryptionState, existingProfile] = await Promise.all([
                        getRelationshipStatus(session.$id, targetUserId),
                        getDmEncryptionStateForPair(session.$id, targetUserId),
                        getUserProfile(targetUserId).catch(() => null),
                    ]);
                    let otherUserProfile: { userId: string; displayName?: string; avatarUrl?: string; pronouns?: string } | undefined;
                    if (existingProfile) {
                        otherUserProfile = {
                            userId: targetUserId,
                            displayName: existingProfile.displayName,
                            avatarUrl: existingProfile.avatarFileId
                                ? getAvatarUrl(existingProfile.avatarFileId)
                                : undefined,
                            pronouns: existingProfile.pronouns,
                        };
                    }
                    return jsonResponse({
                        conversation: {
                            $id: oneToOne.$id,
                            participants: oneToOne.participants,
                            lastMessageAt: oneToOne.lastMessageAt,
                            $createdAt: oneToOne.$createdAt,
                            isGroup: Boolean(
                                (oneToOne as Record<string, unknown>).isGroup,
                            ),
                            name: (oneToOne as Record<string, unknown>).name as
                                | string
                                | undefined,
                            avatarUrl: (oneToOne as Record<string, unknown>)
                                .avatarUrl as string | undefined,
                            createdBy: (oneToOne as Record<string, unknown>)
                                .createdBy as string | undefined,
                            participantCount: Array.isArray(
                                oneToOne.participants,
                            )
                                ? (oneToOne.participants as unknown[]).length
                                : undefined,
                            readOnly: !relationship.canSendDirectMessage,
                            readOnlyReason: getReadOnlyReason(relationship),
                            relationship,
                            otherUser: otherUserProfile,
                            dmEncryptionSelfEnabled:
                                encryptionState.dmEncryptionSelfEnabled,
                            dmEncryptionPeerEnabled:
                                encryptionState.dmEncryptionPeerEnabled,
                            dmEncryptionMutualEnabled:
                                encryptionState.dmEncryptionMutualEnabled,
                            dmEncryptionPeerPublicKey:
                                encryptionState.dmEncryptionPeerPublicKey,
                        },
                    }, request);
                }

                if (conversationLookupTruncated) {
                    return jsonResponse(
                        {
                            error: "Unable to safely determine whether a direct message already exists. Please try again.",
                        },
                        { status: 409 },
                     request);
                }
            } catch (error) {
                logger.error(
                    "Failed to lookup existing one-to-one conversation",
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        requesterId: session.$id,
                        targetUserId,
                    },
                );
                return jsonResponse(
                    {
                        error: "Failed to verify existing direct message conversation",
                    },
                    { status: 500 },
                 request);
            }

            const [relationship, encryptionState] = await Promise.all([
                getRelationshipStatus(session.$id, targetUserId),
                getDmEncryptionStateForPair(session.$id, targetUserId),
            ]);
            if (!relationship.canSendDirectMessage) {
                return jsonResponse(
                    {
                        error:
                            getReadOnlyReason(relationship) ||
                            "Direct messages are not available for this user",
                        relationship,
                    },
                    { status: 403 },
                 request);
            }

            // Create new conversation
            const permissions = [
                Permission.read(Role.user(user1)),
                Permission.read(Role.user(user2)),
                Permission.update(Role.user(user1)),
                Permission.update(Role.user(user2)),
                Permission.delete(Role.user(user1)),
                Permission.delete(Role.user(user2)),
            ];

            const newConv = await databases.createDocument(
                DATABASE_ID,
                CONVERSATIONS_COLLECTION,
                ID.unique(),
                {
                    participants,
                    lastMessageAt: new Date().toISOString(),
                },
                permissions,
            );

            clearDmConversationsCache(participants);

            // Populate otherUser for the newly created 1:1 conversation
            const otherUserId = participants.find((id) => id !== session.$id);
            let otherUser: { userId: string; displayName?: string; avatarUrl?: string; pronouns?: string } | undefined;
            if (otherUserId) {
                try {
                    const profile = await getUserProfile(otherUserId);
                    if (profile) {
                        otherUser = {
                            userId: otherUserId,
                            displayName: profile.displayName,
                            avatarUrl: profile.avatarFileId
                                ? getAvatarUrl(profile.avatarFileId)
                                : undefined,
                            pronouns: profile.pronouns,
                        };
                    }
                } catch {
                    // ignore profile fetch failure
                }
            }

            return jsonResponse({
                conversation: {
                    $id: newConv.$id,
                    participants: newConv.participants,
                    lastMessageAt: newConv.lastMessageAt,
                    $createdAt: newConv.$createdAt,
                    isGroup: false,
                    participantCount: participants.length,
                    readOnly: false,
                    relationship,
                    otherUser,
                    dmEncryptionSelfEnabled:
                        encryptionState.dmEncryptionSelfEnabled,
                    dmEncryptionPeerEnabled:
                        encryptionState.dmEncryptionPeerEnabled,
                    dmEncryptionMutualEnabled:
                        encryptionState.dmEncryptionMutualEnabled,
                    dmEncryptionPeerPublicKey:
                        encryptionState.dmEncryptionPeerPublicKey,
                },
            }, request);
        }

        // Fetch a single conversation by ID with otherUser populated
        if (type === "conversationById") {
            const conversationId = searchParams.get("conversationId");

            if (!conversationId) {
                return jsonResponse(
                    { error: "conversationId is required" },
                    { status: 400 },
                 request);
            }

            const { databases } = getServerClient();
            const conversation = await databases
                .getDocument(
                    DATABASE_ID,
                    CONVERSATIONS_COLLECTION,
                    conversationId,
                )
                .catch(() => null);

            if (!conversation) {
                return jsonResponse(
                    { error: "Conversation not found" },
                    { status: 404 },
                 request);
            }

            const participants = Array.isArray(conversation.participants)
                ? (conversation.participants as string[])
                : [];

            if (!participants.includes(session.$id)) {
                return jsonResponse(
                    { error: "Forbidden" },
                    { status: 403 },
                 request);
            }

            const isGroupConversation =
                Boolean(
                    (conversation as Record<string, unknown>).isGroup,
                ) || participants.length > 2;

            const isSystemAnnouncementThread = Boolean(
                (conversation as Record<string, unknown>).isSystemAnnouncementThread,
            );

            let readOnly = false;
            let readOnlyReason: string | undefined;

            if (isSystemAnnouncementThread) {
                const isSystemSender =
                    SYSTEM_SENDER_USER_ID !== null &&
                    session.$id === SYSTEM_SENDER_USER_ID;
                readOnly = !isSystemSender;
                if (readOnly) {
                    readOnlyReason = SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON;
                }
            } else if (!isGroupConversation) {
                const otherUserId = participants.find(
                    (id) => id !== session.$id,
                );
                if (otherUserId) {
                    const relationshipMap = await getRelationshipMap(
                        session.$id,
                        [otherUserId],
                    );
                    const relationship = relationshipMap.get(otherUserId);
                    if (relationship) {
                        readOnly = !relationship.canSendDirectMessage;
                        if (readOnly) {
                            readOnlyReason = getReadOnlyReason(relationship);
                        }
                    }
                }
            }

            let otherUser: { userId: string; displayName?: string; avatarUrl?: string; pronouns?: string } | undefined;

            if (!isGroupConversation) {
                const otherUserId = participants.find(
                    (id) => id !== session.$id,
                );
                if (otherUserId) {
                    try {
                        const profile = await getUserProfile(otherUserId);
                        if (profile) {
                            otherUser = {
                                userId: otherUserId,
                                displayName: profile.displayName,
                                avatarUrl: profile.avatarFileId
                                    ? getAvatarUrl(profile.avatarFileId)
                                    : undefined,
                                pronouns: profile.pronouns,
                            };
                        }
                    } catch {
                        // ignore profile fetch failure
                    }
                }
            }

            return jsonResponse({
                conversation: {
                    ...conversation,
                    isGroup: isGroupConversation,
                    participantCount: participants.length,
                    otherUser,
                    readOnly,
                    readOnlyReason,
                },
            }, request);
        }

        // List messages in a conversation
        if (type === "messages") {
            const conversationId = searchParams.get("conversationId");
            const limit = Number.parseInt(searchParams.get("limit") || "50");
            const cursor = searchParams.get("cursor") || undefined;

            if (!conversationId) {
                return jsonResponse(
                    { error: "conversationId is required" },
                    { status: 400 },
                 request);
            }

            if (!DIRECT_MESSAGES_COLLECTION) {
                return jsonResponse({ items: [], nextCursor: null }, request);
            }

            const { databases } = getServerClient();

            const queries = [
                Query.equal("conversationId", conversationId),
                Query.orderDesc("$createdAt"),
                Query.limit(limit),
            ];

            if (cursor) {
                queries.push(Query.cursorAfter(cursor));
            }

            const response = await databases.listDocuments(
                DATABASE_ID,
                DIRECT_MESSAGES_COLLECTION,
                queries,
            );

            let items = response.documents.map((doc) => ({
                $id: doc.$id,
                conversationId: doc.conversationId as string,
                senderId: doc.senderId as string,
                receiverId: doc.receiverId as string | undefined,
                text: doc.text as string,
                isEncrypted: Boolean(doc.isEncrypted),
                encryptedText: doc.encryptedText as string | undefined,
                encryptionNonce: doc.encryptionNonce as string | undefined,
                encryptionVersion: doc.encryptionVersion as string | undefined,
                encryptionSenderPublicKey: doc
                    .encryptionSenderPublicKey as string | undefined,
                imageFileId: doc.imageFileId as string | undefined,
                imageUrl: resolveMessageImageUrl({
                    imageFileId: doc.imageFileId,
                    imageUrl: doc.imageUrl,
                }),
                $createdAt: doc.$createdAt,
                editedAt: doc.editedAt as string | undefined,
                removedAt: doc.removedAt as string | undefined,
                removedBy: doc.removedBy as string | undefined,
                replyToId: doc.replyToId as string | undefined,
                threadId: doc.threadId as string | undefined,
                threadMessageCount: doc.threadMessageCount as number | undefined,
                mentions: Array.isArray(doc.mentions)
                    ? (doc.mentions as string[])
                    : undefined,
                reactions: parseReactions(doc.reactions),
            }));

            let readOnly = false;
            let readOnlyReason: string | undefined;
            let relationship: RelationshipStatus | undefined;
            let dmEncryptionSelfEnabled = false;
            let dmEncryptionPeerEnabled = false;
            let dmEncryptionMutualEnabled = false;
            let dmEncryptionPeerPublicKey: string | undefined;

            if (!cursor) {
                const conversation = await databases
                    .getDocument(
                        DATABASE_ID,
                        CONVERSATIONS_COLLECTION,
                        conversationId,
                    )
                    .catch(() => null);

                if (conversation) {
                    const isSystemAnnouncementThread = Boolean(
                        (conversation as Record<string, unknown>)
                            .isSystemAnnouncementThread,
                    );
                    if (
                        isSystemAnnouncementThread &&
                        (SYSTEM_SENDER_USER_ID === null ||
                            session.$id !== SYSTEM_SENDER_USER_ID)
                    ) {
                        readOnly = true;
                        readOnlyReason = SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON;
                    }

                    const participants = Array.isArray(conversation.participants)
                        ? (conversation.participants as string[])
                        : [];
                    if (!participants.includes(session.$id)) {
                        return jsonResponse(
                            { error: "Forbidden" },
                            { status: 403 },
                         request);
                    }

                    const isGroupConversation =
                        Boolean(
                            (conversation as Record<string, unknown>).isGroup,
                        ) || participants.length > 2;

                    if (!isGroupConversation) {
                        const otherUserId = participants.find(
                            (id) => id !== session.$id,
                        );
                        if (otherUserId && !isSystemAnnouncementThread) {
                            const [
                                friendship,
                                blockStatus,
                                peerNotificationSettings,
                                selfNotificationSettings,
                                peerProfile,
                            ] = await Promise.all([
                                getFriendshipByPair(session.$id, otherUserId),
                                getBlockStatus(session.$id, otherUserId),
                                getNotificationSettings(otherUserId),
                                getNotificationSettings(session.$id),
                                getUserProfile(otherUserId).catch(() => null),
                            ]);

                            const isFriend = friendship?.status === "accepted";
                            const outgoingRequest =
                                friendship?.status === "pending" && friendship.requesterId === session.$id;
                            const incomingRequest =
                                friendship?.status === "pending" && friendship.recipientId === session.$id;
                            const directMessagePrivacy = peerNotificationSettings?.directMessagePrivacy ?? "everyone";
                            const canSendDirectMessage =
                                !blockStatus.blockedByMe &&
                                !blockStatus.blockedMe &&
                                (directMessagePrivacy === "everyone" || isFriend);

                            relationship = {
                                userId: otherUserId,
                                friendshipStatus: friendship?.status,
                                isFriend,
                                outgoingRequest,
                                incomingRequest,
                                blockedByMe: Boolean(blockStatus.blockedByMe),
                                blockedMe: Boolean(blockStatus.blockedMe),
                                directMessagePrivacy,
                                canSendDirectMessage,
                                canReceiveFriendRequest:
                                    !isFriend && !outgoingRequest && !incomingRequest &&
                                    !blockStatus.blockedByMe && !blockStatus.blockedMe,
                            };

                            dmEncryptionSelfEnabled = Boolean(selfNotificationSettings?.dmEncryptionEnabled);
                            dmEncryptionPeerEnabled = Boolean(peerNotificationSettings?.dmEncryptionEnabled);
                            dmEncryptionPeerPublicKey =
                                typeof peerProfile?.dmEncryptionPublicKey === "string"
                                    ? peerProfile.dmEncryptionPublicKey
                                    : undefined;
                            dmEncryptionMutualEnabled =
                                dmEncryptionSelfEnabled && dmEncryptionPeerEnabled;

                            readOnly = !relationship.canSendDirectMessage;
                            readOnlyReason = getReadOnlyReason(relationship);
                        }
                    }

                    if (isGroupConversation) {
                        const relationshipMap = await getRelationshipMap(
                            session.$id,
                            participants.filter((id) => id !== session.$id),
                        );
                        items = items.filter((item) => {
                            const messageRelationship = relationshipMap.get(
                                item.senderId,
                            );
                            return (
                                !messageRelationship?.blockedByMe &&
                                !messageRelationship?.blockedMe
                            );
                        });
                    }
                }
            }

            const last = items.at(-1);
            return jsonResponse({
                items,
                nextCursor: items.length === limit && last ? last.$id : null,
                readOnly,
                readOnlyReason,
                relationship,
                dmEncryptionMutualEnabled,
                dmEncryptionPeerEnabled,
                dmEncryptionPeerPublicKey,
                dmEncryptionSelfEnabled,
            }, request);
        }

        return jsonResponse(
            { error: "Invalid type parameter" },
            { status: 400 },
         request);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "GET /api/direct-messages",
            endpoint: "/api/direct-messages",
        });

        logger.error("DM GET error", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return jsonResponse(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            },
            { status: 500 },
         request);
    }
}

/**
 * POST /api/direct-messages
 * Send a new direct message
 *
 * Body: { conversationId, senderId, receiverId, text, imageFileId?, imageUrl? }
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/direct-messages");

        const session = await getServerSession();
        if (!session?.$id) {
            logger.warn("Unauthorized DM send attempt");
            return returnUnauthorized();
        }

        const body = (await request.json()) as {
            conversationId?: string;
            senderId?: string;
            receiverId?: string;
            text?: string;
            isEncrypted?: boolean;
            encryptedText?: string;
            encryptionNonce?: string;
            encryptionVersion?: string;
            encryptionSenderPublicKey?: string;
            imageFileId?: string;
            imageUrl?: string;
            attachments?: unknown[];
            replyToId?: string;
            mentions?: string[];
            operation?: string;
            participants?: string[];
            name?: string;
            avatarUrl?: string;
        };

        // Create a new group conversation
        if (body.operation === "createConversation") {
            if (!CONVERSATIONS_COLLECTION) {
                return jsonResponse(
                    { error: "Conversations not configured" },
                    { status: 500 },
                 request);
            }

            const participantIds = Array.isArray(body.participants)
                ? Array.from(new Set(body.participants.map((id) => String(id))))
                : [];

            if (!participantIds.includes(session.$id)) {
                participantIds.push(session.$id);
            }

            if (includesSystemSenderParticipant(participantIds)) {
                return jsonResponse(
                    { error: SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON },
                    { status: 403 },
                 request);
            }

            if (participantIds.length < 3) {
                return jsonResponse(
                    {
                        error: "Group conversations require at least 3 participants",
                    },
                    { status: 400 },
                 request);
            }

            const relationshipMap = await getRelationshipMap(
                session.$id,
                participantIds.filter((id) => id !== session.$id),
            );
            const unavailableParticipants = participantIds.filter(
                (participantId) => {
                    if (participantId === session.$id) {
                        return false;
                    }

                    const relationship = relationshipMap.get(participantId);
                    return Boolean(
                        relationship?.blockedByMe || relationship?.blockedMe,
                    );
                },
            );

            if (unavailableParticipants.length > 0) {
                return jsonResponse(
                    {
                        error: "One or more users cannot be added to this group conversation",
                        unavailableParticipants,
                    },
                    { status: 403 },
                 request);
            }

            const sortedParticipants = [...participantIds].sort();
            const permissions = sortedParticipants.flatMap((id) => [
                Permission.read(Role.user(id)),
                Permission.update(Role.user(id)),
                Permission.delete(Role.user(id)),
            ]);

            const { databases } = getServerClient();

            const newConversation = await databases.createDocument(
                DATABASE_ID,
                CONVERSATIONS_COLLECTION,
                ID.unique(),
                {
                    participants: sortedParticipants,
                    lastMessageAt: new Date().toISOString(),
                    isGroup: true,
                    name: body.name?.trim() || null,
                    avatarUrl: body.avatarUrl?.trim() || null,
                    createdBy: session.$id,
                },
                permissions,
            );

            clearDmConversationsCache(sortedParticipants);

            return jsonResponse(
                {
                    conversation: {
                        $id: newConversation.$id,
                        participants: newConversation.participants,
                        lastMessageAt: newConversation.lastMessageAt,
                        $createdAt: newConversation.$createdAt,
                        isGroup: true,
                        name: newConversation.name as string | undefined,
                        avatarUrl: newConversation.avatarUrl as
                            | string
                            | undefined,
                        createdBy: newConversation.createdBy as
                            | string
                            | undefined,
                        participantCount: sortedParticipants.length,
                    },
                },
                { status: 201 },
             request);
        }

        const {
            conversationId,
            senderId,
            receiverId,
            text,
            imageFileId,
            imageUrl,
            attachments,
            replyToId,
            mentions,
            isEncrypted,
            encryptedText,
            encryptionNonce,
            encryptionVersion,
            encryptionSenderPublicKey,
        } = body;

        const normalizedAttachmentsResult = normalizeFileAttachmentsInput(
            attachments,
        );
        if (!normalizedAttachmentsResult.ok) {
            return jsonResponse(
                { error: normalizedAttachmentsResult.error },
                { status: 400 },
             request);
        }
        const normalizedAttachments = normalizedAttachmentsResult.attachments;

        const normalizedText = typeof text === "string" ? text : "";
        const creatingPoll = isPollCommand(normalizedText);
        let parsedPoll: ReturnType<typeof parsePollCommand> | null = null;

        if (creatingPoll) {
            try {
                parsedPoll = parsePollCommand(normalizedText);
            } catch (error) {
                return NextResponse.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Invalid poll command.",
                    },
                    { status: 400 },
                );
            }
        }

        if (
            creatingPoll &&
            (imageFileId || imageUrl || normalizedAttachments.length > 0)
        ) {
            return NextResponse.json(
                {
                    error: "Poll messages do not support image or file attachments.",
                },
                { status: 400 },
            );
        }

        const hasEncryptedText =
            typeof encryptedText === "string" && encryptedText.length > 0;

        addTransactionAttributes({
            userId: session.$id,
            conversationId: conversationId ?? "unknown",
            hasImage: !!imageFileId,
            hasEncryptedText,
            hasAttachments: normalizedAttachments.length > 0,
            attachmentCount: normalizedAttachments.length,
            isReply: !!replyToId,
            operation: "send-message",
        });

        if (
            !conversationId ||
            !senderId ||
            (!text?.trim() &&
                !hasEncryptedText &&
                !imageFileId &&
                !imageUrl &&
                normalizedAttachments.length === 0)
        ) {
            return jsonResponse(
                { error: "Missing required fields" },
                { status: 400 },
             request);
        }

        if (text && text.length > MAX_MESSAGE_LENGTH) {
            return jsonResponse(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
             request);
        }

        if (
            hasEncryptedText &&
            (typeof encryptionNonce !== "string" ||
                typeof encryptionVersion !== "string" ||
                typeof encryptionSenderPublicKey !== "string")
        ) {
            return jsonResponse(
                { error: "Encrypted message metadata is incomplete" },
                { status: 400 },
             request);
        }

        if (isEncrypted === true && !hasEncryptedText) {
            return jsonResponse(
                {
                    error: "Encrypted messages must include encryptedText and encryption metadata",
                },
                { status: 400 },
             request);
        }

        // Validate sender is the authenticated user — never trust client-provided senderId downstream
        if (senderId !== session.$id) {
            return jsonResponse(
                { error: "Cannot send message as another user" },
                { status: 403 },
             request);
        }

        if (!DIRECT_MESSAGES_COLLECTION || !CONVERSATIONS_COLLECTION) {
            return jsonResponse(
                { error: "Direct messages not configured" },
                { status: 500 },
             request);
        }

        const { databases } = getServerClient();

        let participants: string[] = [];
        let isGroupConversation = false;
        let isSystemAnnouncementThread = false;

        try {
            const conversation = await databases.getDocument(
                DATABASE_ID,
                CONVERSATIONS_COLLECTION,
                conversationId,
            );

            isSystemAnnouncementThread = Boolean(
                (conversation as Record<string, unknown>)
                    .isSystemAnnouncementThread,
            );

            participants = Array.isArray(conversation.participants)
                ? (conversation.participants as string[])
                : [];

            isGroupConversation =
                Boolean((conversation as Record<string, unknown>).isGroup) ||
                participants.length > 2;
        } catch {
            // Fallback for legacy flows/tests where the conversation doc is not present
            participants = Array.from(
                new Set([senderId, receiverId].filter(Boolean) as string[]),
            );
            isGroupConversation = participants.length > 2;
        }

        if (!participants.includes(senderId)) {
            participants = Array.from(new Set([...participants, senderId]));
        }

        if (
            isSystemAnnouncementThread || includesSystemSenderParticipant(participants)
        ) {
            return jsonResponse(
                { error: SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON },
                { status: 403 },
             request);
        }

        const targetReceiverId = isGroupConversation
            ? undefined
            : (receiverId ?? participants.find((id) => id !== senderId));

        // Fallback receiver is required by older schemas; for group DMs we use the senderId to satisfy required field
        const receiverForWrite =
            targetReceiverId ??
            participants.find((id) => id !== senderId) ??
            senderId;

        if (!isGroupConversation && !targetReceiverId) {
            return jsonResponse(
                { error: "receiverId is required for direct messages" },
                { status: 400 },
             request);
        }

        if (!isGroupConversation && targetReceiverId) {
            const relationship = await getRelationshipStatus(
                senderId,
                targetReceiverId,
            );
            if (!relationship.canSendDirectMessage) {
                return jsonResponse(
                    {
                        error:
                            getReadOnlyReason(relationship) ||
                            "Direct messages are not available for this user",
                        relationship,
                    },
                    { status: 403 },
                 request);
            }
        }

        const hasPlaintextText =
            typeof text === "string" &&
            text.trim().length > 0 &&
            !hasEncryptedText;
        const hasImageContent = Boolean(imageFileId) || Boolean(imageUrl);
        const hasAnyContent =
            hasPlaintextText || hasImageContent || normalizedAttachments.length > 0;

        // Hoist shared fetches: both the plaintext-guard (hasAnyContent) and the
        // encrypted-text validation need these four values.  Run them once when
        // either path is possible.
        let senderSettings = null;
        let receiverSettings = null;
        let senderProfile: Awaited<ReturnType<typeof getUserProfile>> = null;
        let receiverProfile: Awaited<ReturnType<typeof getUserProfile>> = null;

        if (!isGroupConversation && targetReceiverId && (hasAnyContent || hasEncryptedText)) {
            [senderSettings, receiverSettings, senderProfile, receiverProfile] =
                await Promise.all([
                    getNotificationSettings(senderId).catch((error) => {
                        logger.warn(
                            "Failed to load sender notification settings for DM encryption",
                            {
                                conversationId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                senderId,
                                targetReceiverId,
                            },
                        );
                        return null;
                    }),
                    getNotificationSettings(targetReceiverId).catch((error) => {
                        logger.warn(
                            "Failed to load receiver notification settings for DM encryption",
                            {
                                conversationId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                senderId,
                                targetReceiverId,
                            },
                        );
                        return null;
                    }),
                    getUserProfile(senderId).catch((error) => {
                        logger.warn(
                            "Failed to load sender profile for DM encryption",
                            {
                                conversationId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                senderId,
                                targetReceiverId,
                            },
                        );
                        return null;
                    }),
                    getUserProfile(targetReceiverId).catch((error) => {
                        logger.warn(
                            "Failed to load receiver profile for DM encryption",
                            {
                                conversationId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                senderId,
                                targetReceiverId,
                            },
                        );
                        return null;
                    }),
                ]);
        }

        if (!isGroupConversation && targetReceiverId && hasAnyContent) {

            const senderProfilePublicKey =
                typeof senderProfile?.dmEncryptionPublicKey === "string"
                    ? senderProfile.dmEncryptionPublicKey.trim()
                    : "";
            const receiverProfilePublicKey =
                typeof receiverProfile?.dmEncryptionPublicKey === "string"
                    ? receiverProfile.dmEncryptionPublicKey.trim()
                    : "";

            const requiresEncryptedText =
                Boolean(senderSettings?.dmEncryptionEnabled) &&
                Boolean(receiverSettings?.dmEncryptionEnabled) &&
                senderProfilePublicKey.length > 0 &&
                receiverProfilePublicKey.length > 0;

            if (requiresEncryptedText && hasPlaintextText && !hasEncryptedText) {
                return jsonResponse(
                    {
                        error:
                            "Encrypted text is required for this conversation because DM encryption is enabled for both participants",
                    },
                    { status: 400 },
                 request);
            }
        }

        if (hasEncryptedText) {
            if (isGroupConversation || !targetReceiverId) {
                return jsonResponse(
                    {
                        error:
                            "Encrypted messages are only supported for one-to-one DMs",
                    },
                    { status: 400 },
                 request);
            }

            if (
                !senderSettings?.dmEncryptionEnabled ||
                !receiverSettings?.dmEncryptionEnabled
            ) {
                return jsonResponse(
                    {
                        error:
                            "Both participants must enable DM encryption before sending encrypted messages",
                    },
                    { status: 400 },
                 request);
            }

            const senderProfilePublicKey =
                typeof senderProfile?.dmEncryptionPublicKey === "string"
                    ? senderProfile.dmEncryptionPublicKey.trim()
                    : "";

            if (
                !senderProfilePublicKey ||
                senderProfilePublicKey !== encryptionSenderPublicKey
            ) {
                return jsonResponse(
                    {
                        error:
                            "encryptionSenderPublicKey must match the sender profile public key",
                    },
                    { status: 400 },
                 request);
            }

            const receiverProfilePublicKey =
                typeof receiverProfile?.dmEncryptionPublicKey === "string"
                    ? receiverProfile.dmEncryptionPublicKey.trim()
                    : "";

            if (!receiverProfilePublicKey) {
                return jsonResponse(
                    {
                        error:
                            "Recipient must have a published dmEncryptionPublicKey before accepting encrypted messages",
                    },
                    { status: 400 },
                 request);
            }
        }

        const permissions = [
            ...participants.map((id) => Permission.read(Role.user(id))),
            Permission.update(Role.user(senderId)),
            Permission.delete(Role.user(senderId)),
        ];

        const messageData: Record<string, unknown> = {
            conversationId,
            senderId,
            text: parsedPoll ? "" : hasEncryptedText ? "" : (text || ""),
        };

        if (hasEncryptedText) {
            messageData.isEncrypted = true;
            messageData.encryptedText = encryptedText;
            messageData.encryptionNonce = encryptionNonce;
            messageData.encryptionVersion = encryptionVersion;
            messageData.encryptionSenderPublicKey = encryptionSenderPublicKey;
        }

        // receiverId remains required on some deployments; always persist a value for compatibility
        const safeReceiverId =
            receiverForWrite ?? senderId ?? "missing-receiver";
        messageData.receiverId = safeReceiverId;

        // Add image fields if provided
        if (imageFileId) {
            messageData.imageFileId = imageFileId;
        }
        if (imageUrl) {
            messageData.imageUrl = imageUrl;
        }
        // Add reply field if provided
        if (replyToId) {
            messageData.replyToId = replyToId;
        }
        // Add mentions array if provided
        if (mentions && Array.isArray(mentions) && mentions.length > 0) {
            messageData.mentions = mentions;
        }

        logger.info("DM create payload", {
            conversationId,
            senderId,
            receiverId: safeReceiverId,
            isGroupConversation,
            participantCount: participants.length,
        });

        const dbStartTime = Date.now();
        const message = await databases.createDocument(
            DATABASE_ID,
            DIRECT_MESSAGES_COLLECTION,
            ID.unique(),
            messageData,
            permissions,
        );

        let pollResponse: Record<string, unknown> | undefined;

        if (parsedPoll) {
            try {
                const serializedOptions = serializePollOptions(
                    parsedPoll.options,
                );
                const pollDocument = await databases.createDocument(
                    DATABASE_ID,
                    env.collections.polls,
                    ID.unique(),
                    {
                        messageId: String(message.$id),
                        channelId: conversationId ?? "",
                        question: parsedPoll.question,
                        options: serializedOptions,
                        status: "open",
                        createdBy: senderId,
                    },
                    permissions,
                );

                const optionTemplate = parsePollOptions(serializedOptions);
                pollResponse = {
                    id: String(pollDocument.$id),
                    messageId: String(message.$id),
                    contextType: "conversation",
                    contextId: conversationId ?? "",
                    question: parsedPoll.question,
                    options: optionTemplate.map(
                        (option: { id: string; text: string }) => ({
                            id: option.id,
                            text: option.text,
                            count: 0,
                            voterIds: [],
                        }),
                    ),
                    status: "open",
                    createdBy: senderId,
                };
            } catch (error) {
                try {
                    await databases.deleteDocument(
                        DATABASE_ID,
                        DIRECT_MESSAGES_COLLECTION,
                        String(message.$id),
                    );
                } catch (deleteError) {
                    logger.warn(
                        "Failed to roll back message after poll creation error",
                        {
                            deleteError,
                            messageId: String(message.$id),
                        },
                    );
                }

                throw error;
            }
        }

        trackApiCall(
            "/api/direct-messages",
            "POST",
            200,
            Date.now() - dbStartTime,
            { operation: "createDocument", collection: "direct_messages" },
        );

        // Create attachment records if any
        if (normalizedAttachments.length > 0) {
            try {
                await createAttachments(
                    databases,
                    String(message.$id),
                    normalizedAttachments,
                );
            } catch (attachmentError) {
                const attachmentErrorWithIds = attachmentError as Error & {
                    createdIds?: string[];
                };
                const createdIds = Array.isArray(attachmentErrorWithIds.createdIds)
                    ? attachmentErrorWithIds.createdIds
                    : [];

                for (const createdId of createdIds) {
                    try {
                        await databases.deleteDocument(
                            DATABASE_ID,
                            MESSAGE_ATTACHMENTS_COLLECTION_ID,
                            createdId,
                        );
                    } catch (cleanupError) {
                        logger.warn("Failed to roll back DM attachment after attachment error", {
                            attachmentId: createdId,
                            error:
                                cleanupError instanceof Error
                                    ? cleanupError.message
                                    : String(cleanupError),
                        });
                    }
                }

                // Delete the parent DM
                try {
                    await databases.deleteDocument(
                        DATABASE_ID,
                        DIRECT_MESSAGES_COLLECTION,
                        String(message.$id),
                    );
                } catch (rollbackError) {
                    logger.warn("Failed to roll back DM after attachment error", {
                        messageId: String(message.$id),
                        error:
                            rollbackError instanceof Error
                                ? rollbackError.message
                                : String(rollbackError),
                    });
                }

                throw attachmentError;
            }
        }

        if (mentions && Array.isArray(mentions) && mentions.length > 0) {
            try {
                await upsertMentionInboxItems({
                    authorUserId: senderId,
                    contextId: conversationId,
                    contextKind: "conversation",
                    latestActivityAt: String(
                        message.$createdAt ?? new Date().toISOString(),
                    ),
                    mentions,
                    messageId: String(message.$id),
                    parentMessageId:
                        replyToId ??
                        ((message as Record<string, unknown>).replyToId as
                            | string
                            | undefined),
                    previewText: text || "",
                });
            } catch (mentionError) {
                logger.warn("Failed to upsert DM mention inbox items", {
                    conversationId,
                    messageId: String(message.$id),
                    senderId,
                    error:
                        mentionError instanceof Error
                            ? mentionError.message
                            : String(mentionError),
                });
            }
        }

        if (participants.length > 1) {
            try {
                await upsertMessageInboxItems({
                    authorUserId: senderId,
                    contextId: conversationId,
                    contextKind: "conversation",
                    latestActivityAt: String(
                        message.$createdAt ?? new Date().toISOString(),
                    ),
                    messageId: String(message.$id),
                    participantUserIds: participants,
                    previewText: text || "",
                });
            } catch (messageInboxError) {
                logger.warn("Failed to upsert DM message inbox items", {
                    conversationId,
                    messageId: String(message.$id),
                    senderId,
                    error:
                        messageInboxError instanceof Error
                            ? messageInboxError.message
                            : String(messageInboxError),
                });
            }
        }

        // Update conversation's lastMessageAt
        try {
            await databases.updateDocument(
                DATABASE_ID,
                CONVERSATIONS_COLLECTION,
                conversationId,
                {
                    lastMessageAt: new Date().toISOString(),
                },
            );
        } catch {
            // Don't fail if conversation update fails
        } finally {
            clearDmConversationsCache(participants);
        }

        // Send push notification to recipient (non-blocking)
        // For one-on-one DMs, the recipient is the participant who isn't the sender
        const pushTargetId = isGroupConversation
            ? undefined
            : (body.receiverId ?? participants.find((id) => id !== senderId) ?? receiverId);
        if (pushTargetId && pushTargetId !== senderId) {
            // Fetch sender display name for the notification title
            const senderProfile = await getUserProfile(senderId).catch(() => null);
            const senderName = senderProfile?.displayName || "New message";
            void dispatchPushNotification(pushTargetId, senderName, text || "Sent you a message", {
                type: "dm",
                conversationId,
                messageId: String(message.$id),
            }).catch((err) => logger.warn("Push dispatch failed:", err));
        }

        // Track DM sent event
        trackMessage("sent", "dm", {
            messageId: message.$id,
            senderId,
            receiverId,
            conversationId,
            hasImage: !!imageFileId,
            hasAttachments: normalizedAttachments.length > 0,
            attachmentCount: normalizedAttachments.length,
            isReply: !!replyToId,
            textLength: text?.length || 0,
        });

        recordEvent("message_sent", {
            actorUserId: senderId,
            conversationId,
            hasAttachments: normalizedAttachments.length > 0,
            hasImage: Boolean(imageFileId),
            isReply: Boolean(replyToId),
            messageId: String(message.$id),
            messageType: "dm",
            totalQueryTimeMs: Date.now() - startTime,
        });

        logger.info("DM sent", {
            messageId: message.$id,
            senderId,
            conversationId,
            duration: Date.now() - startTime,
        });

        const responseMessage: Record<string, unknown> = {
            $id: message.$id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            receiverId: message.receiverId,
            text: message.text,
            isEncrypted: Boolean(message.isEncrypted),
            encryptedText: (message as Record<string, unknown>).encryptedText,
            encryptionNonce: (message as Record<string, unknown>)
                .encryptionNonce,
            encryptionVersion: (message as Record<string, unknown>)
                .encryptionVersion,
            encryptionSenderPublicKey: (message as Record<string, unknown>)
                .encryptionSenderPublicKey,
            imageFileId: message.imageFileId,
            imageUrl: resolveMessageImageUrl({
                imageFileId: message.imageFileId,
                imageUrl: message.imageUrl,
            }),
            $createdAt: message.$createdAt,
            replyToId: message.replyToId,
            poll: pollResponse,
        };

        // Include attachments in response if any
        if (normalizedAttachments.length > 0) {
            responseMessage.attachments = normalizedAttachments;
        }

        return jsonResponse({ message: responseMessage }, request);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/direct-messages",
            endpoint: "/api/direct-messages",
        });

        logger.error("DM POST error", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return jsonResponse(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            },
            { status: 500 },
         request);
    }
}

/**
 * PATCH /api/direct-messages?id=MESSAGE_ID
 * Edit a direct message
 *
 * Body: { text }
 */
export async function PATCH(request: NextRequest) {
    const startTime = Date.now();

    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("id");

        if (!messageId) {
            return jsonResponse(
                { error: "Message ID is required" },
                { status: 400 },
             request);
        }

        const body = (await request.json()) as { text: string };
        const { text } = body;

        if (!text?.trim()) {
            return jsonResponse({ error: "Text is required" }, { status: 400 }, request);
        }

        if (text.length > MAX_MESSAGE_LENGTH) {
            return jsonResponse(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
             request);
        }

        if (!DIRECT_MESSAGES_COLLECTION) {
            return jsonResponse(
                { error: "Direct messages not configured" },
                { status: 500 },
             request);
        }

        const { databases } = getServerClient();

        // Get the message to verify ownership
        const message = await databases.getDocument(
            DATABASE_ID,
            DIRECT_MESSAGES_COLLECTION,
            messageId,
        );

        // Only the sender can edit their message
        if (message.senderId !== session.$id) {
            return jsonResponse(
                { error: "You can only edit your own messages" },
                { status: 403 },
             request);
        }

        if ((message as Record<string, unknown>).isEncrypted) {
            return jsonResponse(
                {
                    error:
                        "Encrypted direct messages cannot be edited after send",
                },
                { status: 409 },
             request);
        }

        const updated = await databases.updateDocument(
            DATABASE_ID,
            DIRECT_MESSAGES_COLLECTION,
            messageId,
            {
                text: text.trim(),
                editedAt: new Date().toISOString(),
            },
        );

        recordEvent("message_edited", {
            actorUserId: session.$id,
            conversationId: String(updated.conversationId),
            messageId,
            messageType: "dm",
            totalQueryTimeMs: Date.now() - startTime,
        });

        return jsonResponse({
            message: {
                $id: updated.$id,
                conversationId: updated.conversationId,
                senderId: updated.senderId,
                receiverId: updated.receiverId,
                text: updated.text,
                $createdAt: updated.$createdAt,
                editedAt: updated.editedAt,
            },
        }, request);
    } catch (error) {
        logger.error("PATCH /api/direct-messages error", {
            error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            },
            { status: 500 },
         request);
    }
}

/**
 * DELETE /api/direct-messages?id=MESSAGE_ID
 * Soft delete a direct message
 */
export async function DELETE(request: NextRequest) {
    const startTime = Date.now();

    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("id");

        if (!messageId) {
            return jsonResponse(
                { error: "Message ID is required" },
                { status: 400 },
             request);
        }

        if (!DIRECT_MESSAGES_COLLECTION) {
            return jsonResponse(
                { error: "Direct messages not configured" },
                { status: 500 },
             request);
        }

        const { databases } = getServerClient();

        // Get the message to verify ownership
        const message = await databases.getDocument(
            DATABASE_ID,
            DIRECT_MESSAGES_COLLECTION,
            messageId,
        );

        // Only the sender can delete their message
        if (message.senderId !== session.$id) {
            return jsonResponse(
                { error: "You can only delete your own messages" },
                { status: 403 },
             request);
        }

        await databases.updateDocument(
            DATABASE_ID,
            DIRECT_MESSAGES_COLLECTION,
            messageId,
            {
                removedAt: new Date().toISOString(),
                removedBy: session.$id,
            },
        );

        recordEvent("message_deleted", {
            actorUserId: session.$id,
            conversationId: String(message.conversationId),
            messageId,
            messageType: "dm",
            totalQueryTimeMs: Date.now() - startTime,
        });

        return jsonResponse({ success: true }, request);
    } catch (error) {
        logger.error("DELETE /api/direct-messages error", {
            error: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            },
            { status: 500 },
         request);
    }
}
