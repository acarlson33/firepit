import { ID, Query } from "node-appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { resolveProfileIdentifiers } from "@/lib/appwrite-profiles";

type MentionInboxItemInput = {
    authorUserId: string;
    contextId: string;
    contextKind: "channel" | "conversation";
    latestActivityAt: string;
    mentions: string[];
    messageId: string;
    parentMessageId?: string;
    previewText: string;
    serverId?: string;
};

/**
 * Handles resolve mention target ids.
 *
 * @param {{ authorUserId: string; mentions: string[]; }} params - The params value.
 * @returns {Promise<string[]>} The return value.
 */
async function resolveMentionTargetIds(params: {
    authorUserId: string;
    mentions: string[];
}) {
    const resolvedIdentifiers = await resolveProfileIdentifiers(
        params.mentions,
    );

    return Array.from(
        new Set(
            params.mentions
                .map((mention) => resolvedIdentifiers.get(mention.trim()))
                .filter(
                    (userId): userId is string =>
                        Boolean(userId) && userId !== params.authorUserId,
                ),
        ),
    );
}

/**
 * Batch-fetch existing inbox items for a given messageId and set of userIds.
 * Single query instead of N individual queries.
 */
async function findExistingInboxItemsBatch(params: {
    contextId: string;
    contextKind: "channel" | "conversation";
    kind: "mention" | "message";
    messageId: string;
    userIds: string[];
}): Promise<Map<string, Record<string, unknown>>> {
    if (params.userIds.length === 0) {
        return new Map();
    }

    const env = getEnvConfig();
    const { databases } = getAdminClient();
    const result = new Map<string, Record<string, unknown>>();

    const BATCH_LIMIT = 100;
    let offset = 0;
    while (offset < params.userIds.length) {
        const batch = params.userIds.slice(offset, offset + BATCH_LIMIT);
        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.inboxItems,
            [
                Query.equal("userId", batch),
                Query.equal("kind", params.kind),
                Query.equal("contextKind", params.contextKind),
                Query.equal("contextId", params.contextId),
                Query.equal("messageId", params.messageId),
            ],
        );

        for (const doc of existing.documents) {
            const record = doc as Record<string, unknown>;
            const uid = String(record.userId);
            result.set(uid, record);
        }

        offset += BATCH_LIMIT;
    }

    return result;
}

/**
 * Handles upsert mention inbox items.
 *
 * @param {{ authorUserId: string; contextId: string; contextKind: 'channel' | 'conversation'; latestActivityAt: string; mentions: string[]; messageId: string; parentMessageId?: string | undefined; previewText: string; serverId?: string | undefined; }} params - The params value.
 * @returns {Promise<void>} The return value.
 */
export async function upsertMentionInboxItems(
    params: MentionInboxItemInput,
): Promise<void> {
    const targetUserIds = await resolveMentionTargetIds({
        authorUserId: params.authorUserId,
        mentions: params.mentions,
    });

    if (targetUserIds.length === 0) {
        return;
    }

    try {
        const env = getEnvConfig();
        const { databases } = getAdminClient();

        const existingMap = await findExistingInboxItemsBatch({
            contextId: params.contextId,
            contextKind: params.contextKind,
            kind: "mention",
            messageId: params.messageId,
            userIds: targetUserIds,
        });

        await Promise.all(
            targetUserIds.map(async (targetUserId) => {
                const payload = {
                    authorUserId: params.authorUserId,
                    contextId: params.contextId,
                    contextKind: params.contextKind,
                    kind: "mention",
                    latestActivityAt: params.latestActivityAt,
                    messageId: params.messageId,
                    parentMessageId: params.parentMessageId ?? null,
                    previewText: params.previewText,
                    readAt: null,
                    serverId: params.serverId ?? null,
                    userId: targetUserId,
                };

                const existing = existingMap.get(targetUserId);

                if (existing) {
                    await databases.updateDocument(
                        env.databaseId,
                        env.collections.inboxItems,
                        String(existing.$id),
                        payload,
                    );
                    return;
                }

                await databases.createDocument(
                    env.databaseId,
                    env.collections.inboxItems,
                    ID.unique(),
                    payload,
                    perms.serverOwner(targetUserId),
                );
            }),
        );
    } catch {
        // Degrade silently until the inbox_items collection is deployed everywhere.
    }
}

type MessageInboxItemInput = {
    authorUserId: string;
    contextId: string;
    contextKind: "channel" | "conversation";
    latestActivityAt: string;
    messageId: string;
    participantUserIds: string[];
    previewText: string;
    serverId?: string;
};

export async function upsertMessageInboxItems(
    params: MessageInboxItemInput,
): Promise<void> {
    const targetUserIds = Array.from(
        new Set(
            params.participantUserIds.filter(
                (userId) => userId !== params.authorUserId,
            ),
        ),
    );

    if (targetUserIds.length === 0) {
        return;
    }

    try {
        const env = getEnvConfig();
        const { databases } = getAdminClient();

        const existingMap = await findExistingInboxItemsBatch({
            contextId: params.contextId,
            contextKind: params.contextKind,
            kind: "message",
            messageId: params.messageId,
            userIds: targetUserIds,
        });

        await Promise.all(
            targetUserIds.map(async (targetUserId) => {
                const payload = {
                    authorUserId: params.authorUserId,
                    contextId: params.contextId,
                    contextKind: params.contextKind,
                    kind: "message",
                    latestActivityAt: params.latestActivityAt,
                    messageId: params.messageId,
                    parentMessageId: null,
                    previewText: params.previewText,
                    readAt: null,
                    serverId: params.serverId ?? null,
                    userId: targetUserId,
                };

                const existing = existingMap.get(targetUserId);

                if (existing) {
                    await databases.updateDocument(
                        env.databaseId,
                        env.collections.inboxItems,
                        String(existing.$id),
                        payload,
                    );
                    return;
                }

                await databases.createDocument(
                    env.databaseId,
                    env.collections.inboxItems,
                    ID.unique(),
                    payload,
                    perms.serverOwner(targetUserId),
                );
            }),
        );
    } catch {
        // Degrade silently until the inbox_items collection is deployed everywhere.
    }
}
