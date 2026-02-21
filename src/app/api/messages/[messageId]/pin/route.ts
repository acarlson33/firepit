import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query, Databases, Client, ID } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type {
    Message,
    Role,
    ChannelPermissionOverride,
    PinnedMessage,
} from "@/lib/types";
import { getEffectivePermissions, hasPermission } from "@/lib/permissions";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

const MAX_PINS_PER_CHANNEL = 50;

// Collection IDs for roles system (not in main config)
const ROLES_COLLECTION_ID = "roles";
const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID =
    "channel_permission_overrides";

/**
 * Get a direct database client for roles queries
 */
function getRolesDatabase(): Databases {
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const project = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !project || !apiKey) {
        throw new Error("Missing Appwrite configuration");
    }

    const client = new Client().setEndpoint(endpoint).setProject(project);
    if (
        typeof (client as unknown as { setKey?: (k: string) => void })
            .setKey === "function"
    ) {
        (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
    }
    return new Databases(client);
}

/**
 * Helper to check if user has manageMessages permission for a channel
 */
async function canManageMessages(
    userId: string,
    serverId: string,
    channelId: string,
    ownerId: string,
): Promise<boolean> {
    const env = getEnvConfig();
    const rolesDb = getRolesDatabase();

    // Server owner can always manage messages
    if (userId === ownerId) {
        return true;
    }

    try {
        // Get user's role assignments
        const roleAssignments = await rolesDb.listDocuments(
            env.databaseId,
            ROLE_ASSIGNMENTS_COLLECTION_ID,
            [Query.equal("userId", userId), Query.equal("serverId", serverId)],
        );

        if (roleAssignments.documents.length === 0) {
            return false;
        }

        // Get the role IDs
        const roleIds =
            (roleAssignments.documents[0] as unknown as { roleIds: string[] })
                .roleIds || [];
        if (roleIds.length === 0) {
            return false;
        }

        // Get the actual roles
        const roles: Role[] = [];
        for (const roleId of roleIds) {
            try {
                const role = await rolesDb.getDocument(
                    env.databaseId,
                    ROLES_COLLECTION_ID,
                    roleId,
                );
                roles.push(role as unknown as Role);
            } catch {
                // Role may have been deleted
            }
        }

        // Get channel-specific overrides
        const overrides = await rolesDb.listDocuments(
            env.databaseId,
            CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
            [Query.equal("channelId", channelId)],
        );

        // Calculate effective permissions
        const effectivePerms = getEffectivePermissions(
            roles,
            overrides.documents as unknown as ChannelPermissionOverride[],
            false,
        );

        return hasPermission("manageMessages", effectivePerms);
    } catch (error) {
        logger.warn(
            "Failed to check permissions, defaulting to server owner check",
            {
                error: error instanceof Error ? error.message : String(error),
            },
        );
        return false;
    }
}

