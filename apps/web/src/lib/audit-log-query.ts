import { Query } from "node-appwrite";
import { chunkValues } from "@/lib/appwrite-pagination";

type DatabasesLike = {
    listDocuments(
        databaseId: string,
        collectionId: string,
        queries?: string[],
    ): Promise<{ documents: Array<Record<string, unknown>> }>;
};

export type EnrichedAuditLog = {
    $id: string;
    action: string;
    moderatorId?: string;
    moderatorName?: string;
    targetUserId?: string;
    targetUserName?: string;
    reason?: string;
    timestamp?: string;
    details?: string;
};

type AuditLogDocument = {
    $id: string;
    $createdAt?: string;
    action?: string;
    operation?: string;
    actorId?: string;
    targetId?: string;
    userId?: string;
    targetUserId?: string;
    serverId?: string;
    reason?: string;
    details?: string;
    metadata?: Record<string, unknown>;
    meta?: Record<string, unknown>;
};

const QUERY_ARRAY_LIMIT = 100;

function getString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getMeta(log: AuditLogDocument) {
    const raw = log.meta || log.metadata;
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return {};
        }
    }

    return (raw || {}) as Record<string, unknown>;
}

function getLegacyServerId(log: AuditLogDocument) {
    return getString(getMeta(log).serverId);
}

function getModeratorId(log: AuditLogDocument) {
    return getString(log.userId) || getString(log.actorId);
}

function getTargetUserId(log: AuditLogDocument) {
    const topLevelTarget = getString(log.targetUserId);
    if (topLevelTarget) {
        return topLevelTarget;
    }

    const metaTarget = getString(getMeta(log).targetUserId);
    if (metaTarget) {
        return metaTarget;
    }

    if (getString(log.serverId) || getLegacyServerId(log)) {
        return getString(log.targetId);
    }

    return undefined;
}

export async function fetchAuditLogs(params: {
    databases: DatabasesLike;
    databaseId: string;
    auditCollectionId: string;
    profilesCollectionId: string;
    serverId: string;
    limit: number;
}): Promise<EnrichedAuditLog[]> {
    const {
        databases,
        databaseId,
        auditCollectionId,
        profilesCollectionId,
        serverId,
        limit,
    } = params;

    // Prefer the denormalized top-level serverId, but fall back to recent
    // legacy documents that only stored serverId inside metadata.
    const auditLogs = await databases.listDocuments(
        databaseId,
        auditCollectionId,
        [
            Query.equal("serverId", serverId),
            Query.orderDesc("$createdAt"),
            Query.limit(limit),
        ],
    );

    let auditDocuments = auditLogs.documents as AuditLogDocument[];
    if (auditDocuments.length === 0) {
        const legacyWindow = Math.min(Math.max(limit * 10, 200), 1000);
        const legacyLogs = await databases.listDocuments(
            databaseId,
            auditCollectionId,
            [Query.orderDesc("$createdAt"), Query.limit(legacyWindow)],
        );

        auditDocuments = (legacyLogs.documents as AuditLogDocument[])
            .filter((log) => getLegacyServerId(log) === serverId)
            .slice(0, limit);
    }

    // Enrich with profile data
    const userIds = new Set<string>();
    for (const log of auditDocuments) {
        const moderatorId = getModeratorId(log);
        if (moderatorId) {
            userIds.add(moderatorId);
        }

        const targetUserId = getTargetUserId(log);
        if (targetUserId) {
            userIds.add(targetUserId);
        }
    }

    const profiles = new Map<
        string,
        {
            displayName?: string;
            userName?: string;
            avatarUrl?: string;
        }
    >();
    if (userIds.size > 0) {
        const profileChunks = chunkValues(
            Array.from(userIds),
            QUERY_ARRAY_LIMIT,
        );
        const profileResults = await Promise.all(
            profileChunks.map((userIdChunk) =>
                databases.listDocuments(
                    databaseId,
                    profilesCollectionId,
                    [Query.equal("userId", userIdChunk)],
                ),
            ),
        );

        for (const result of profileResults) {
            for (const profile of result.documents) {
                profiles.set(getString(profile.userId) || "", {
                    displayName: getString(profile.displayName),
                    userName: getString(profile.userName),
                    avatarUrl: getString(profile.avatarUrl),
                });
            }
        }
    }

    return auditDocuments.map((log) => {
        const meta = getMeta(log);
        const moderatorId = getModeratorId(log);
        const targetUserId = getTargetUserId(log);
        const moderatorProfile = moderatorId
            ? profiles.get(moderatorId)
            : null;
        const targetProfile = targetUserId
            ? profiles.get(targetUserId)
            : null;

        return {
            $id: log.$id,
            action: log.action || log.operation || "unknown",
            moderatorId,
            moderatorName:
                moderatorProfile?.displayName || moderatorProfile?.userName,
            targetUserId,
            targetUserName:
                targetProfile?.displayName || targetProfile?.userName,
            reason: getString(log.reason) || getString(meta.reason),
            timestamp: log.$createdAt,
            details: getString(log.details) || getString(meta.details),
        };
    });
}
