import { AppwriteException, Query } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import type { FileAttachment } from "./types";

/**
 * Returns collection ids.
 * @returns {{ servers: string; channels: string; messages: string; messageAttachments: string; }} The return value.
 */
function getCollectionIds() {
    const { collections } = getEnvConfig();
    return {
        servers: collections.servers,
        channels: collections.channels,
        messages: collections.messages,
        messageAttachments: collections.messageAttachments,
    };
}

/**
 * Determines whether is document not found error.
 *
 * @param {unknown} error - The error value.
 * @returns {boolean} The return value.
 */
export function isDocumentNotFoundError(error: unknown) {
    if (error instanceof AppwriteException) {
        return error.code === 404 || error.type === "document_not_found";
    }
    return false;
}

type PageResult<T> = { items: T[]; nextCursor?: string | null };

/**
 * Lists all servers page.
 *
 * @param {number} limit - The limit value.
 * @param {string | undefined} cursor - The cursor value, if provided.
 * @returns {Promise<PageResult<{ $id: string; name?: string | undefined; }>>} The return value.
 */
export async function listAllServersPage(
    limit: number,
    cursor?: string,
): Promise<PageResult<{ $id: string; name?: string }>> {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { servers } = getCollectionIds();
    const queries: string[] = [
        Query.limit(limit),
        Query.orderAsc("$createdAt"),
    ];
    if (cursor) {
        queries.push(Query.cursorAfter(cursor));
    }
    try {
        const res = await databases.listDocuments(dbId, servers, queries);
        const rawList =
            (res as unknown as { documents?: unknown[] }).documents || [];
        const items: { $id: string; name?: string }[] = [];
        for (const raw of rawList) {
            if (typeof raw === "object" && raw && "$id" in raw) {
                const obj = raw as Record<string, unknown> & { $id: string };
                items.push({
                    $id: String(obj.$id),
                    name: typeof obj.name === "string" ? obj.name : undefined,
                });
            }
        }
        const last = items.at(-1);
        return {
            items,
            nextCursor: items.length === limit && last ? last.$id : null,
        };
    } catch {
        return { items: [], nextCursor: null };
    }
}

/**
 * Lists all channels page.
 *
 * @param {string} serverId - The server id value.
 * @param {number} limit - The limit value.
 * @param {string | undefined} cursor - The cursor value, if provided.
 * @returns {Promise<PageResult<{ $id: string; name?: string | undefined; }>>} The return value.
 */
export async function listAllChannelsPage(
    serverId: string,
    limit: number,
    cursor?: string,
): Promise<PageResult<{ $id: string; name?: string }>> {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { channels } = getCollectionIds();
    const queries: string[] = [
        Query.limit(limit),
        Query.orderDesc("$createdAt"),
        Query.equal("serverId", serverId),
    ];
    if (cursor) {
        queries.push(Query.cursorAfter(cursor));
    }
    try {
        const res = await databases.listDocuments(dbId, channels, queries);
        const rawList =
            (res as unknown as { documents?: unknown[] }).documents || [];
        const items: { $id: string; name?: string }[] = [];
        for (const raw of rawList) {
            if (typeof raw === "object" && raw && "$id" in raw) {
                const obj = raw as Record<string, unknown> & { $id: string };
                items.push({
                    $id: String(obj.$id),
                    name: typeof obj.name === "string" ? obj.name : undefined,
                });
            }
        }
        const last = items.at(-1);
        return {
            items,
            nextCursor: items.length === limit && last ? last.$id : null,
        };
    } catch {
        return { items: [], nextCursor: null };
    }
}

type GlobalMessageFilters = {
    limit: number;
    cursorAfter?: string;
    includeRemoved?: boolean;
    onlyRemoved?: boolean;
    userId?: string;
    channelId?: string;
    channelIds?: string[];
    serverId?: string;
    onlyMissingServerId?: boolean;
    text?: string;
};

/**
 * Lists global messages.
 *
 * @param {{ limit: number; cursorAfter?: string | undefined; includeRemoved?: boolean | undefined; onlyRemoved?: boolean | undefined; userId?: string | undefined; channelId?: string | undefined; channelIds?: string[] | undefined; serverId?: string | undefined; onlyMissingServerId?: boolean | undefined; text?: string | undefined; }} filters - The filters value.
 * @returns {Promise<PageResult<{ $id: string; attachments?: FileAttachment[] | undefined; imageUrl?: string | undefined; removedAt?: string | undefined; text?: string | undefined; userId?: string | undefined; userName?: string | undefined; channelId?: string | undefined; serverId?: string | undefined; removedBy?: string | undefined; }>>} The return value.
 */
export async function listGlobalMessages(
    filters: GlobalMessageFilters,
): Promise<
    PageResult<{
        $id: string;
        attachments?: FileAttachment[];
        imageUrl?: string;
        removedAt?: string;
        text?: string;
        userId?: string;
        userName?: string;
        channelId?: string;
        serverId?: string;
        removedBy?: string;
    }>
