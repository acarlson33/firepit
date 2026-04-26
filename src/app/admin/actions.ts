"use server";
import { createHash } from "node:crypto";
import { Query, type Models } from "node-appwrite";

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
import {
    createAnnouncement,
    dispatchAnnouncementById,
    dispatchScheduledAnnouncements,
    listAnnouncements,
    ClientError,
} from "@/lib/appwrite-announcements";
import type {
    Announcement,
    AnnouncementCreateMode,
    AnnouncementPriority,
    AnnouncementStatus,
    FeatureFlag,
} from "@/lib/types";

// Server actions run on the server; use server-side env variables first.
const ids = getAppwriteIds();
const databaseId = ids.databaseId;
const messagesCollection = ids.messages;
const channelsCollection = ids.channels;
const DEFAULT_DISPATCH_LIMIT = 25;
const MAX_DISPATCH_LIMIT = 100;

export type BackfillResult = {
    updated: number;
    scanned: number;
    hasMore: boolean;
    skipped: number;
};

type AppwriteDoc = Models.Document & Record<string, unknown>;
type MessageDoc = AppwriteDoc & {
    channelId?: string;
    serverId?: string | null;
};
type ChannelDoc = AppwriteDoc & {
    serverId?: string;
};

function validateAnnouncementDispatchLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
        throw new Error("Dispatch limit must be a finite number");
    }

    if (!Number.isInteger(limit)) {
        throw new Error("Dispatch limit must be an integer");
    }

    if (limit < 1 || limit > MAX_DISPATCH_LIMIT) {
        throw new Error(
            `Dispatch limit must be between 1 and ${String(MAX_DISPATCH_LIMIT)}`,
        );
    }

    return limit;
}

function normalizeListLimit(limit: number | undefined): number | undefined {
    if (limit === undefined) return undefined;
    if (!Number.isFinite(limit)) return undefined;
    if (!Number.isInteger(limit)) return undefined;
    if (limit < 1 || limit > MAX_DISPATCH_LIMIT) return undefined;
    return limit;
}

