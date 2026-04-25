import { ID, Query, Permission, Role } from "node-appwrite";

import type { Conversation, DirectMessage, FileAttachment } from "./types";
import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";
import { listPages } from "./appwrite-pagination";
import { parseReactionsWithMetadata, type Reaction } from "./reactions-utils";
import { normalizeFileAttachment } from "./file-attachments";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const CONVERSATIONS_COLLECTION = env.collections.conversations;
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const MESSAGE_ATTACHMENTS_COLLECTION_ID = env.collections.messageAttachments;
const migratedReactionDocuments = new Set<string>();

const ATTACHMENT_SELECT_FIELDS = [
    "messageId",
    "fileId",
    "fileName",
    "fileSize",
    "fileType",
    "fileUrl",
    "thumbnailUrl",
    "mediaKind",
    "source",
    "provider",
    "providerAssetId",
    "packId",
    "itemId",
    "previewUrl",
] as const;

const MAX_ATTACHMENTS_PER_MESSAGE = 10;

function selectQuery(fields: readonly string[]) {
    const queryWithSelect = Query as typeof Query & {
        select?: (selectedFields: string[]) => string;
    };

    return typeof queryWithSelect.select === "function"
        ? [queryWithSelect.select([...fields])]
        : [];
}

function isConflictError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === 409) {
        return true;
    }

    return typeof candidate.message === "string"
        ? candidate.message.toLowerCase().includes("already exists")
        : false;
}

/**
 * Create a deterministic direct-message conversation document ID for two users.
 * Inputs are canonicalized by sorting and encoded as a JSON array before hashing
 * so ordering is stable and delimiter collisions are impossible.
 */
async function createDirectConversationDocumentId(
    user1: string,
    user2: string,
): Promise<string> {
    const canonicalUserIds = [user1, user2].sort((a, b) => a.localeCompare(b));
    const input = JSON.stringify(canonicalUserIds);
    const inputBytes = new TextEncoder().encode(input);
    const digestBuffer = await crypto.subtle.digest("SHA-256", inputBytes);
    const digestHex = Array.from(new Uint8Array(digestBuffer))
        .slice(0, 16)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");

    return `dm_${digestHex}`;
}

type ProfileData = {
    displayName?: string;
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    pronouns?: string;
};

function isProfileData(value: unknown): value is ProfileData {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        (candidate.displayName === undefined ||
            typeof candidate.displayName === "string") &&
        (candidate.avatarUrl === undefined ||
            typeof candidate.avatarUrl === "string") &&
        (candidate.avatarFramePreset === undefined ||
            typeof candidate.avatarFramePreset === "string") &&
        (candidate.avatarFrameUrl === undefined ||
            typeof candidate.avatarFrameUrl === "string") &&
        (candidate.pronouns === undefined ||
            typeof candidate.pronouns === "string")
    );
}

type ReactionsInput =
    | string
    | Reaction[]
    | Record<string, unknown>
    | null
    | undefined;

/**
 * Batch-fetch user profiles through the Next.js API route (client-safe).
 *
 * @param {string[]} userIds - The user ids value.
 * @returns {Promise<Map<string, ProfileData>>} The return value.
 */
async function fetchProfilesBatch(
    userIds: string[],
): Promise<Map<string, ProfileData>> {
    const profileMap = new Map<string, ProfileData>();
    if (userIds.length === 0) {
        return profileMap;
    }
    try {
        const response = await fetch("/api/profiles/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds }),
        });
        if (!response.ok) {
            return profileMap;
        }
        const payload = (await response.json()) as {
            profiles?: unknown;
        };
        const profiles = payload.profiles;
        if (!profiles || typeof profiles !== "object") {
            return profileMap;
        }

        for (const [uid, profile] of Object.entries(profiles)) {
            if (isProfileData(profile)) {
                profileMap.set(uid, profile);
            }
        }
    } catch {
        // Fail silently — callers handle missing profiles gracefully
    }
    return profileMap;
}

/**
 * Returns databases.
 * @returns {Databases} The return value.
 */