> {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { messages, messageAttachments } = getCollectionIds();
    const queries = buildMessageQueries(filters, filters.limit);
    try {
        const res = await databases.listDocuments(dbId, messages, queries);
        const items = await enrichMessagesWithAttachments(
            databases,
            dbId,
            messageAttachments,
            mapMessageDocuments(
                (res as unknown as { documents?: unknown[] }).documents || [],
            ),
        );
        const last = items.at(-1);
        return {
            items,
            nextCursor:
                items.length === filters.limit && last ? last.$id : null,
        };
    } catch {
        return { items: [], nextCursor: null };
    }
}

type MappedMessage = {
    $id: string;
    attachments?: FileAttachment[];
    imageUrl?: string;
    removedAt?: string;
    text?: string;
    userId?: string;
    userName?: string;
    channelId?: string;
    serverId?: string;
    removedBy?: string;
};

/**
 * Handles coerce message.
 *
 * @param {unknown} raw - The raw value.
 * @returns {MappedMessage | null} The return value.
 */
function coerceMessage(raw: unknown): MappedMessage | null {
    if (typeof raw !== "object" || !raw || !("$id" in raw)) {
        return null;
    }
    const obj = raw as Record<string, unknown> & { $id: string };
    /**
     * Returns string field from message object.
     *
     * @param {string} k - The k value.
     * @returns {string | undefined} The return value.
     */
    const pick = (k: string) =>
        typeof (obj as Record<string, unknown>)[k] === "string"
            ? (obj as Record<string, string>)[k]
            : undefined;
    return {
        $id: String(obj.$id),
        imageUrl: pick("imageUrl"),
        removedAt: pick("removedAt"),
        text: pick("text"),
        userId: pick("userId"),
        userName: pick("userName"),
        channelId: pick("channelId"),
        serverId: pick("serverId"),
        removedBy: pick("removedBy"),
    };
}

/**
 * Handles map message documents.
 *
 * @param {unknown[]} rawList - The raw list value.
 * @returns {MappedMessage[]} The return value.
 */
function mapMessageDocuments(rawList: unknown[]) {
    const out: MappedMessage[] = [];
    for (const raw of rawList) {
        const coerced = coerceMessage(raw);
        if (coerced) {
            out.push(coerced);
        }
    }
    return out;
}

/**
 * Handles enrich messages with attachments.
 *
 * @param {Databases} databases - The databases value.
 * @param {string} databaseId - The database id value.
 * @param {string} attachmentsCollectionId - The attachments collection id value.
 * @param {MappedMessage[]} messages - The messages value.
 * @returns {Promise<MappedMessage[]>} The return value.
 */
async function enrichMessagesWithAttachments(
    databases: ReturnType<typeof getAdminClient>["databases"],
    databaseId: string,
    attachmentsCollectionId: string,
    messages: MappedMessage[],
) {
    if (!attachmentsCollectionId || messages.length === 0) {
        return messages;
    }

    try {
        const messageIds = messages.map((message) => message.$id);
        const response = await databases.listDocuments(
            databaseId,
            attachmentsCollectionId,
            [
                Query.equal("messageId", messageIds),
                Query.equal("messageType", "channel"),
                Query.limit(1000),
            ],
        );

        const attachmentsByMessageId = new Map<string, FileAttachment[]>();

        for (const raw of response.documents) {
            const attachmentDoc = raw as Record<string, unknown>;
            const messageId = String(attachmentDoc.messageId ?? "");

            if (!messageId) {
                continue;
            }

            const attachment: FileAttachment = {
                fileId: String(attachmentDoc.fileId ?? ""),
                fileName: String(attachmentDoc.fileName ?? ""),
                fileSize: Number(attachmentDoc.fileSize ?? 0),
                fileType: String(attachmentDoc.fileType ?? ""),
                fileUrl: String(attachmentDoc.fileUrl ?? ""),
                thumbnailUrl:
                    typeof attachmentDoc.thumbnailUrl === "string"
                        ? attachmentDoc.thumbnailUrl
                        : undefined,
            };

            const existingAttachments =
                attachmentsByMessageId.get(messageId) ?? [];
            existingAttachments.push(attachment);
            attachmentsByMessageId.set(messageId, existingAttachments);
        }

        return messages.map((message) => {
            const attachments = attachmentsByMessageId.get(message.$id);
            if (!attachments || attachments.length === 0) {
                return message;
            }

            return { ...message, attachments };
        });
    } catch {
        return messages;
    }
}

/**
 * Returns admin message audit context.
 *
 * @param {string} messageId - The message id value.
 * @returns {Promise<MappedMessage | null>} The return value.
 */
