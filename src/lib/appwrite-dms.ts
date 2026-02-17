import { ID, Query, Permission, Role } from "appwrite";

import type { Conversation, DirectMessage, FileAttachment } from "./types";
import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const CONVERSATIONS_COLLECTION = env.collections.conversations;
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const MESSAGE_ATTACHMENTS_COLLECTION_ID = env.collections.messageAttachments;

type ProfileData = {
    displayName?: string;
    avatarUrl?: string;
    pronouns?: string;
};

/**
 * Batch-fetch user profiles through the Next.js API route (client-safe).
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
        const data = (await response.json()) as {
            profiles: Record<string, ProfileData>;
        };
        for (const [uid, profile] of Object.entries(data.profiles)) {
            profileMap.set(uid, profile);
        }
    } catch {
        // Fail silently — callers handle missing profiles gracefully
    }
    return profileMap;
}

function getDatabases() {
    return getBrowserDatabases();
}

/**
 * Fetch attachments for direct messages and enrich them
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

        // Query attachments for all messages
        const response = await getDatabases().listDocuments({
            databaseId: DATABASE_ID,
            collectionId: MESSAGE_ATTACHMENTS_COLLECTION_ID,
            queries: [
                Query.equal("messageId", messageIds),
                Query.equal("messageType", "dm"),
                Query.limit(1000), // High limit to get all attachments
            ],
        });

        // Group attachments by messageId
        const attachmentsByMessageId = new Map<string, FileAttachment[]>();
        for (const doc of response.documents) {
            const d = doc as Record<string, unknown>;
            const messageId = String(d.messageId);
            const attachment: FileAttachment = {
                fileId: String(d.fileId),
                fileName: String(d.fileName),
                fileSize: Number(d.fileSize),
                fileType: String(d.fileType),
                fileUrl: String(d.fileUrl),
                thumbnailUrl: d.thumbnailUrl
                    ? String(d.thumbnailUrl)
                    : undefined,
            };

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

    try {
        // Try to find existing conversation
        const existing = await getDatabases().listDocuments({
            databaseId: DATABASE_ID,
            collectionId: CONVERSATIONS_COLLECTION,
            queries: [
                Query.equal("participants", user1),
                Query.equal("participants", user2),
                Query.limit(1),
            ],
        });

        if (existing.documents.length > 0) {
            const doc = existing.documents[0] as Record<string, unknown>;
            return {
                $id: String(doc.$id),
                participants: doc.participants as string[],
                lastMessageAt: doc.lastMessageAt
                    ? String(doc.lastMessageAt)
                    : undefined,
                $createdAt: String(doc.$createdAt),
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

    const newConv = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: CONVERSATIONS_COLLECTION,
        documentId: ID.unique(),
        data: {
            participants,
            lastMessageAt: new Date().toISOString(),
        },
        permissions,
    });

    const doc = newConv as unknown as Record<string, unknown>;
    return {
        $id: String(doc.$id),
        participants: doc.participants as string[],
        lastMessageAt: doc.lastMessageAt
            ? String(doc.lastMessageAt)
            : undefined,
        $createdAt: String(doc.$createdAt),
    };
}

/**
 * Create a group DM conversation with 3+ participants
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
                Query.equal("participants", userId),
                Query.orderDesc("lastMessageAt"),
                Query.limit(100),
            ],
        });

        const conversations = response.documents.map((doc) => {
            const d = doc as Record<string, unknown>;
            return {
                $id: String(d.$id),
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
            return {
                $id: String(d.$id),
                conversationId: String(d.conversationId),
                senderId: String(d.senderId),
                receiverId: String(d.receiverId),
                text: String(d.text),
                $createdAt: String(d.$createdAt),
                editedAt: d.editedAt ? String(d.editedAt) : undefined,
                removedAt: d.removedAt ? String(d.removedAt) : undefined,
                removedBy: d.removedBy ? String(d.removedBy) : undefined,
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