function getDatabases() {
    return getBrowserDatabases();
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function mapWithConcurrency<T, R>(params: {
    items: T[];
    concurrency: number;
    mapper: (item: T) => Promise<R>;
}): Promise<R[]> {
    const { items, concurrency, mapper } = params;
    if (items.length === 0) {
        return [];
    }

    const workerCount = Math.min(Math.max(1, concurrency), items.length);
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex]);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Normalizes and persists legacy reaction payloads when needed.
 * Accepts the same input formats supported by parseReactionsWithMetadata:
 * JSON string, parsed reaction array, or legacy reaction map object.
 * Example accepted payloads: '[{"emoji":"🔥","userIds":["u1"],"count":1}]' or
 * {"🔥": ["u1", "u2"]}.
 *
 * @param {string} messageId - The message id value.
 * @param {ReactionsInput} reactions - Raw or parsed reaction payload to normalize.
 * @returns {void} The return value.
 */
function scheduleReactionMigration(
    messageId: string,
    reactions: ReactionsInput,
) {
    if (!DIRECT_MESSAGES_COLLECTION) {
        return;
    }

    const key = `${DIRECT_MESSAGES_COLLECTION}:${messageId}`;
    if (migratedReactionDocuments.has(key)) {
        return;
    }

    const parsed = parseReactionsWithMetadata(reactions);
    if (!parsed.didNormalize) {
        return;
    }

    migratedReactionDocuments.add(key);
    void getDatabases()
        .updateDocument({
            databaseId: DATABASE_ID,
            collectionId: DIRECT_MESSAGES_COLLECTION,
            documentId: messageId,
            data: {
                reactions: JSON.stringify(parsed.reactions),
            },
        })
        .catch(() => {
            migratedReactionDocuments.delete(key);
        });
}

/**
 * Fetch attachments for direct messages and enrich them
 *
 * @param {DirectMessage[]} messages - The messages value.
 * @returns {Promise<DirectMessage[]>} The return value.
 */
async function enrichDirectMessagesWithAttachments(
    messages: DirectMessage[],
): Promise<DirectMessage[]> {
    if (!messages || messages.length === 0) {
        return messages;
    }

    if (!MESSAGE_ATTACHMENTS_COLLECTION_ID) {
        return messages;
    }

    try {
        // Get all message IDs
        const messageIds = messages.map((m) => m.$id);

        const pageSize = Math.min(
            1000,
            Math.max(50, messageIds.length * MAX_ATTACHMENTS_PER_MESSAGE),
        );
        const pagedAttachmentDocuments = await mapWithConcurrency({
            items: chunkArray(messageIds, 100),
            concurrency: 4,
            mapper: async (messageIdChunk) => {
                const page = await listPages({
                    databases: getDatabases(),
                    databaseId: DATABASE_ID,
                    collectionId: MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    baseQueries: [
                        Query.equal("messageId", messageIdChunk),
                        Query.equal("messageType", "dm"),
                        ...selectQuery(ATTACHMENT_SELECT_FIELDS),
                    ],
                    pageSize,
                    warningContext: "enrichDirectMessagesWithAttachments",
                    maxPages: 50,
                });
                return page.documents;
            },
        });
        const attachmentDocuments = pagedAttachmentDocuments.flat();

        // Group attachments by messageId
        const attachmentsByMessageId = new Map<string, FileAttachment[]>();
        for (const doc of attachmentDocuments) {
            const d = doc as Record<string, unknown>;
            const messageId = String(d.messageId);
            const attachment = normalizeFileAttachment(d);
            if (!attachment) {
                continue;
            }

            if (!attachmentsByMessageId.has(messageId)) {
                attachmentsByMessageId.set(messageId, []);
            }
            const messageAttachments = attachmentsByMessageId.get(messageId);
            if (messageAttachments) {
                messageAttachments.push(attachment);
            }
        }

        // Enrich messages with their attachments
        return messages.map((message) => {
            const attachments = attachmentsByMessageId.get(message.$id);
            if (attachments && attachments.length > 0) {
                return { ...message, attachments };
            }
            return message;
        });
    } catch {
        // If attachment fetch fails, return messages without attachments
        return messages;
    }
}

