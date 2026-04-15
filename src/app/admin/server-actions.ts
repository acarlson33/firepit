"use server";

import { ID, Query } from "node-appwrite";

import { requireAdmin, requireAuth, requireModerator } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
const MEMBERSHIPS_COLLECTION_ID = env.collections.memberships || undefined;

export type ServerCreationResult =
    | { success: true; serverId: string; serverName: string }
    | { success: false; error: string };

export type ChannelCreationResult =
    | {
          success: true;
          channelId: string;
          channelName: string;
          channelType: "text" | "voice" | "announcement";
      }
    | { success: false; error: string };

export type ServerListResult = {
    servers: Array<{
        $id: string;
        name: string;
        ownerId: string;
        createdAt: string;
        defaultOnSignup?: boolean;
    }>;
};

export type ChannelListResult = {
    channels: Array<{
        $id: string;
        name: string;
        type: "text" | "voice" | "announcement";
        serverId: string;
        createdAt: string;
    }>;
};

const CHANNEL_TYPES = ["text", "voice", "announcement"] as const;

function normalizeChannelType(
    value: unknown,
): "text" | "voice" | "announcement" {
    if (
        typeof value === "string" &&
        CHANNEL_TYPES.includes(value as (typeof CHANNEL_TYPES)[number])
    ) {
        return value as "text" | "voice" | "announcement";
    }

    return "text";
}

/**
 * Create a new server (Admin only)
 * Admins can always create servers regardless of feature flags
 */
export async function createServerAction(
    name: string,
): Promise<ServerCreationResult> {
    try {
        // Require admin role to create servers
        const { user } = await requireAdmin();
        const ownerId = user.$id;

        if (!name.trim()) {
            return { success: false, error: "Server name is required" };
        }

        const { databases } = getServerClient();

        // Create server with owner permissions
        const permissions = perms.serverOwner(ownerId);

        const serverDoc = await databases.createDocument(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            ID.unique(),
            { name: name.trim(), ownerId },
            permissions,
        );

        // Create membership record if enabled
        if (MEMBERSHIPS_COLLECTION_ID) {
            try {
                const membershipPerms = perms.serverOwner(ownerId);
                await databases.createDocument(
                    DATABASE_ID,
                    MEMBERSHIPS_COLLECTION_ID,
                    ID.unique(),
                    {
                        serverId: serverDoc.$id,
                        userId: ownerId,
                        role: "owner",
                    },
                    membershipPerms,
                );
            } catch {
                // Non-critical: membership creation failed but server exists
            }
        }

        return {
            success: true,
            serverId: serverDoc.$id,
            serverName: name.trim(),
        };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to create server",
        };
    }
}

/**
 * Create a new channel for a server (server owner only)
 */
export async function createChannelAction(
    serverId: string,
    name: string,
    type: "text" | "voice" | "announcement" = "text",
): Promise<ChannelCreationResult> {
    try {
        const user = await requireAuth();

        if (!name.trim()) {
            return { success: false, error: "Channel name is required" };
        }

        if (!serverId) {
            return { success: false, error: "Server ID is required" };
        }

        const { databases } = getServerClient();

        const serverDocument = await databases.getDocument(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            serverId,
        );

        if (String(serverDocument.ownerId) !== user.$id) {
            return {
                success: false,
                error: "Only the server owner can create channels",
            };
        }

        // Create channel with public read permissions
        const permissions = ['read("any")'];

        const channelDoc = await databases.createDocument(
            DATABASE_ID,
            CHANNELS_COLLECTION_ID,
            ID.unique(),
            { name: name.trim(), serverId, type: normalizeChannelType(type) },
            permissions,
        );

        return {
            success: true,
            channelId: channelDoc.$id,
            channelName: name.trim(),
            channelType: normalizeChannelType(channelDoc.type),
        };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to create channel",
        };
    }
}

/**
 * List all servers (Admin only)
 */
export async function listServersAction(): Promise<ServerListResult> {
    try {
        await requireAdmin();

        const { databases } = getServerClient();
        const response = await databases.listDocuments(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            [Query.limit(100), Query.orderDesc("$createdAt")],
        );

        const servers = response.documents.map((doc) => ({
            $id: doc.$id,
            name: String(doc.name),
            ownerId: String(doc.ownerId),
            createdAt: String(doc.createdAt || doc.$createdAt),
            defaultOnSignup: doc.defaultOnSignup === true,
        }));

        return { servers };
    } catch {
        return { servers: [] };
    }
}

/**
 * Set the default server for new user signups (Admin only)
 */
export async function setDefaultSignupServerAction(
    serverId: string | null,
): Promise<DeleteResult> {
    try {
        await requireAdmin();

        const { databases } = getServerClient();
        const defaultsResponse = await databases.listDocuments(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            [Query.equal("defaultOnSignup", true), Query.limit(200)],
        );

        for (const server of defaultsResponse.documents) {
            if (server.defaultOnSignup === true) {
                await databases.updateDocument(
                    DATABASE_ID,
                    SERVERS_COLLECTION_ID,
                    server.$id,
                    { defaultOnSignup: false },
                );
            }
        }

        if (serverId) {
            await databases.updateDocument(
                DATABASE_ID,
                SERVERS_COLLECTION_ID,
                serverId,
                { defaultOnSignup: true },
            );
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to update default signup server",
        };
    }
}

/**
 * List channels for a server (Admin or Moderator)
 */
export async function listChannelsAction(
    serverId: string,
): Promise<ChannelListResult> {
    try {
        await requireModerator();

        if (!serverId) {
            return { channels: [] };
        }

        const { databases } = getServerClient();
        const response = await databases.listDocuments(
            DATABASE_ID,
            CHANNELS_COLLECTION_ID,
            [Query.equal("serverId", serverId), Query.limit(100)],
        );

        const channels = response.documents.map((doc) => ({
            $id: doc.$id,
            name: String(doc.name),
            type: normalizeChannelType(doc.type),
            serverId: String(doc.serverId),
            createdAt: String(doc.createdAt || doc.$createdAt),
        }));

        return { channels };
    } catch {
        return { channels: [] };
    }
}

export type DeleteResult =
    | { success: true }
    | { success: false; error: string };

/**
 * Delete a server (Admin only)
 */
export async function deleteServerAction(
    serverId: string,
): Promise<DeleteResult> {
    try {
        await requireAdmin();

        if (!serverId) {
            return { success: false, error: "Server ID is required" };
        }

        const { databases } = getServerClient();

        // Delete the server
        await databases.deleteDocument(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            serverId,
        );

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to delete server",
        };
    }
}

/**
 * Delete a channel (Admin only)
 */
export async function deleteChannelAction(
    channelId: string,
): Promise<DeleteResult> {
    try {
        await requireAdmin();

        if (!channelId) {
            return { success: false, error: "Channel ID is required" };
        }

        const { databases } = getServerClient();

        // Delete the channel
        await databases.deleteDocument(
            DATABASE_ID,
            CHANNELS_COLLECTION_ID,
            channelId,
        );

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to delete channel",
        };
    }
}
