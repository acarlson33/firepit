import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-server";
import { Query } from "node-appwrite";
import { logger } from "@/lib/newrelic-utils";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "";
const AUDIT_COLLECTION_ID = process.env.APPWRITE_AUDIT_COLLECTION_ID ?? "";
const PROFILES_COLLECTION_ID =
    process.env.APPWRITE_PROFILES_COLLECTION_ID ?? "";

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

function getString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getMeta(log: AuditLogDocument) {
    return (log.meta || log.metadata || {}) as Record<string, unknown>;
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

export async function GET(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const { serverId } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
        const { databases } = getServerClient();
        const env = getEnvConfig();

        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageServer) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (!AUDIT_COLLECTION_ID) {
            return NextResponse.json(
                { error: "Audit logging not configured" },
                { status: 500 },
            );
        }

        // Fetch audit logs for this server.
        // Prefer the denormalized top-level serverId, but fall back to recent
        // legacy documents that only stored serverId inside metadata.
        const auditLogs = await databases.listDocuments(
            DATABASE_ID,
            AUDIT_COLLECTION_ID,
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
                DATABASE_ID,
                AUDIT_COLLECTION_ID,
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
        if (userIds.size > 0 && PROFILES_COLLECTION_ID) {
            const profilesResult = await databases.listDocuments(
                DATABASE_ID,
                PROFILES_COLLECTION_ID,
                [Query.equal("userId", Array.from(userIds))],
            );

            for (const profile of profilesResult.documents) {
                profiles.set(profile.userId, {
                    displayName: profile.displayName,
                    userName: profile.userName,
                    avatarUrl: profile.avatarUrl,
                });
            }
        }

        const enrichedLogs = auditDocuments.map((log) => {
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

        return NextResponse.json(enrichedLogs);
    } catch (error) {
        logger.error("Error fetching audit logs", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch audit logs" },
            { status: 500 },
        );
    }
}