/**
 * Get or create a conversation between two users
 *
 * @param {string} userId1 - The user id1 value.
 * @param {string} userId2 - The user id2 value.
 * @returns {Promise<Conversation>} The return value.
 */
export async function getOrCreateConversation(
    userId1: string,
    userId2: string,
): Promise<Conversation> {
    if (!CONVERSATIONS_COLLECTION) {
        throw new Error("Conversations collection not configured");
    }

    // Sort user IDs to ensure consistent ordering
    const [user1, user2] = [userId1, userId2].sort();
    const participants = [user1, user2];
    const deterministicConversationId =
        await createDirectConversationDocumentId(user1, user2);

    try {
        const existingById = await getDatabases().getDocument({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            documentId: deterministicConversationId,
        });
        const existingByIdRecord = existingById as Record<string, unknown>;
        const participantList = Array.isArray(existingByIdRecord.participants)
            ? (existingByIdRecord.participants as string[])
            : [];

        if (
            participantList.length === 2 &&
            participantList.includes(user1) &&
            participantList.includes(user2)
        ) {
            return {
                $id: String(existingByIdRecord.$id),
                $permissions: Array.isArray(existingByIdRecord.$permissions)
                    ? (existingByIdRecord.$permissions as string[])
                    : undefined,
                participants: participantList,
                lastMessageAt: existingByIdRecord.lastMessageAt
                    ? String(existingByIdRecord.lastMessageAt)
                    : undefined,
                $createdAt: String(existingByIdRecord.$createdAt),
            };
        }
    } catch {
        // Fall back to legacy paginated contains lookup for older records.
    }

    try {
        const databases = getDatabases();
        const queriesWithParticipantCount = [
            Query.contains("participants", user1),
            Query.contains("participants", user2),
            Query.equal("participantCount", 2),
            Query.orderAsc("$createdAt"),
            Query.limit(1),
        ];

        let documents: Array<Record<string, unknown>> = [];
        try {
            const response = await databases.listDocuments({
                databaseId: DATABASE_ID,
                collectionId: CONVERSATIONS_COLLECTION,
                queries: queriesWithParticipantCount,
            });
            documents = (response.documents ?? []) as Array<Record<string, unknown>>;
        } catch {
            const fallbackResponse = await databases.listDocuments({
                databaseId: DATABASE_ID,
                collectionId: CONVERSATIONS_COLLECTION,
                queries: [
                    Query.contains("participants", user1),
                    Query.contains("participants", user2),
                    Query.orderAsc("$createdAt"),
                    Query.limit(1),
                ],
            });
            documents = (fallbackResponse.documents ?? []) as Array<Record<string, unknown>>;
        }

        const oneToOne = documents.at(0);
        if (oneToOne) {
            return {
                $id: String(oneToOne.$id),
                $permissions: Array.isArray(oneToOne.$permissions)
                    ? (oneToOne.$permissions as string[])
                    : undefined,
                participants: Array.isArray(oneToOne.participants)
                    ? (oneToOne.participants as string[])
                    : participants,
                lastMessageAt: oneToOne.lastMessageAt
                    ? String(oneToOne.lastMessageAt)
                    : undefined,
                $createdAt: String(oneToOne.$createdAt),
            };
        }
    } catch {
        // Continue to create new conversation if not found
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

    let newConv: unknown;
    try {
        newConv = await getDatabases().createDocument({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            documentId: deterministicConversationId,
            data: {
                participants,
                participantCount: participants.length,
                lastMessageAt: new Date().toISOString(),
            },
            permissions,
        });
    } catch (error) {
        if (!isConflictError(error)) {
            throw error;
        }

        const existing = await getDatabases().getDocument({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            documentId: deterministicConversationId,
        });
        const existingRecord = existing as Record<string, unknown>;
        const participants = Array.isArray(existingRecord.participants)
            ? (existingRecord.participants as string[])
            : [];
        return {
            $id: String(existingRecord.$id),
            $permissions: Array.isArray(existingRecord.$permissions)
                ? (existingRecord.$permissions as string[])
                : undefined,
            participants,
            lastMessageAt: existingRecord.lastMessageAt
                ? String(existingRecord.lastMessageAt)
                : undefined,
            $createdAt: String(existingRecord.$createdAt),
        };
    }

    const doc = newConv as unknown as Record<string, unknown>;
    return {
        $id: String(doc.$id),
        $permissions: Array.isArray(doc.$permissions)
            ? (doc.$permissions as string[])
            : undefined,
        participants: doc.participants as string[],
        lastMessageAt: doc.lastMessageAt
            ? String(doc.lastMessageAt)
            : undefined,
        $createdAt: String(doc.$createdAt),
    };
}

/**
 * Create a group DM conversation with 3+ participants
 *
 * @param {string[]} participantIds - The participant ids value.
 * @param {object} [options] - Optional settings: name?: string, avatarUrl?: string.
 * @returns {Promise<Conversation>} The return value.
 */
export async function createGroupConversation(
    participantIds: string[],
    options?: { name?: string; avatarUrl?: string },
): Promise<Conversation> {
    if (!CONVERSATIONS_COLLECTION) {
        throw new Error("Conversations collection not configured");
    }

    if (!participantIds || participantIds.length < 3) {
        throw new Error("Group conversations require at least 3 participants");
    }

    const uniqueParticipants = Array.from(
        new Set(participantIds.map((id) => String(id))),
    );

    const permissions = uniqueParticipants.flatMap((id) => [
        Permission.read(Role.user(id)),
        Permission.update(Role.user(id)),
        Permission.delete(Role.user(id)),
    ]);

    const newConv = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: CONVERSATIONS_COLLECTION,
        documentId: ID.unique(),
        data: {
            participants: uniqueParticipants.sort(),
            lastMessageAt: new Date().toISOString(),
            isGroup: true,
            name: options?.name ?? null,
            avatarUrl: options?.avatarUrl ?? null,
        },
        permissions,
    });

    const doc = newConv as unknown as Record<string, unknown>;
    return {
        $id: String(doc.$id),
        $permissions: Array.isArray(doc.$permissions)
            ? (doc.$permissions as string[])
            : undefined,
        participants: doc.participants as string[],
        lastMessageAt: doc.lastMessageAt
            ? String(doc.lastMessageAt)
            : undefined,
        $createdAt: String(doc.$createdAt),
        isGroup: true,
        name: (doc.name as string) || undefined,
        avatarUrl: (doc.avatarUrl as string) || undefined,
        participantCount: uniqueParticipants.length,
    };
}

