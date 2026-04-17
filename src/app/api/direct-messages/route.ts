import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Query, Permission, Role } from "node-appwrite";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { FileAttachment } from "@/lib/types";
import {
    getRelationshipMap,
    getRelationshipStatus,
} from "@/lib/appwrite-friendships";
import {
    getNotificationSettings,
    getOrCreateNotificationSettings,
} from "@/lib/notification-settings";
import { getUserProfile } from "@/lib/appwrite-profiles";
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
} from "@/lib/newrelic-utils";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import { upsertMentionInboxItems } from "@/lib/inbox-items";
import { resolveMessageImageUrl } from "@/lib/message-image-url";
import { shouldCompress } from "@/lib/compression-utils";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const CONVERSATIONS_COLLECTION = env.collections.conversations;
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const MESSAGE_ATTACHMENTS_COLLECTION_ID = env.collections.messageAttachments;
const SYSTEM_SENDER_USER_ID = process.env.SYSTEM_SENDER_USER_ID?.trim() || null;
const SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON =
    "Replies are disabled for system announcements";

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
        getOrCreateNotificationSettings(userId).catch((error) => {
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
 */
async function createAttachments(
    messageId: string,
    attachments: FileAttachment[],
): Promise<void> {
    if (!attachments || attachments.length === 0) {
        return;
    }

    if (!MESSAGE_ATTACHMENTS_COLLECTION_ID) {
        return;
    }

    const { databases } = getServerClient();

    await Promise.all(
        attachments.map((attachment) =>
            databases.createDocument(
                DATABASE_ID,
                MESSAGE_ATTACHMENTS_COLLECTION_ID,
                ID.unique(),
                {
                    messageId,
                    messageType: "dm",
                    fileId: attachment.fileId,
                    fileName: attachment.fileName,
                    fileSize: attachment.fileSize,
                    fileType: attachment.fileType,
                    fileUrl: attachment.fileUrl,
                    thumbnailUrl: attachment.thumbnailUrl || null,
                },
            ),
        ),
    );
}

// Helper to create JSON responses with CORS headers and compression hints
function jsonResponse(data: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS",
    );
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Add compression headers for large responses
    const jsonString = JSON.stringify(data);
    const bodySize = new Blob([jsonString]).size;

    if (shouldCompress("application/json", bodySize)) {
        headers.set("X-Compressible", "true");
        const existingVary = headers.get("Vary");
        headers.set(
            "Vary",
            existingVary
                ? `${existingVary}, Accept-Encoding`
                : "Accept-Encoding",
        );

        // Log compression opportunity in development
        if (process.env.NODE_ENV === "development") {
            logger.info("Direct messages response compressed", {
                bodySize,
                endpoint: "direct-messages",
            });
        }
    }

    return NextResponse.json(data, {
        ...init,
        headers,
    });
}

// Handle preflight requests
export async function OPTIONS() {
    return jsonResponse({});
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
            return jsonResponse({ error: "Unauthorized" }, { status: 401 });
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
                return jsonResponse({ conversations: [] });
            }

            const { databases } = getServerClient();
            const dbStartTime = Date.now();
            const response = await databases.listDocuments(
                DATABASE_ID,
                CONVERSATIONS_COLLECTION,
                [
                    Query.contains("participants", session.$id),
                    Query.orderDesc("lastMessageAt"),
                    Query.limit(100),
                ],
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
            let threadReadLookupFailed = false;
            try {
                readStatesByConversationId = await listThreadReadsByContext({
                    contextIds: conversations.map(
                        (conversation) => conversation.$id,
                    ),
                    contextType: "conversation",
                    userId: session.$id,
                });
            } catch (error) {
                threadReadLookupFailed = true;
                logger.warn("Thread read lookup failed for conversations", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    userId: session.$id,
                });
            }

            if (conversations.length > 0 && !threadReadLookupFailed) {
                try {
                    const pageSize = 500;
                    const maxThreadParentPages = 20;
                    let cursorAfterId: string | null = null;
                    let pageCount = 0;

                    while (pageCount < maxThreadParentPages) {
                        pageCount += 1;
                        const page = await databases.listDocuments(
                            DATABASE_ID,
                            DIRECT_MESSAGES_COLLECTION,
                            [
                                Query.equal(
                                    "conversationId",
                                    conversations.map(
                                        (conversation) => conversation.$id,
                                    ),
                                ),
                                Query.greaterThan("threadMessageCount", 0),
                                Query.orderAsc("$id"),
                                Query.limit(pageSize),
                                ...(cursorAfterId
                                    ? [Query.cursorAfter(cursorAfterId)]
                                    : []),
                            ],
                        );

                        for (const document of page.documents) {
                            const threadParent = document as Record<
                                string,
                                unknown
                            >;
                            const conversationId = String(
                                threadParent.conversationId,
                            );
                            const messageId = String(threadParent.$id);
                            const lastThreadReplyAt =
                                typeof threadParent.lastThreadReplyAt ===
                                "string"
                                    ? threadParent.lastThreadReplyAt
                                    : undefined;
                            const threadMessageCount =
                                typeof threadParent.threadMessageCount ===
                                "number"
                                    ? threadParent.threadMessageCount
                                    : undefined;
                            const lastReadAt =
                                readStatesByConversationId.get(
                                    conversationId,
                                )?.[messageId];

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

                        if (page.documents.length < pageSize) {
                            break;
                        }

                        const lastDocument = page.documents.at(-1) as
                            | Record<string, unknown>
                            | undefined;
                        cursorAfterId =
                            lastDocument && typeof lastDocument.$id === "string"
                                ? lastDocument.$id
                                : null;

                        if (!cursorAfterId) {
                            break;
                        }
                    }

                    if (pageCount === maxThreadParentPages && cursorAfterId) {
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
                } catch {
                    // Skip unread aggregates if the supporting query fails.
                }
            }

            const relationshipMap = await getRelationshipMap(
                session.$id,
                oneToOneOtherUserIds,
            );

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

                return {
                    ...conversation,
                    hasUnread: unreadThreadCount > 0,
                    readOnly,
                    readOnlyReason: relationship
                        ? getReadOnlyReason(relationship)
                        : undefined,
                    relationship,
                    unreadThreadCount,
                    unreadThreadCountTruncated: unreadThreadCountsTruncated,
                };
            });

            logger.info("Listed conversations", {
                userId: session.$id,
                count: enrichedConversations.length,
            });

            return jsonResponse({ conversations: enrichedConversations });
        }

        // Get or create a conversation between two users
        if (type === "conversation") {
            const userId1 = searchParams.get("userId1");
            const userId2 = searchParams.get("userId2");

            if (!userId1 || !userId2) {
                return jsonResponse(
                    { error: "userId1 and userId2 are required" },
                    { status: 400 },
                );
            }

            if (!CONVERSATIONS_COLLECTION) {
                return jsonResponse(
                    { error: "Conversations not configured" },
                    { status: 500 },
                );
            }

            // Sort user IDs to ensure consistent ordering
            const [user1, user2] = [userId1, userId2].sort();
            const participants = [user1, user2];
            if (!participants.includes(session.$id)) {
                return jsonResponse(
                    { error: "You can only access your own direct messages" },
                    { status: 403 },
                );
            }

            const targetUserId = participants.find((id) => id !== session.$id);
            if (!targetUserId) {
                return jsonResponse(
                    { error: "A target user is required" },
                    { status: 400 },
                );
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
                    const relationship = await getRelationshipStatus(
                        session.$id,
                        targetUserId,
                    );
                    const encryptionState = await getDmEncryptionStateForPair(
                        session.$id,
                        targetUserId,
                    );
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
                            dmEncryptionSelfEnabled:
                                encryptionState.dmEncryptionSelfEnabled,
                            dmEncryptionPeerEnabled:
                                encryptionState.dmEncryptionPeerEnabled,
                            dmEncryptionMutualEnabled:
                                encryptionState.dmEncryptionMutualEnabled,
                            dmEncryptionPeerPublicKey:
                                encryptionState.dmEncryptionPeerPublicKey,
                        },
                    });
                }

                if (conversationLookupTruncated) {
                    return jsonResponse(
                        {
                            error: "Unable to safely determine whether a direct message already exists. Please try again.",
                        },
                        { status: 409 },
                    );
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
                );
            }

            const relationship = await getRelationshipStatus(
                session.$id,
                targetUserId,
            );
            const encryptionState = await getDmEncryptionStateForPair(
                session.$id,
                targetUserId,
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
                );
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
                    dmEncryptionSelfEnabled:
                        encryptionState.dmEncryptionSelfEnabled,
                    dmEncryptionPeerEnabled:
                        encryptionState.dmEncryptionPeerEnabled,
                    dmEncryptionMutualEnabled:
                        encryptionState.dmEncryptionMutualEnabled,
                    dmEncryptionPeerPublicKey:
                        encryptionState.dmEncryptionPeerPublicKey,
                },
            });
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
                );
            }

            if (!DIRECT_MESSAGES_COLLECTION) {
                return jsonResponse({ items: [], nextCursor: null });
            }

            const { databases } = getServerClient();
            const conversation = await databases
                .getDocument(
                    DATABASE_ID,
                    CONVERSATIONS_COLLECTION,
                    conversationId,
                )
                .catch(() => null);

            let readOnly = false;
            let readOnlyReason: string | undefined;
            let relationship;
            let dmEncryptionSelfEnabled = false;
            let dmEncryptionPeerEnabled = false;
            let dmEncryptionMutualEnabled = false;
            let dmEncryptionPeerPublicKey: string | undefined;

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
                    );
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
                        relationship = await getRelationshipStatus(
                            session.$id,
                            otherUserId,
                        );
                        readOnly = !relationship.canSendDirectMessage;
                        readOnlyReason = getReadOnlyReason(relationship);
                        const encryptionState =
                            await getDmEncryptionStateForPair(
                                session.$id,
                                otherUserId,
                            );
                        dmEncryptionSelfEnabled =
                            encryptionState.dmEncryptionSelfEnabled;
                        dmEncryptionPeerEnabled =
                            encryptionState.dmEncryptionPeerEnabled;
                        dmEncryptionMutualEnabled =
                            encryptionState.dmEncryptionMutualEnabled;
                        dmEncryptionPeerPublicKey =
                            encryptionState.dmEncryptionPeerPublicKey;
                    }
                }
            }

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
                mentions: Array.isArray(doc.mentions)
                    ? (doc.mentions as string[])
                    : undefined,
            }));

            if (conversation) {
                const participants = Array.isArray(conversation.participants)
                    ? (conversation.participants as string[])
                    : [];
                const isGroupConversation =
                    Boolean(
                        (conversation as Record<string, unknown>).isGroup,
                    ) || participants.length > 2;

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
            });
        }

        return jsonResponse(
            { error: "Invalid type parameter" },
            { status: 400 },
        );
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
        );
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
            return jsonResponse({ error: "Unauthorized" }, { status: 401 });
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
                );
            }

            const participantIds = Array.isArray(body.participants)
                ? Array.from(new Set(body.participants.map((id) => String(id))))
                : [];

            if (!participantIds.includes(session.$id)) {
                participantIds.push(session.$id);
            }

            if (participantIds.length < 3) {
                return jsonResponse(
                    {
                        error: "Group conversations require at least 3 participants",
                    },
                    { status: 400 },
                );
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
                );
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
            );
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

        const hasEncryptedText =
            typeof encryptedText === "string" && encryptedText.length > 0;

        addTransactionAttributes({
            userId: session.$id,
            conversationId: conversationId ?? "unknown",
            hasImage: !!imageFileId,
            hasEncryptedText,
            hasAttachments: !!(attachments && attachments.length > 0),
            attachmentCount: attachments?.length || 0,
            isReply: !!replyToId,
            operation: "send-message",
        });

        if (
            !conversationId ||
            !senderId ||
            (!text?.trim() &&
                !hasEncryptedText &&
                !imageFileId &&
                (!attachments || attachments.length === 0))
        ) {
            return jsonResponse(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        if (text && text.length > MAX_MESSAGE_LENGTH) {
            return jsonResponse(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
            );
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
            );
        }

        if (isEncrypted === true && !hasEncryptedText) {
            return jsonResponse(
                {
                    error: "Encrypted messages must include encryptedText and encryption metadata",
                },
                { status: 400 },
            );
        }

        // Validate sender is the authenticated user
        if (senderId !== session.$id) {
            return jsonResponse(
                { error: "Cannot send message as another user" },
                { status: 403 },
            );
        }

        if (!DIRECT_MESSAGES_COLLECTION || !CONVERSATIONS_COLLECTION) {
            return jsonResponse(
                { error: "Direct messages not configured" },
                { status: 500 },
            );
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
            isSystemAnnouncementThread &&
            (SYSTEM_SENDER_USER_ID === null || senderId !== SYSTEM_SENDER_USER_ID)
        ) {
            return jsonResponse(
                { error: SYSTEM_ANNOUNCEMENT_READ_ONLY_REASON },
                { status: 403 },
            );
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
            );
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
                );
            }
        }

        const hasPlaintextText =
            typeof text === "string" &&
            text.trim().length > 0 &&
            !hasEncryptedText;

        if (!isGroupConversation && targetReceiverId && hasPlaintextText) {
            const [senderSettings, receiverSettings, senderProfile, receiverProfile] =
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

            if (requiresEncryptedText) {
                return jsonResponse(
                    {
                        error:
                            "Encrypted text is required for this conversation because DM encryption is enabled for both participants",
                    },
                    { status: 400 },
                );
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
                );
            }

            const [
                senderSettings,
                receiverSettings,
                senderProfile,
                receiverProfile,
            ] =
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
                );
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
                );
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
                );
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
            text: hasEncryptedText ? "" : (text || ""),
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

        trackApiCall(
            "/api/direct-messages",
            "POST",
            200,
            Date.now() - dbStartTime,
            { operation: "createDocument", collection: "direct_messages" },
        );

        // Create attachment records if any
        if (attachments && attachments.length > 0) {
            try {
                await createAttachments(
                    String(message.$id),
                    attachments as FileAttachment[],
                );
            } catch (attachmentError) {
                logger.error("Failed to create attachments", {
                    messageId: message.$id,
                    error:
                        attachmentError instanceof Error
                            ? attachmentError.message
                            : String(attachmentError),
                });
                // Continue even if attachment creation fails
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
        }

        // Track DM sent event
        trackMessage("sent", "dm", {
            messageId: message.$id,
            senderId,
            receiverId,
            conversationId,
            hasImage: !!imageFileId,
            hasAttachments: !!(attachments && attachments.length > 0),
            attachmentCount: attachments?.length || 0,
            isReply: !!replyToId,
            textLength: text?.length || 0,
        });

        recordEvent("message_sent", {
            actorUserId: senderId,
            conversationId,
            hasAttachments: Boolean(attachments && attachments.length > 0),
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
        };

        // Include attachments in response if any
        if (attachments && attachments.length > 0) {
            responseMessage.attachments = attachments as FileAttachment[];
        }

        return jsonResponse({ message: responseMessage });
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
        );
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
            return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("id");

        if (!messageId) {
            return jsonResponse(
                { error: "Message ID is required" },
                { status: 400 },
            );
        }

        const body = (await request.json()) as { text: string };
        const { text } = body;

        if (!text?.trim()) {
            return jsonResponse({ error: "Text is required" }, { status: 400 });
        }

        if (text.length > MAX_MESSAGE_LENGTH) {
            return jsonResponse(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
            );
        }

        if (!DIRECT_MESSAGES_COLLECTION) {
            return jsonResponse(
                { error: "Direct messages not configured" },
                { status: 500 },
            );
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
            );
        }

        if ((message as Record<string, unknown>).isEncrypted) {
            return jsonResponse(
                {
                    error:
                        "Encrypted direct messages cannot be edited after send",
                },
                { status: 409 },
            );
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
        });
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
        );
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
            return jsonResponse({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("id");

        if (!messageId) {
            return jsonResponse(
                { error: "Message ID is required" },
                { status: 400 },
            );
        }

        if (!DIRECT_MESSAGES_COLLECTION) {
            return jsonResponse(
                { error: "Direct messages not configured" },
                { status: 500 },
            );
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
            );
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

        return jsonResponse({ success: true });
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
        );
    }
}