export async function getAdminMessageAuditContext(messageId: string) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { messages } = getCollectionIds();

    try {
        const raw = await databases.getDocument(dbId, messages, messageId);
        return coerceMessage(raw);
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

// Basic stats aggregation using listDocuments with minimal queries.
/**
 * Returns basic stats.
 * @returns {Promise<{ servers: number; channels: number; messages: number; }>} The return value.
 */
export async function getBasicStats() {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const collectionIds = getCollectionIds();
    // We only need counts; use small limit to reduce payload and rely on total.
    /**
     * Handles count.
     *
     * @param {string} col - The col value.
     * @returns {Promise<number>} The return value.
     */
    async function count(col: string) {
        try {
            const res = await databases.listDocuments(dbId, col, [
                Query.limit(1),
            ]); // should return total
            return (res as unknown as { total?: number }).total ?? 0;
        } catch {
            return 0;
        }
    }
    const [serverCount, channelCount, messageCount] = await Promise.all([
        count(collectionIds.servers),
        count(collectionIds.channels),
        count(collectionIds.messages),
    ]);
    return {
        servers: serverCount,
        channels: channelCount,
        messages: messageCount,
    };
}

// Query builder utilities referenced by tests.
type MessageQueryOpts = {
    cursorAfter?: string;
    userId?: string;
    channelId?: string;
    channelIds?: string[];
    serverId?: string;
    onlyMissingServerId?: boolean;
    text?: string;
    onlyRemoved?: boolean;
    includeRemoved?: boolean;
};

/**
 * Builds message queries.
 *
 * @param {{ cursorAfter?: string | undefined; userId?: string | undefined; channelId?: string | undefined; channelIds?: string[] | undefined; serverId?: string | undefined; onlyMissingServerId?: boolean | undefined; text?: string | undefined; onlyRemoved?: boolean | undefined; includeRemoved?: boolean | undefined; }} opts - The opts value.
 * @param {number} limit - The limit value.
 * @returns {string[]} The return value.
 */
export function buildMessageQueries(opts: MessageQueryOpts, limit: number) {
    const queries: string[] = [];
    queries.push(Query.limit(limit));
    queries.push(Query.orderDesc("$createdAt"));
    if (opts.cursorAfter) {
        queries.push(Query.cursorAfter(opts.cursorAfter));
    }
    if (opts.userId) {
        queries.push(Query.equal("userId", opts.userId));
    }
    if (opts.channelId) {
        queries.push(Query.equal("channelId", opts.channelId));
    }
    if (opts.channelIds?.length) {
        // multi-channel filter - use Query.equal with array for OR condition
        queries.push(Query.equal("channelId", opts.channelIds));
    }
    if (opts.serverId) {
        queries.push(Query.equal("serverId", opts.serverId));
    }
    if (opts.onlyMissingServerId) {
        queries.push(Query.isNull("serverId"));
    }
    if (opts.text) {
        queries.push(Query.search("text", opts.text));
    }
    if (opts.onlyRemoved) {
        queries.push(Query.isNotNull("removedAt"));
    } else if (!opts.includeRemoved) {
        queries.push(Query.isNull("removedAt"));
    }
    return queries;
}

export function postFilterMessages<
    T extends { text?: string; removedAt?: string | null },
>(
    items: T[],
    opts: { text?: string; onlyRemoved?: boolean; includeRemoved?: boolean },
) {
    return items.filter((m) => {
        if (opts.onlyRemoved && !m.removedAt) {
            return false;
        }
        const excludeRemoved = !(opts.includeRemoved || opts.onlyRemoved);
        if (excludeRemoved && m.removedAt) {
            return false;
        }
        if (opts.text) {
            const needle = opts.text.toLowerCase();
            const hay = (m.text || "").toLowerCase();
            if (!hay.includes(needle)) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Returns admin client.
 * @returns {{ databases: Databases; teams: Teams; storage: Storage; }} The return value.
 */
export function getAdminClient() {
    const { databases, teams, storage } = getServerClient();
    return { databases, teams, storage };
}

// Admin moderation functions that bypass document permissions
/**
 * Handles admin soft delete message.
 *
 * @param {string} messageId - The message id value.
 * @param {string} moderatorId - The moderator id value.
 * @returns {Promise<void>} The return value.
 */
export async function adminSoftDeleteMessage(
    messageId: string,
    moderatorId: string,
) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { messages } = getCollectionIds();
    const removedAt = new Date().toISOString();
    await databases.updateDocument(dbId, messages, messageId, {
        removedAt,
        removedBy: moderatorId,
    });
}

/**
 * Handles admin restore message.
 *
 * @param {string} messageId - The message id value.
 * @returns {Promise<void>} The return value.
 */
export async function adminRestoreMessage(messageId: string) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { messages } = getCollectionIds();
    await databases.updateDocument(dbId, messages, messageId, {
        removedAt: null,
        removedBy: null,
    });
}

/**
 * Handles admin delete message.
 *
 * @param {string} messageId - The message id value.
 * @returns {Promise<void>} The return value.
 */
export async function adminDeleteMessage(messageId: string) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { messages } = getCollectionIds();

    try {
        await databases.deleteDocument(dbId, messages, messageId);
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return;
        }

        throw error;
    }
}