/**
 * POST /api/messages/[messageId]/pin
 * Pin a message to the channel
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/messages/[messageId]/pin");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated pin attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;

        addTransactionAttributes({
            messageId,
            userId: user.$id,
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Get the message
        let message: Message;
        try {
            message = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                messageId,
            )) as unknown as Message;
        } catch {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 },
            );
        }

        const channelId = message.channelId;
        if (!channelId) {
            return NextResponse.json(
                { error: "Message is not in a channel" },
                { status: 400 },
            );
        }

        if (!message.channelId) {
            return NextResponse.json(
                { error: "Message is not in a channel" },
                { status: 400 },
            );
        }

        // Message must have a channelId
        if (!message.channelId) {
            return NextResponse.json(
                { error: "Message is not in a channel" },
                { status: 400 },
            );
        }

        // Get the server to check ownership
        const serverId = message.serverId;
        let ownerId: string | undefined;

        if (serverId) {
            try {
                const server = await databases.getDocument(
                    env.databaseId,
                    env.collections.servers,
                    serverId,
                );
                ownerId = (server as unknown as { ownerId: string }).ownerId;
            } catch {
                // Server may not exist
            }
        }

        // Check permission to pin
        const canPin = await canManageMessages(
            user.$id,
            serverId ?? "",
            message.channelId,
            ownerId ?? "",
        );

        if (!canPin) {
            return NextResponse.json(
                {
                    error: "You don't have permission to pin messages in this channel",
                },
                { status: 403 },
            );
        }

        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", message.channelId),
                Query.equal("messageId", messageId),
                Query.limit(1),
            ],
        );

        if (existing.total > 0) {
            const existingPin = existing
                .documents[0] as unknown as PinnedMessage;
            const duration = Date.now() - startTime;
            trackApiCall(
                "/api/messages/[messageId]/pin",
                "POST",
                200,
                duration,
            );

            return NextResponse.json({ pin: existingPin });
        }

        // Check pin limit for this channel
        const pinCount = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", message.channelId),
                Query.limit(MAX_PINS_PER_CHANNEL + 1),
            ],
        );

        if (pinCount.total >= MAX_PINS_PER_CHANNEL) {
            return NextResponse.json(
                { error: "Pin limit reached for this channel" },
                { status: 409 },
            );
        }

        const now = new Date().toISOString();

        const created = await databases.createDocument(
            env.databaseId,
            env.collections.pinnedMessages,
            ID.unique(),
            {
                messageId,
                contextType: "channel",
                contextId: message.channelId,
                pinnedBy: user.$id,
                pinnedAt: now,
            },
        );

        const duration = Date.now() - startTime;
        trackApiCall("/api/messages/[messageId]/pin", "POST", 200, duration);

        logger.info("Message pinned successfully", {
            messageId,
            channelId: message.channelId,
            userId: user.$id,
        });

        return NextResponse.json({ pin: created });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to pin message", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/messages/[messageId]/pin",
            method: "POST",
        });
        trackApiCall("/api/messages/[messageId]/pin", "POST", 500, duration);

        return NextResponse.json(
            { error: "Failed to pin message" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/messages/[messageId]/pin
 * Unpin a message from the channel
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("DELETE /api/messages/[messageId]/pin");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated unpin attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;

        addTransactionAttributes({
            messageId,
            userId: user.$id,
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Get the message
        let message: Message;
        try {
            message = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                messageId,
            )) as unknown as Message;
        } catch {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 },
            );
        }

        const channelId = message.channelId;
        if (!channelId) {
            return NextResponse.json(
                { error: "Message is not in a channel" },
                { status: 400 },
            );
        }

        // Get the server to check ownership
        const serverId = message.serverId;
        let ownerId: string | undefined;

        if (serverId) {
            try {
                const server = await databases.getDocument(
                    env.databaseId,
                    env.collections.servers,
                    serverId,
                );
                ownerId = (server as unknown as { ownerId: string }).ownerId;
            } catch {
                // Server may not exist
            }
        }

        // Check permission to unpin
        const canUnpin = await canManageMessages(
            user.$id,
            serverId ?? "",
            channelId,
            ownerId ?? "",
        );

        if (!canUnpin) {
            return NextResponse.json(
                {
                    error: "You don't have permission to unpin messages in this channel",
                },
                { status: 403 },
            );
        }

        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", channelId),
                Query.equal("messageId", messageId),
                Query.limit(1),
            ],
        );

        if (existing.total > 0) {
            await databases.deleteDocument(
                env.databaseId,
                env.collections.pinnedMessages,
                String(existing.documents[0].$id),
            );
        }

        const duration = Date.now() - startTime;
        trackApiCall("/api/messages/[messageId]/pin", "DELETE", 200, duration);

        logger.info("Message unpinned successfully", {
            messageId,
            channelId: message.channelId,
            userId: user.$id,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to unpin message", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/messages/[messageId]/pin",
            method: "DELETE",
        });
        trackApiCall("/api/messages/[messageId]/pin", "DELETE", 500, duration);

        return NextResponse.json(
            { error: "Failed to unpin message" },
            { status: 500 },
        );
    }
}
