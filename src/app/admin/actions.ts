"use server";
import { Query } from "node-appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getAppwriteIds } from "@/lib/appwrite-config";
import { getUserRoles } from "@/lib/appwrite-roles";
import { recordMetric, recordTiming } from "@/lib/monitoring";
import { logger } from "@/lib/newrelic-utils";
import {
    getAllFeatureFlags,
    setFeatureFlag,
    type FeatureFlagKey,
} from "@/lib/feature-flags";
import type { FeatureFlag } from "@/lib/types";

// Server actions run on the server; use server-side env variables first.
const ids = getAppwriteIds();
const databaseId = ids.databaseId;
const messagesCollection = ids.messages;
const channelsCollection = ids.channels;

export type BackfillResult = {
    updated: number;
    scanned: number;
    hasMore: boolean;
    remaining: number;
};

// Smaller helpers to keep complexity below threshold
async function listMessagesNeedingServerId(limit: number) {
    const { databases } = getAdminClient();
    try {
        const res = await databases.listDocuments(
            databaseId,
            messagesCollection,
            [
                Query.limit(limit),
                Query.isNull("serverId"),
                Query.orderAsc("$createdAt"),
            ],
        );
        return (
            ((res as unknown as { documents?: unknown[] }).documents as
                | Record<string, unknown>[]
                | undefined) || []
        );
    } catch (error) {
        logger.error("Failed to list messages needing serverId", {
            error,
            limit,
        });
        throw error;
    }
}

async function buildChannelServerMap(
    channelIds: string[],
): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    if (!channelIds.length) {
        return map;
    }
    try {
        const { databases } = getAdminClient();
        const res = await databases.listDocuments(
            databaseId,
            channelsCollection,
            [Query.equal("$id", channelIds), Query.limit(channelIds.length)],
        );
        const list =
            (res as unknown as { documents?: unknown[] }).documents || [];
        for (const raw of list) {
            const c = raw as Record<string, unknown>;
            if (c.$id && c.serverId) {
                map[String(c.$id)] = String(c.serverId);
            }
        }
    } catch (error) {
        logger.error("Failed to build channel-to-server map", {
            channelCount: channelIds.length,
            error,
        });
        throw error;
    }
    return map;
}

async function updateMessageServerIds(
    docs: Record<string, unknown>[],
    channelMap: Record<string, string>,
) {
    let updated = 0;
    for (const d of docs) {
        const channelId = d.channelId as string | undefined;
        if (!channelId) {
            continue;
        }
        const serverId = channelMap[channelId];
        if (!serverId) {
            continue;
        }
        try {
            const { databases } = getAdminClient();
            await databases.updateDocument(
                databaseId,
                messagesCollection,
                String(d.$id),
                { serverId },
            );
            updated += 1;
        } catch (err) {
            logger.error("Failed to backfill message serverId", {
                messageId: String(d.$id),
                channelId,
                serverId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return updated;
}

export async function backfillServerIds(
    userId: string,
): Promise<BackfillResult> {
    const start = Date.now();
    const roles = await getUserRoles(userId);
    if (!roles.isAdmin) {
        throw new Error("Forbidden");
    }
    const limit = 100;
    const docs = await listMessagesNeedingServerId(limit);
    const channelIds = Array.from(
        new Set(docs.map((d) => d.channelId).filter(Boolean)),
    ) as string[];
    const channelMap = await buildChannelServerMap(channelIds);
    const updated = await updateMessageServerIds(docs, channelMap);
    const hasMore = docs.length === limit;
    const remaining = Math.max(0, docs.length - updated);
    recordMetric("admin.backfill_server_ids.count", updated);
    recordTiming("admin.backfill_server_ids.ms", start, { updated });
    return { updated, scanned: docs.length, hasMore, remaining };
}

/**
 * Get all feature flags (admin only)
 */
export async function getFeatureFlagsAction(
    userId: string,
): Promise<FeatureFlag[]> {
    const roles = await getUserRoles(userId);
    if (!roles.isAdmin) {
        throw new Error("Forbidden");
    }

    const flags = await getAllFeatureFlags();
    const validatedFlags: FeatureFlag[] = [];

    for (const rawFlag of flags) {
        const flag = rawFlag as Record<string, unknown>;
        if (
            typeof flag.$id !== "string" ||
            typeof flag.key !== "string" ||
            typeof flag.enabled !== "boolean"
        ) {
            logger.error("Discarding malformed feature flag row", {
                rawFlag,
            });
            continue;
        }

        const normalizedFlag: FeatureFlag = {
            $id: flag.$id,
            key: flag.key,
            enabled: flag.enabled,
        };

        if (typeof flag.description === "string") {
            normalizedFlag.description = flag.description;
        }

        if (typeof flag.updatedAt === "string") {
            normalizedFlag.updatedAt = flag.updatedAt;
        }

        if (typeof flag.updatedBy === "string") {
            normalizedFlag.updatedBy = flag.updatedBy;
        }

        validatedFlags.push(normalizedFlag);
    }

    return validatedFlags;
}

/**
 * Update a feature flag (admin only)
 */
export async function updateFeatureFlagAction(
    userId: string,
    key: FeatureFlagKey,
    enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
    const roles = await getUserRoles(userId);
    if (!roles.isAdmin) {
        return { success: false, error: "Forbidden" };
    }

    const success = await setFeatureFlag(key, enabled, userId);

    if (success) {
        recordMetric("admin.feature_flag.updated", 1, { key, enabled });
    }

    return {
        success,
        error: success ? undefined : "Failed to update feature flag",
    };
}
