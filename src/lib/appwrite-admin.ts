import { Query, Storage } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";

// Collection IDs (align with provisioning script / schema)
const SERVERS_COLLECTION = "servers";
const CHANNELS_COLLECTION = "channels";
const MESSAGES_COLLECTION = "messages";

type PageResult<T> = { items: T[]; nextCursor?: string | null };

export async function listAllServersPage(
    limit: number,
    cursor?: string,
): Promise<PageResult<{ $id: string; name?: string }>> {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const queries: string[] = [
        Query.limit(limit),
        Query.orderAsc("$createdAt"),
    ];
    if (cursor) {
        queries.push(Query.cursorAfter(cursor));
    }
    try {
        const res = await databases.listDocuments(
            dbId,
            SERVERS_COLLECTION,
            queries,
        );
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
    const queries: string[] = [
        Query.limit(limit),
        Query.orderDesc("$createdAt"),
        Query.equal("serverId", serverId),
    ];
    if (cursor) {
        queries.push(Query.cursorAfter(cursor));
    }
    try {
        const res = await databases.listDocuments(
            dbId,
            CHANNELS_COLLECTION,
            queries,
        );
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
        removedAt?: string;
        text?: string;
        userId?: string;
        channelId?: string;
        serverId?: string;
        removedBy?: string;
    }>
> {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    const queries = buildMessageQueries(filters, filters.limit);
    try {
        const res = await databases.listDocuments(
            dbId,
            MESSAGES_COLLECTION,
            queries,
        );
        const items = mapMessageDocuments(
            (res as unknown as { documents?: unknown[] }).documents || [],
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
    removedAt?: string;
    text?: string;
    userId?: string;
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
        removedAt: pick("removedAt"),
        text: pick("text"),
        userId: pick("userId"),
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

// Basic stats aggregation using listDocuments with minimal queries.
export async function getBasicStats() {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
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
    const [servers, channels, messages] = await Promise.all([
        count(SERVERS_COLLECTION),
        count(CHANNELS_COLLECTION),
        count(MESSAGES_COLLECTION),
    ]);
    return { servers, channels, messages };
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
    const removedAt = new Date().toISOString();
    await databases.updateDocument(dbId, MESSAGES_COLLECTION, messageId, {
        removedAt,
        removedBy: moderatorId,
    });
}

export async function adminRestoreMessage(messageId: string) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    await databases.updateDocument(dbId, MESSAGES_COLLECTION, messageId, {
        removedAt: null,
        removedBy: null,
    });
}

export async function adminDeleteMessage(messageId: string) {
    const { databases } = getAdminClient();
    const dbId = getEnvConfig().databaseId;
    await databases.deleteDocument(dbId, MESSAGES_COLLECTION, messageId);
}