// Smaller helpers to keep complexity below threshold
async function listMessagesNeedingServerId(limit: number) {
    const { databases } = getAdminClient();
    try {
        const res = await databases.listDocuments<MessageDoc>(
            databaseId,
            messagesCollection,
            [
                Query.limit(limit),
                Query.isNull("serverId"),
                Query.orderAsc("$createdAt"),
            ],
        );
        return res.documents || [];
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
        const res = await databases.listDocuments<ChannelDoc>(
            databaseId,
            channelsCollection,
            [Query.equal("$id", channelIds), Query.limit(channelIds.length)],
        );

        function extractValidString(
            row: Record<string, unknown>,
            key: "$id" | "serverId",
        ): string | null {
            const value = row[key];
            if (typeof value === "string") {
                const trimmed = value.trim();
                return trimmed || null;
            }

            return null;
        }

        const list = res.documents || [];
        for (const raw of list) {
            if (!raw || typeof raw !== "object") {
                logger.error("Discarding malformed channel row", {
                    reason: "row is not an object",
                    raw,
                });
                continue;
            }

            const c = raw as Record<string, unknown>;
            const channelId = extractValidString(c, "$id");
            const serverId = extractValidString(c, "serverId");

            if (!channelId || !serverId) {
                logger.error("Discarding malformed channel row", {
                    reason: "missing valid $id or serverId",
                    raw,
                });
                continue;
            }

            map[channelId] = serverId;
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
    docs: MessageDoc[],
    channelMap: Record<string, string>,
) {
    const { databases } = getAdminClient();
    const updates: Array<{
        channelId: string;
        messageId: string;
        serverId: string;
    }> = [];

    for (const d of docs) {
        const channelId = d.channelId;
        if (typeof channelId !== "string") {
            continue;
        }
        const serverId = channelMap[channelId];
        if (!serverId) {
            continue;
        }

        const messageId = d.$id;
        updates.push({
            channelId,
            messageId,
            serverId,
        });
    }

    const batchSize = 25;
    let updated = 0;

    for (let start = 0; start < updates.length; start += batchSize) {
        const batch = updates.slice(start, start + batchSize);
        const results = await Promise.allSettled(
            batch.map((update) =>
                databases.updateDocument<MessageDoc>(
                    databaseId,
                    messagesCollection,
                    update.messageId,
                    { serverId: update.serverId },
                ),
            ),
        );

        for (const [index, result] of results.entries()) {
            if (result.status === "fulfilled") {
                updated += 1;
                continue;
            }

            const context = batch.at(index);
            logger.error("Failed to backfill message serverId", {
                messageId: context?.messageId,
                channelId: context?.channelId,
                serverId: context?.serverId,
                error:
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
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
        new Set(
            docs
                .map((d) => d.channelId)
                .filter(
                    (channelId): channelId is string =>
                        typeof channelId === "string",
                ),
        ),
    );
    const channelMap = await buildChannelServerMap(channelIds);
    const updated = await updateMessageServerIds(docs, channelMap);
    const hasMore = docs.length === limit;
    const skipped = Math.max(0, docs.length - updated);
    recordMetric("admin.backfill_server_ids.count", updated);
    recordTiming("admin.backfill_server_ids.ms", start, { updated });
    return { updated, scanned: docs.length, hasMore, skipped };
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
        if (!rawFlag || typeof rawFlag !== "object") {
            logger.error("Discarding malformed feature flag row", {
                rawFlag,
            });
            continue;
        }

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
): Promise<{ success: true }> {
    try {
        const roles = await getUserRoles(userId);
        if (!roles.isAdmin) {
            throw new Error("Forbidden");
        }

        const success = await setFeatureFlag(key, enabled, userId);

        if (success) {
            recordMetric("admin.feature_flag.updated", 1, { key, enabled });
            return { success: true };
        }

        throw new Error("Failed to update feature flag");
    } catch (error) {
        if (error instanceof Error && error.message === "Forbidden") {
            throw error;
        }

        const userIdHash = createHash("sha256")
            .update(userId)
            .digest("hex")
            .slice(0, 16);

        logger.error("Failed to update feature flag", {
            enabled,
            error: error instanceof Error ? error.message : String(error),
            key,
            userIdHash,
        });
        throw new Error("Failed to update feature flag");
    }
}

type ListAnnouncementsActionInput = {
    cursorAfter?: string;
    limit?: number;
    statuses?: AnnouncementStatus[];
};

export async function getAnnouncementsAction(
    userId: string,
    input: ListAnnouncementsActionInput = {},
): Promise<{ items: Announcement[]; nextCursor?: string }> {
    const roles = await getUserRoles(userId);
    if (!roles.isAdmin) {
        throw new Error("Forbidden");
    }

    const validatedLimit = normalizeListLimit(input.limit);

    return listAnnouncements({
        cursorAfter: input.cursorAfter,
        limit: validatedLimit,
        statuses: input.statuses,
    });
}

type CreateAnnouncementActionInput = {
    body: string;
    idempotencyKey?: string;
    mode?: AnnouncementCreateMode;
    priority?: AnnouncementPriority;
    scheduledFor?: string;
    title?: string;
};

export async function createAnnouncementAction(
    userId: string,
    input: CreateAnnouncementActionInput,
): Promise<{
    announcement?: Announcement;
    dispatched?: { announcementIds: string[]; dueCount: number };
    dispatchError?: string;
    error?: string;
}> {
    const roles = await getUserRoles(userId);
    if (!roles.isAdmin) {
        throw new Error("Forbidden");
    }

    let announcement: Announcement | undefined;
    try {
        announcement = await createAnnouncement({
            actorId: userId,
            body: input.body,
            idempotencyKey: input.idempotencyKey,
            mode: input.mode,
            priority: input.priority,
            scheduledFor: input.scheduledFor,
            title: input.title,
        });
    } catch (error) {
        if (error instanceof ClientError) {
            return { error: error.message };
        }

        throw error;
    }

    if (input.mode !== "send_now") {
        return { announcement };
    }

    try {
        const immediateDispatch = await dispatchAnnouncementById(
            announcement.$id,
        );
        const dispatched = immediateDispatch.dispatched
            ? { announcementIds: [announcement.$id], dueCount: 1 }
            : await dispatchScheduledAnnouncements(DEFAULT_DISPATCH_LIMIT);
        return { announcement, dispatched };
    } catch (error) {
        logger.error("Dispatch after send_now announcement creation failed", {
            announcementId: announcement?.$id,
            error: error instanceof Error ? error.message : String(error),
        });

        return {
            announcement,
            dispatchError:
                error instanceof Error
                    ? error.message
                    : "Failed to dispatch scheduled announcements",
        };
    }
}

export async function dispatchAnnouncementsAction(
    userId: string,
    limit = DEFAULT_DISPATCH_LIMIT,
): Promise<{ announcementIds: string[]; dueCount: number }> {
    const roles = await getUserRoles(userId);
    if (!roles.isAdmin) {
        throw new Error("Forbidden");
    }

    const validatedLimit = validateAnnouncementDispatchLimit(limit);
    return dispatchScheduledAnnouncements(validatedLimit);
}