/**
 * List all conversations for a user
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<Conversation[]>} The return value.
 */
export async function listConversations(
    userId: string,
): Promise<Conversation[]> {
    if (!CONVERSATIONS_COLLECTION) {
        return [];
    }

    try {
        const response = await getDatabases().listDocuments({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            queries: [
                Query.contains("participants", userId),
                Query.orderDesc("lastMessageAt"),
                Query.limit(100),
            ],
        });

        const conversations = response.documents.map((doc) => {
            const d = doc as Record<string, unknown>;
            return {
                $id: String(d.$id),
                $permissions: Array.isArray(d.$permissions)
                    ? (d.$permissions as string[])
                    : undefined,
                participants: d.participants as string[],
                lastMessageAt: d.lastMessageAt
                    ? String(d.lastMessageAt)
                    : undefined,
                $createdAt: String(d.$createdAt),
                isGroup:
                    Boolean((d as Record<string, unknown>).isGroup) ||
                    (Array.isArray(d.participants) &&
                        (d.participants as unknown[]).length > 2),
                participantCount: Array.isArray(d.participants)
                    ? (d.participants as unknown[]).length
                    : undefined,
            };
        });

        // Enrich with other user's profile data (batch fetch via API route)
        const otherUserIds = conversations
            .map((conv) => conv.participants.find((id) => id !== userId))
            .filter((id): id is string => Boolean(id));
        const profileMap = await fetchProfilesBatch(otherUserIds);

        const enriched = conversations.map((conv) => {
            const otherUserId = conv.participants.find((id) => id !== userId);
            if (!otherUserId) {
                return conv;
            }
            const profile = profileMap.get(otherUserId);
            return {
                ...conv,
                otherUser: {
                    userId: otherUserId,
                    displayName: profile?.displayName,
                    avatarUrl: profile?.avatarUrl,
                    avatarFramePreset: profile?.avatarFramePreset,
                    avatarFrameUrl: profile?.avatarFrameUrl,
                },
            };
        });

        return enriched;
    } catch {
        return [];
    }
}

