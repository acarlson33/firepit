"use server";

import { ID, Query } from "node-appwrite";

import { requireAdmin, requireAuth, requireModerator } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { normalizeChannelType } from "@/lib/server-channel-access";
import { logger } from "@/lib/newrelic-utils";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
const MEMBERSHIPS_COLLECTION_ID = env.collections.memberships || undefined;

// Result shapes are returned inline; no exported type aliases here.

type MutationResult =
    | { success: true }
    | { success: false; error: string };

// Reuse shared normalizeChannelType from server-channel-access

async function listDefaultSignupServers(): Promise<Array<{ $id: string }>> {
    const { databases } = getServerClient();
    const pageLimit = 100;
    let cursorAfter: string | undefined;
    const defaults: Array<{ $id: string }> = [];
    let paginated = false;

    while (true) {
        const queries = [
            Query.equal("defaultOnSignup", true),
            Query.orderAsc("$id"),
            Query.limit(pageLimit),
        ];

        if (cursorAfter) {
            queries.push(Query.cursorAfter(cursorAfter));
        }

        const page = await databases.listDocuments(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            queries,
        );

        defaults.push(...page.documents.map((server) => ({ $id: server.$id })));

        if (page.documents.length < pageLimit) {
            break;
        }

        // If we reached this point, pagination occurred.
        paginated = true;

        const lastId = page.documents.at(-1)?.$id;
        if (!lastId) {
            break;
        }

        cursorAfter = lastId;
    }

    // Single summary debug log instead of per-page logging
    logger.debug("Default signup servers fetched", {
        count: defaults.length,
        paginated,
    });

    return defaults;
}

/**
 * Create a new server (Admin only)
 * Admins can always create servers regardless of feature flags
 */
export async function createServerAction(name: string) {
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
            } catch (error) {
                logger.error("Membership creation failed after server creation", {
                    serverId: serverDoc.$id,
                    ownerId,
                    error: error instanceof Error ? error.message : String(error),
                });
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
) {
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
export async function listServersAction() {
    try {
        // Allow moderators and admins to list servers for management UI
        await requireModerator();

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
): Promise<MutationResult> {
    try {
        await requireAdmin();

        const { databases } = getServerClient();
        const defaultServers = await listDefaultSignupServers();

        // First, clear existing defaults (except the requested server)
        const serversToReset = defaultServers.filter(
            (server) => server.$id !== serverId,
        );

        if (serversToReset.length > 0) {
            const resetResults = await Promise.allSettled(
                serversToReset.map((server) =>
                    databases.updateDocument(
                        DATABASE_ID,
                        SERVERS_COLLECTION_ID,
                        server.$id,
                        { defaultOnSignup: false },
                    ),
                ),
            );

            const resetFailures = resetResults.filter(
                (result) => result.status === "rejected",
            );
            if (resetFailures.length > 0) {
                const successfullyResetServerIds = resetResults
                    .map((result, index) =>
                        result.status === "fulfilled"
                            ? serversToReset[index]?.$id
                            : null,
                    )
                    .filter((value): value is string => typeof value === "string");

                if (successfullyResetServerIds.length > 0) {
                    const restoreResults = await Promise.allSettled(
                        successfullyResetServerIds.map((defaultServerId) =>
                            databases.updateDocument(
                                DATABASE_ID,
                                SERVERS_COLLECTION_ID,
                                defaultServerId,
                                { defaultOnSignup: true },
                            ),
                        ),
                    );

                    for (const [index, restoreResult] of restoreResults.entries()) {
                        if (restoreResult.status === "rejected") {
                            logger.error("Failed to restore partially reset default signup server", {
                                defaultServerId: successfullyResetServerIds[index],
                                error:
                                    restoreResult.reason instanceof Error
                                        ? restoreResult.reason.message
                                        : String(restoreResult.reason),
                            });
                        }
                    }
                }

                logger.error("Failed to clear existing default signup servers", {
                    failureCount: resetFailures.length,
                    serverId,
                });

                return {
                    success: false,
                    error: "Failed to clear existing default signup servers",
                };
            }
        }

        // Now set the requested server as default (if provided)
        if (serverId) {
            try {
                await databases.updateDocument(
                    DATABASE_ID,
                    SERVERS_COLLECTION_ID,
                    serverId,
                    { defaultOnSignup: true },
                );
            } catch (setError) {
                logger.error("Failed to set default signup server", {
                    error: setError instanceof Error ? setError.message : String(setError),
                    serverId,
                });

                // Attempt to restore any servers we cleared earlier
                if (serversToReset.length > 0) {
                    const restorePromises = serversToReset.map((s) =>
                        databases.updateDocument(
                            DATABASE_ID,
                            SERVERS_COLLECTION_ID,
                            s.$id,
                            { defaultOnSignup: true },
                        ),
                    );

                    const restoreResults = await Promise.allSettled(restorePromises);
                    for (const [i, r] of restoreResults.entries()) {
                        if (r.status === "rejected") {
                            logger.error("Failed to restore cleared default signup server", {
                                defaultServerId: serversToReset[i].$id,
                                error: r.reason instanceof Error ? r.reason.message : String(r.reason),
                            });
                        }
                    }
                }

                return {
                    success: false,
                    error: "Failed to set default signup server",
                };
            }
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
export async function listChannelsAction(serverId: string) {
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

/**
 * Delete a server (Admin only)
 */
export async function deleteServerAction(
    serverId: string,
): Promise<MutationResult> {
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
): Promise<MutationResult> {
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
