import { Query, Storage } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import type { FileAttachment } from "./types";

function getCollectionIds() {
    const { collections } = getEnvConfig();
    return {
        servers: collections.servers,
        channels: collections.channels,
        messages: collections.messages,
        messageAttachments: collections.messageAttachments,
    };
}

function isDocumentNotFoundError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    const candidate = error as Error & {
        code?: number;
        type?: string;
        response?: string;
    };

    if (candidate.code === 404 || candidate.type === "document_not_found") {
        return true;
    }

    return candidate.message.includes("document_not_found");
}

type PageResult<T> = { items: T[]; nextCursor?: string | null };

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

export type GlobalMessageFilters = {
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

function coerceMessage(raw: unknown): MappedMessage | null {
    if (typeof raw !== "object" || !raw || !("$id" in raw)) {
        return null;
    }
    const obj = raw as Record<string, unknown> & { $id: string };
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
export async function getBasicStats() {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const collectionIds = getCollectionIds();
    // We only need counts; use small limit to reduce payload and rely on total.
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
export type MessageQueryOpts = {
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

export function getAdminClient() {
    const { client, databases, teams } = getServerClient();
    const storage = new Storage(client);
    return { databases, teams, storage };
}

// Admin moderation functions that bypass document permissions
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

export async function adminRestoreMessage(messageId: string) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const { messages } = getCollectionIds();
    await databases.updateDocument(dbId, messages, messageId, {
        removedAt: null,
        removedBy: null,
    });
}

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