/**
 * Send a direct message
 *
 * @param {string} conversationId - The conversation id value.
 * @param {string} senderId - The sender id value.
 * @param {string | undefined} receiverId - The receiver id value.
 * @param {string} text - The text value.
 * @returns {Promise<DirectMessage>} The return value.
 */
export async function sendDirectMessage(
    conversationId: string,
    senderId: string,
    receiverId: string | undefined,
    text: string,
): Promise<DirectMessage> {
    if (!DIRECT_MESSAGES_COLLECTION || !CONVERSATIONS_COLLECTION) {
        throw new Error("Direct messages not configured");
    }

    let participants: string[] = [];
    let isGroupConversation = false;

    try {
        const conversation = await getDatabases().getDocument({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            documentId: conversationId,
        });

        participants = Array.isArray(
            (conversation as Record<string, unknown>).participants,
        )
            ? ((conversation as Record<string, unknown>)
                  .participants as string[])
            : [];

        isGroupConversation =
            Boolean((conversation as Record<string, unknown>).isGroup) ||
            participants.length > 2;
    } catch {
        // Fall back to sender/receiver when conversation metadata is unavailable (compat with existing tests)
        participants = Array.from(
            new Set([senderId, receiverId].filter(Boolean) as string[]),
        );
        isGroupConversation = participants.length > 2;
    }

    if (!participants.includes(senderId)) {
        participants = Array.from(new Set([...participants, senderId]));
    }

    const targetReceiverId = isGroupConversation
        ? undefined
        : (receiverId ?? participants.find((id) => id !== senderId));

    if (!isGroupConversation && !targetReceiverId) {
        throw new Error("receiverId is required for direct messages");
    }

    const permissions = [
        ...participants.map((id) => Permission.read(Role.user(id))),
        Permission.update(Role.user(senderId)),
        Permission.delete(Role.user(senderId)),
    ];

    const message = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: DIRECT_MESSAGES_COLLECTION,
        documentId: ID.unique(),
        data: {
            conversationId,
            senderId,
            receiverId: targetReceiverId,
            text,
        },
        permissions,
    });

    // Update conversation's lastMessageAt
    try {
        await getDatabases().updateDocument({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            documentId: conversationId,
            data: {
                lastMessageAt: new Date().toISOString(),
            },
        });
    } catch {
        // Don't fail if conversation update fails
    }

    const doc = message as unknown as Record<string, unknown>;
    const receiver =
        doc.receiverId !== undefined && doc.receiverId !== null
            ? String(doc.receiverId)
            : undefined;

    return {
        $id: String(doc.$id),
        $permissions: Array.isArray(doc.$permissions)
            ? (doc.$permissions as string[])
            : undefined,
        conversationId: String(doc.conversationId),
        senderId: String(doc.senderId),
        receiverId: receiver,
        text: String(doc.text ?? ""),
        $createdAt: String(doc.$createdAt),
        editedAt: doc.editedAt ? String(doc.editedAt) : undefined,
        removedAt: doc.removedAt ? String(doc.removedAt) : undefined,
        removedBy: doc.removedBy ? String(doc.removedBy) : undefined,
    };
}

/**
 * List direct messages in a conversation
 *
 * @param {string} conversationId - The conversation id value.
 * @param {number} limit - The limit value, if provided.
 * @param {string | undefined} cursor - The cursor value, if provided.
 * @returns {Promise<{ items: DirectMessage[]; nextCursor?: string | undefined; }>} The return value.
 */
