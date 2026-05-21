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
 * Handles find existing mention inbox item.
 *
 * @param {{ contextId: string; contextKind: 'channel' | 'conversation'; messageId: string; userId: string; }} params - The params value.
 * @returns {Promise<Record<string, unknown> | undefined>} The return value.
 */
async function findExistingMentionInboxItem(params: {
    contextId: string;
    contextKind: "channel" | "conversation";
    messageId: string;
    userId: string;
}) {
    const env = getEnvConfig();
    const { databases } = getAdminClient();
    const existing = await databases.listDocuments(
        env.databaseId,
        env.collections.inboxItems,
        [
            Query.equal("userId", params.userId),
            Query.equal("kind", "mention"),
            Query.equal("contextKind", params.contextKind),
            Query.equal("contextId", params.contextId),
            Query.equal("messageId", params.messageId),
            Query.limit(1),
        ],
    );

    return existing.documents.at(0) as Record<string, unknown> | undefined;
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

                const existing = await findExistingMentionInboxItem({
                    contextId: params.contextId,
                    contextKind: params.contextKind,
                    messageId: params.messageId,
                    userId: targetUserId,
                });

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
