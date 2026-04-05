import { ID, Permission, Query, Role } from "appwrite";

import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";
import type { Message, FileAttachment } from "./types";
import { parseReactionsWithMetadata } from "./reactions-utils";

// Environment derived identifiers (centralized)
const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const COLLECTION_ID = env.collections.messages;
const TYPING_COLLECTION_ID = env.collections.typing || undefined;
const MESSAGE_ATTACHMENTS_COLLECTION_ID = env.collections.messageAttachments;
const migratedReactionDocuments = new Set<string>();

/**
 * Fetch attachments for multiple messages and enrich them
 *
 * @param {Message[]} messages - The messages value.
 * @param {'channel' | 'dm'} messageType - The message type value.
 * @returns {Promise<Message[]>} The return value.
 */
async function enrichMessagesWithAttachments(
    messages: Message[],
    messageType: "channel" | "dm",
): Promise<Message[]> {
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
                Query.equal("messageType", messageType),
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

export type ListOptions = {
    limit?: number;
    cursorAfter?: string;
    channelId?: string;
    order?: "asc" | "desc";
};

/**
 * Returns databases.
 * @returns {Databases} The return value.
 */
function getDatabases() {
    return getBrowserDatabases();
}

/**
 * Lists messages.
 *
 * @param {{ limit?: number | undefined; cursorAfter?: string | undefined; channelId?: string | undefined; order?: 'asc' | 'desc' | undefined; }} opts - The opts value, if provided.
 * @returns {Promise<Message[]>} The return value.
 */
export async function listMessages(opts: ListOptions = {}): Promise<Message[]> {
    const queries = buildMessageListQueries(opts);
    const res = await getDatabases().listDocuments({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_ID,
        queries,
    });
    const messages = mapMessageDocs(
        (res as unknown as { documents?: unknown[] }).documents || [],
    );
    return enrichMessagesWithAttachments(messages, "channel");
}

/**
 * Handles schedule reaction migration.
 *
 * @param {string} messageId - The message id value.
 * @param {unknown} reactions - The reactions value.
 * @returns {void} The return value.
 */
function scheduleReactionMigration(messageId: string, reactions: unknown) {
    const key = `${COLLECTION_ID}:${messageId}`;
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
            collectionId: COLLECTION_ID,
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
 * Builds message list queries.
 *
 * @param {{ limit?: number | undefined; cursorAfter?: string | undefined; channelId?: string | undefined; order?: 'asc' | 'desc' | undefined; }} opts - The opts value.
 * @returns {string[]} The return value.
 */
function buildMessageListQueries(opts: ListOptions) {
    const q: string[] = [];
    if (opts.limit) {
        q.push(Query.limit(opts.limit));
    }
    if (opts.cursorAfter) {
        q.push(Query.cursorAfter(opts.cursorAfter));
    }
    if (opts.channelId) {
        q.push(Query.equal("channelId", opts.channelId));
    }
    q.push(
        opts.order === "desc"
            ? Query.orderDesc("$createdAt")
            : Query.orderAsc("$createdAt"),
    );
    return q;
}

/**
 * Handles map message docs.
 *
 * @param {unknown[]} list - The list value.
 * @returns {Message[]} The return value.
 */
function mapMessageDocs(list: unknown[]): Message[] {
    const out: Message[] = [];
    for (const raw of list) {
        const m = coerceMessage(raw);
        if (m) {
            out.push(m);
        }
    }
    return out;
}

/**
 * Handles coerce message.
 *
 * @param {unknown} raw - The raw value.
 * @returns {Message | null} The return value.
 */
function coerceMessage(raw: unknown): Message | null {
    if (typeof raw !== "object" || !raw || !("$id" in raw)) {
        return null;
    }
    const d = raw as Record<string, unknown> & { $id: string };

    const parsedReactions = parseReactionsWithMetadata(d.reactions);
    scheduleReactionMigration(String(d.$id), d.reactions);

    return {
        $id: String(d.$id),
        userId: String(d.userId),
        userName: typeof d.userName === "string" ? d.userName : undefined,
        text: String(d.text),
        $createdAt: String(d.$createdAt ?? ""),
        channelId: typeof d.channelId === "string" ? d.channelId : undefined,
        editedAt: typeof d.editedAt === "string" ? d.editedAt : undefined,
        removedAt: typeof d.removedAt === "string" ? d.removedAt : undefined,
        removedBy: typeof d.removedBy === "string" ? d.removedBy : undefined,
        serverId: typeof d.serverId === "string" ? d.serverId : undefined,
        replyToId: typeof d.replyToId === "string" ? d.replyToId : undefined,
        threadId: typeof d.threadId === "string" ? d.threadId : undefined,
        threadMessageCount:
            typeof d.threadMessageCount === "number"
                ? d.threadMessageCount
                : undefined,
        threadParticipants: Array.isArray(d.threadParticipants)
            ? (d.threadParticipants as string[])
            : undefined,
        lastThreadReplyAt:
            typeof d.lastThreadReplyAt === "string"
                ? d.lastThreadReplyAt
                : undefined,
        reactions:
            parsedReactions.reactions.length > 0
                ? parsedReactions.reactions
                : undefined,
        imageFileId:
            typeof d.imageFileId === "string" ? d.imageFileId : undefined,
        imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : undefined,
        mentions: Array.isArray(d.mentions)
            ? (d.mentions as string[])
            : undefined,
    };
}

type SendMessageInput = {
    userId: string;
    text: string;
    userName?: string;
    channelId?: string;
    serverId?: string;
    replyToId?: string;
};

/**
 * Handles send message.
 *
 * @param {{ userId: string; text: string; userName?: string | undefined; channelId?: string | undefined; serverId?: string | undefined; replyToId?: string | undefined; }} input - The input value.
 * @returns {Promise<Message>} The return value.
 */
export async function sendMessage(input: SendMessageInput): Promise<Message> {
    const { userId, text, userName, channelId, serverId, replyToId } = input;
    const permissions = [
        Permission.read(Role.any()),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
    ];
    const res = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_ID,
        documentId: ID.unique(),
        data: { userId, text, userName, channelId, serverId, replyToId },
        permissions,
    });
    const doc = res as unknown as Record<string, unknown>;
    return {
        $id: String(doc.$id),
        userId: String(doc.userId),
        userName: doc.userName as string | undefined,
        text: String(doc.text),
        $createdAt: String(doc.$createdAt ?? ""),
        channelId: doc.channelId as string | undefined,
        removedAt: doc.removedAt as string | undefined,
        removedBy: doc.removedBy as string | undefined,
        serverId: doc.serverId as string | undefined,
        replyToId: doc.replyToId as string | undefined,
        threadId: doc.threadId as string | undefined,
        threadMessageCount:
            typeof doc.threadMessageCount === "number"
                ? doc.threadMessageCount
                : undefined,
        threadParticipants: Array.isArray(doc.threadParticipants)
            ? (doc.threadParticipants as string[])
            : undefined,
        lastThreadReplyAt: doc.lastThreadReplyAt as string | undefined,
    };
}