export async function listDirectMessages(
    conversationId: string,
    limit = 50,
    cursor?: string,
): Promise<{ items: DirectMessage[]; nextCursor?: string }> {
    if (!DIRECT_MESSAGES_COLLECTION) {
        return { items: [] };
    }

    const queries = [
        Query.equal("conversationId", conversationId),
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
    ];

    if (cursor) {
        queries.push(Query.cursorAfter(cursor));
    }

    try {
        const response = await getDatabases().listDocuments({
            databaseId: DATABASE_ID,
            collectionId: DIRECT_MESSAGES_COLLECTION,
            queries,
        });

        const items = response.documents.map((doc) => {
            const d = doc as Record<string, unknown>;
            const parsedReactions = parseReactionsWithMetadata(d.reactions);
            scheduleReactionMigration(
                String(d.$id),
                d.reactions as ReactionsInput,
            );
            return {
                $id: String(d.$id),
                $permissions: Array.isArray(d.$permissions)
                    ? (d.$permissions as string[])
                    : undefined,
                conversationId: String(d.conversationId),
                senderId: String(d.senderId),
                receiverId:
                    typeof d.receiverId === "string" ? d.receiverId : undefined,
                text: String(d.text),
                $createdAt: String(d.$createdAt),
                editedAt: d.editedAt ? String(d.editedAt) : undefined,
                removedAt: d.removedAt ? String(d.removedAt) : undefined,
                removedBy: d.removedBy ? String(d.removedBy) : undefined,
                reactions:
                    parsedReactions.reactions.length > 0
                        ? parsedReactions.reactions
                        : undefined,
            };
        });

        // Enrich with sender profile data (batch fetch via API route)
        const senderIds = [...new Set(items.map((m) => m.senderId))];
        const profileMap = await fetchProfilesBatch(senderIds);

        const enriched = items.map((msg) => {
            const profile = profileMap.get(msg.senderId);
            return {
                ...msg,
                senderDisplayName: profile?.displayName,
                senderAvatarUrl: profile?.avatarUrl,
                senderAvatarFramePreset: profile?.avatarFramePreset,
                senderAvatarFrameUrl: profile?.avatarFrameUrl,
                senderPronouns: profile?.pronouns,
            };
        });

        // Enrich with attachments
        const enrichedWithAttachments =
            await enrichDirectMessagesWithAttachments(enriched);

        const last = enrichedWithAttachments.at(-1);
        return {
            items: enrichedWithAttachments,
            nextCursor:
                enrichedWithAttachments.length === limit && last
                    ? last.$id
                    : undefined,
        };
    } catch {
        return { items: [] };
    }
}

/**
 * Edit a direct message
 *
 * @param {string} messageId - The message id value.
 * @param {string} newText - The new text value.
 * @returns {Promise<void>} The return value.
 */
export async function editDirectMessage(
    messageId: string,
    newText: string,
): Promise<void> {
    if (!DIRECT_MESSAGES_COLLECTION) {
        throw new Error("Direct messages not configured");
    }

    await getDatabases().updateDocument({
        databaseId: DATABASE_ID,
        collectionId: DIRECT_MESSAGES_COLLECTION,
        documentId: messageId,
        data: {
            text: newText,
            editedAt: new Date().toISOString(),
        },
    });
}

/**
 * Delete a direct message (soft delete)
 *
 * @param {string} messageId - The message id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<void>} The return value.
 */
export async function deleteDirectMessage(
    messageId: string,
    userId: string,
): Promise<void> {
    if (!DIRECT_MESSAGES_COLLECTION) {
        throw new Error("Direct messages not configured");
    }

    await getDatabases().updateDocument({
        databaseId: DATABASE_ID,
        collectionId: DIRECT_MESSAGES_COLLECTION,
        documentId: messageId,
        data: {
            removedAt: new Date().toISOString(),
            removedBy: userId,
        },
    });
}
