import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-server";
import { Query, ID } from "node-appwrite";
import { recordAudit } from "@/lib/appwrite-audit";
import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { logger,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import { getEnvConfig } from "@/lib/appwrite-core";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { listPages } from "@/lib/appwrite-pagination";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const envConfig = getEnvConfig();
const DATABASE_ID = envConfig.databaseId;
const SERVERS_COLLECTION_ID = envConfig.collections.servers;
const MEMBERSHIPS_COLLECTION_ID = envConfig.collections.memberships;
const BANNED_USERS_COLLECTION_ID = envConfig.collections.bannedUsers;
const MUTED_USERS_COLLECTION_ID = envConfig.collections.mutedUsers;

const MAX_REASON_LENGTH = 500;

function normalizeReason(reason: unknown): string {
    if (typeof reason !== "string") {
        return "No reason provided";
    }
    const trimmed = reason.trim();
    return trimmed ? trimmed.slice(0, MAX_REASON_LENGTH) : "No reason provided";
}

async function removeAllForUser(
    databases: ReturnType<typeof getServerClient>["databases"],
    collectionId: string,
    serverId: string,
    userId: string,
): Promise<number> {
    const { documents } = await listPages({
        databases,
        databaseId: DATABASE_ID,
        collectionId,
        baseQueries: [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
        ],
        pageSize: 100,
        maxDocs: 1000,
        warningContext: `moderation-remove-${collectionId}`,
    });

    await Promise.all(
        documents.map((document) =>
            databases.deleteDocument(
                DATABASE_ID,
                collectionId,
                String(document.$id),
            ),
        ),
    );

    return documents.length;
}

function getAuditDetail(action: string) {
    switch (action) {
        case "ban":
            return "User banned from server";
        case "unban":
            return "User unbanned from server";
        case "mute":
            return "User muted in server";
        case "unmute":
            return "User unmuted in server";
        case "kick":
            return "User kicked from server";
        default:
            return `Moderation action: ${action}`;
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const { serverId } = await params;
        const body = await request.json();
        const { action, userId, reason } = body;

        if (!action || !userId) {
            return NextResponse.json(
                { error: "Missing required fields: action, userId" },
                { status: 400 },
            );
        }

        const { databases } = getServerClient();

        // Get current user (moderator)
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }
        const moderatorId = session.$id;

        // Verify server exists and moderator has permissions
        let server: Record<string, unknown>;
        try {
            server = (await databases.getDocument(
                DATABASE_ID,
                SERVERS_COLLECTION_ID,
                serverId,
            )) as unknown as Record<string, unknown>;
        } catch (error) {
            if (isDocumentNotFoundError(error)) {
                return NextResponse.json(
                    { error: "Server not found" },
                    { status: 404 },
                );
            }
            throw error;
        }

        // Check permissions: owner or global admin/moderator
        const isOwner = String(server.ownerId) === moderatorId;
        const serverAccess = await getServerPermissionsForUser(
            databases,
            envConfig,
            serverId,
            moderatorId,
        );
        const hasServerModerationPermission =
            serverAccess.isServerOwner ||
            serverAccess.permissions.administrator ||
            serverAccess.permissions.manageServer;
        const globalRoles = await getUserRoles(moderatorId);
        const isGlobalModerator =
            globalRoles.isAdmin || globalRoles.isModerator;

        // For v1.0: Allow server owners and global moderators/admins
        if (!isOwner && !hasServerModerationPermission && !isGlobalModerator) {
            return NextResponse.json(
                {
                    error: "Insufficient permissions. You need manageServer, server ownership, or global moderator/admin rights.",
                },
                { status: 403 },
            );
        }

        if (userId === moderatorId) {
            return NextResponse.json(
                { error: "You cannot moderate yourself" },
                { status: 400 },
            );
        }

        if (String(server.ownerId) === userId) {
            return NextResponse.json(
                { error: "Cannot moderate the server owner" },
                { status: 403 },
            );
        }

        let result;

        const normalizedReason = normalizeReason(reason);

        switch (action) {
            case "ban": {
                if (!BANNED_USERS_COLLECTION_ID) {
                    return NextResponse.json(
                        { error: "Banned users collection not configured" },
                        { status: 500 },
                    );
                }

                const bannedPayload = {
                    serverId,
                    userId,
                    bannedBy: moderatorId,
                    reason: normalizedReason,
                    timestamp: new Date().toISOString(),
                };

                // Idempotent: update the existing ban instead of duplicating
                const existingBan = await databases.listDocuments(
                    DATABASE_ID,
                    BANNED_USERS_COLLECTION_ID,
                    [
                        Query.equal("serverId", serverId),
                        Query.equal("userId", userId),
                        Query.limit(1),
                    ],
                );

                if (existingBan.documents.length > 0) {
                    result = await databases.updateDocument(
                        DATABASE_ID,
                        BANNED_USERS_COLLECTION_ID,
                        existingBan.documents[0].$id,
                        bannedPayload,
                    );
                } else {
                    result = await databases.createDocument(
                        DATABASE_ID,
                        BANNED_USERS_COLLECTION_ID,
                        ID.unique(),
                        bannedPayload,
                    );
                }

                // Remove from server memberships
                try {
                    const membership = await databases.listDocuments(
                        DATABASE_ID,
                        MEMBERSHIPS_COLLECTION_ID,
                        [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userId),
                            Query.limit(1),
                        ],
                    );

                    if (membership.documents.length > 0) {
                        await databases.deleteDocument(
                            DATABASE_ID,
                            MEMBERSHIPS_COLLECTION_ID,
                            membership.documents[0].$id,
                        );
                    }
                } catch (error) {
                    logger.error("Error removing membership", {
                        serverId,
                        userId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
                break;
            }

            case "mute": {
                if (!MUTED_USERS_COLLECTION_ID) {
                    return NextResponse.json(
                        { error: "Muted users collection not configured" },
                        { status: 500 },
                    );
                }

                const membership = await databases.listDocuments(
                    DATABASE_ID,
                    MEMBERSHIPS_COLLECTION_ID,
                    [
                        Query.equal("serverId", serverId),
                        Query.equal("userId", userId),
                        Query.limit(1),
                    ],
                );

                if (membership.documents.length === 0) {
                    return NextResponse.json(
                        { error: "User is not a member of this server" },
                        { status: 404 },
                    );
                }

                const mutedPayload = {
                    serverId,
                    userId,
                    mutedBy: moderatorId,
                    reason: normalizedReason,
                    timestamp: new Date().toISOString(),
                };

                // Idempotent: update the existing mute instead of duplicating
                const existingMute = await databases.listDocuments(
                    DATABASE_ID,
                    MUTED_USERS_COLLECTION_ID,
                    [
                        Query.equal("serverId", serverId),
                        Query.equal("userId", userId),
                        Query.limit(1),
                    ],
                );

                if (existingMute.documents.length > 0) {
                    result = await databases.updateDocument(
                        DATABASE_ID,
                        MUTED_USERS_COLLECTION_ID,
                        existingMute.documents[0].$id,
                        mutedPayload,
                    );
                } else {
                    result = await databases.createDocument(
                        DATABASE_ID,
                        MUTED_USERS_COLLECTION_ID,
                        ID.unique(),
                        mutedPayload,
                    );
                }
                break;
            }

            case "kick": {
                // Remove from server memberships
                const membership = await databases.listDocuments(
                    DATABASE_ID,
                    MEMBERSHIPS_COLLECTION_ID,
                    [
                        Query.equal("serverId", serverId),
                        Query.equal("userId", userId),
                        Query.limit(1),
                    ],
                );

                if (membership.documents.length > 0) {
                    result = await databases.deleteDocument(
                        DATABASE_ID,
                        MEMBERSHIPS_COLLECTION_ID,
                        membership.documents[0].$id,
                    );
                } else {
                    return NextResponse.json(
                        { error: "User is not a member of this server" },
                        { status: 404 },
                    );
                }
                break;
            }

            case "unban":
                if (!BANNED_USERS_COLLECTION_ID) {
                    return NextResponse.json(
                        { error: "Banned users collection not configured" },
                        { status: 500 },
                    );
                }

                const removedBans = await removeAllForUser(
                    databases,
                    BANNED_USERS_COLLECTION_ID,
                    serverId,
                    userId,
                );
                if (removedBans === 0) {
                    return NextResponse.json(
                        { error: "User is not banned" },
                        { status: 404 },
                    );
                }
                result = { removed: removedBans };
                break;

            case "unmute":
                if (!MUTED_USERS_COLLECTION_ID) {
                    return NextResponse.json(
                        { error: "Muted users collection not configured" },
                        { status: 500 },
                    );
                }

                const removedMutes = await removeAllForUser(
                    databases,
                    MUTED_USERS_COLLECTION_ID,
                    serverId,
                    userId,
                );
                if (removedMutes === 0) {
                    return NextResponse.json(
                        { error: "User is not muted" },
                        { status: 404 },
                    );
                }
                result = { removed: removedMutes };
                break;

            default:
                return NextResponse.json(
                    {
                        error: "Invalid action. Supported: ban, mute, kick, unban, unmute",
                    },
                    { status: 400 },
                );
        }

        // Record audit log
        await recordAudit(action as string, userId, moderatorId, {
            serverId,
            reason: normalizedReason,
            details: getAuditDetail(String(action)),
        });

        return NextResponse.json({
            success: true,
            action,
            userId,
            result,
        });
    } catch (error) {
        logger.error("Error performing moderation action", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to perform moderation action" },
            { status: 500 },
        );
    }
}