/**
 * Handles edit message.
 *
 * @param {string} messageId - The message id value.
 * @param {string} text - The text value.
 * @returns {Promise<Message>} The return value.
 */
export async function editMessage(messageId: string, text: string) {
    const editedAt = new Date().toISOString();
    const res = await getDatabases().updateDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_ID,
        documentId: messageId,
        data: { text, editedAt },
    });
    return res as unknown as Message;
}

/**
 * Removes message.
 *
 * @param {string} messageId - The message id value.
 * @returns {Promise<void>} The return value.
 */
export async function deleteMessage(messageId: string) {
    await getDatabases().deleteDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_ID,
        documentId: messageId,
    });
}

// Soft delete (moderation) – marks message as removed but keeps for audit
/**
 * Handles soft delete message.
 *
 * @param {string} messageId - The message id value.
 * @param {string} moderatorId - The moderator id value.
 * @returns {Promise<Message>} The return value.
 */
export async function softDeleteMessage(
    messageId: string,
    moderatorId: string,
) {
    const removedAt = new Date().toISOString();
    const res = await getDatabases().updateDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_ID,
        documentId: messageId,
        data: { removedAt, removedBy: moderatorId },
    });
    return res as unknown as Message;
}

/**
 * Handles restore message.
 *
 * @param {string} messageId - The message id value.
 * @returns {Promise<Message>} The return value.
 */
export async function restoreMessage(messageId: string) {
    const res = await getDatabases().updateDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_ID,
        documentId: messageId,
        data: { removedAt: null, removedBy: null },
    });
    return res as unknown as Message;
}

// Typing indicator: create/update ephemeral doc per user+channel via API route
// This now uses the server-side API to avoid permission issues
/**
 * Handles set typing.
 *
 * @param {string} userId - The user id value.
 * @param {string} channelId - The channel id value.
 * @param {string | undefined} userName - The user name value.
 * @param {boolean} isTyping - The is typing value.
 * @returns {Promise<void>} The return value.
 */
export async function setTyping(
    userId: string,
    channelId: string,
    userName: string | undefined,
    isTyping: boolean,
) {
    if (!TYPING_COLLECTION_ID) {
        return;
    }

    try {
        if (isTyping) {
            // Call the API route to create or update typing status
            await fetch("/api/typing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channelId,
                    userName,
                }),
            });
        } else {
            // Call the API route to delete typing status
            await fetch(
                `/api/typing?channelId=${encodeURIComponent(channelId)}`,
                {
                    method: "DELETE",
                },
            );
        }
    } catch {
        // swallow; ephemeral
    }
}

// Basic flood protection heuristic client-side
const recent: string[] = [];
const FLOOD_WINDOW_MS = 5000;
const FLOOD_MAX_MESSAGES = 8;
/**
 * Determines whether can send.
 * @returns {boolean} The return value.
 */
export function canSend() {
    const now = Date.now();
    const cutoff = now - FLOOD_WINDOW_MS;
    while (recent.length && Number(recent[0]) < cutoff) {
        recent.shift();
    }
    if (recent.length >= FLOOD_MAX_MESSAGES) {
        return false;
    }
    recent.push(String(now));
    return true;
}

// Helper: fetch recent messages (returns ascending order for straightforward rendering)
/**
 * Lists recent messages.
 *
 * @param {number} limit - The limit value, if provided.
 * @param {string | undefined} cursorAfter - The cursor after value, if provided.
 * @param {string | undefined} channelId - The channel id value, if provided.
 * @returns {Promise<Message[]>} The return value.
 */
export async function listRecentMessages(
    limit = 30,
    cursorAfter?: string,
    channelId?: string,
) {
    const page = await listMessages({
        limit,
        cursorAfter,
        channelId,
        order: "desc",
    });
    return page.reverse();
}
