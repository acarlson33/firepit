import { ID, Permission, Query, Role } from "appwrite";

import {
    getBrowserDatabases,
    getEnvConfig,
    normalizeError,
    withSession,
} from "./appwrite-core";
import type { Channel, Membership, Server } from "./types";
import { assignDefaultRoleBrowser } from "./default-role";
import {
    getActualMemberCount,
    getActualMemberCounts,
} from "./membership-count";
import { logger } from "./newrelic-utils";
import {
    mapServerDocument,
    normalizeServerDescription,
    normalizeServerFileId,
} from "./server-metadata";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
// Read memberships collection ID at call time for testability
/**
 * Returns memberships collection id.
 * @returns {string | undefined} The return value.
 */
function getMembershipsCollectionId(): string | undefined {
    return getEnvConfig().collections.memberships || undefined;
}
const MAX_LIST_LIMIT = 500; // upper bound used for bulk listing
const DEFAULT_SERVER_PAGE_SIZE = 25;
const DEFAULT_CHANNEL_PAGE_SIZE = 50;
const CHANNEL_TYPES = ["text", "voice", "announcement"] as const;

function normalizeChannelType(value: unknown): Channel["type"] {
    if (
        typeof value === "string" &&
        CHANNEL_TYPES.includes(value as (typeof CHANNEL_TYPES)[number])
    ) {
        return value as Channel["type"];
    }

    return "text";
}

function mapMembershipDocument(doc: Record<string, unknown>): Membership {
    if (typeof doc.$id !== "string" || doc.$id.trim().length === 0) {
        throw new Error("mapMembershipDocument requires a valid $id");
    }

    if (typeof doc.serverId !== "string" || doc.serverId.trim().length === 0) {
        throw new Error("mapMembershipDocument requires a valid serverId");
    }

    if (typeof doc.userId !== "string" || doc.userId.trim().length === 0) {
        throw new Error("mapMembershipDocument requires a valid userId");
    }

    const id = doc.$id;
    const serverId = doc.serverId;
    const userId = doc.userId;

    return {
        $id: id,
        $createdAt: String(doc.$createdAt ?? ""),
        role: doc.role === "owner" ? "owner" : "member",
        serverId,
        userId,
    };
}
// Authorization diagnostics constants
// (Unauthorized diagnostics constants removed after refactor to normalized errors)

async function assertUserServerCreationEnabled(): Promise<void> {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const response = await fetch("/api/feature-flags/allow-user-servers", {
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(
                `Failed to verify server creation policy (${response.status}). Contact an administrator.`,
            );
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new Error("Invalid feature flag response JSON");
        }

        if (!payload || typeof payload !== "object") {
            throw new Error("Invalid feature flag response payload");
        }

        const enabled = (payload as { enabled?: unknown }).enabled;
        if (typeof enabled !== "boolean") {
            throw new Error("Invalid feature flag response payload");
        }

        if (enabled !== true) {
            throw new Error(
                "Server creation is currently disabled. Contact an administrator.",
            );
        }
    } catch (error) {
        throw normalizeError(error);
    }
}

/**
 * Returns databases.
 * @returns {Databases} The return value.
 */
function getDatabases() {
    return getBrowserDatabases();
}

/**
 * Lists servers page.
 *
 * @param {number} limit - The limit value, if provided.
 * @param {string | undefined} cursorAfter - The cursor after value, if provided.
 * @returns {Promise<{ servers: Server[]; nextCursor: string | null; }>} The return value.
 */
export async function listServersPage(
    limit = DEFAULT_SERVER_PAGE_SIZE,
    cursorAfter?: string,
): Promise<{ servers: Server[]; nextCursor: string | null }> {
    const queries: string[] = [
        Query.limit(limit),
        Query.orderAsc("$createdAt"),
    ];
    if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
    }
    const databases = getDatabases();
    const res = await databases.listDocuments({
        databaseId: DATABASE_ID,
        collectionId: SERVERS_COLLECTION_ID,
        queries,
    });

    const memberCounts = await getActualMemberCounts(
        databases,
        res.documents.map((doc) => String(doc.$id)),
    );

    const items = res.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return mapServerDocument(d, memberCounts.get(String(d.$id)) ?? 0);
    });

    const last = items.at(-1);
    const nextCursor = items.length === limit && last ? last.$id : null;
    return { servers: items, nextCursor };
}

/**
 * Creates server.
 *
 * @param {string} name - The name value.
 * @param {{ bypassFeatureCheck?: boolean | undefined; } | undefined} options - The options value, if provided.
 * @returns {Promise<Server>} The return value.
 */
/* eslint-disable no-redeclare */
export function createServer(
    name: string,
    options?: {
        bypassFeatureCheck?: boolean;
        description?: string;
        iconFileId?: string;
        bannerFileId?: string;
        isPublic?: boolean;
        includeMembership?: false;
    },
): Promise<Server>;
export function createServer(
    name: string,
    options: {
        bypassFeatureCheck?: boolean;
        description?: string;
        iconFileId?: string;
        bannerFileId?: string;
        isPublic?: boolean;
        includeMembership: true;
    },
): Promise<{ membership: Membership | null; server: Server }>;
export function createServer(
    name: string,
    options?: {
        bypassFeatureCheck?: boolean;
        description?: string;
        iconFileId?: string;
        bannerFileId?: string;
        isPublic?: boolean;
        includeMembership?: boolean;
    },
): Promise<Server | { membership: Membership | null; server: Server }> {
    return withSession(async ({ userId }) => {
        const ownerId = userId;

        // Check feature flag for browser calls unless bypassed.
        if (!options?.bypassFeatureCheck) {
            await assertUserServerCreationEnabled();
        }

        try {
            const description = normalizeServerDescription(options?.description);
            const iconFileId = normalizeServerFileId(options?.iconFileId);
            const bannerFileId = normalizeServerFileId(options?.bannerFileId);
            const serverData: Record<string, unknown> = {
                name,
                ownerId,
                isPublic: options?.isPublic ?? true,
            };

            if (description) {
                serverData.description = description;
            }

            if (iconFileId) {
                serverData.iconFileId = iconFileId;
            }

            if (bannerFileId) {
                serverData.bannerFileId = bannerFileId;
            }

            const permissions = [
                Permission.read(Role.any()),
                Permission.update(Role.user(ownerId)),
                Permission.delete(Role.user(ownerId)),
            ];
            const serverDoc = await getDatabases().createDocument({
                databaseId: DATABASE_ID,
                collectionId: SERVERS_COLLECTION_ID,
                documentId: ID.unique(),
                data: serverData,
                permissions,
            });
            const s = serverDoc as unknown as Record<string, unknown>;
            let membership: Membership | null = null;
            const membershipsCollectionId = getMembershipsCollectionId();
            if (membershipsCollectionId) {
                try {
                    const membershipPerms = [
                        Permission.read(Role.any()),
                        Permission.update(Role.user(ownerId)),
                        Permission.delete(Role.user(ownerId)),
                    ];
                    const membershipDoc = await getDatabases().createDocument({
                        databaseId: DATABASE_ID,
                        collectionId: membershipsCollectionId,
                        documentId: ID.unique(),
                        data: {
                            serverId: String(s.$id),
                            userId: ownerId,
                            role: "owner",
                        },
                        permissions: membershipPerms,
                    });

                    membership = mapMembershipDocument(
                        membershipDoc as Record<string, unknown>,
                    );
                } catch {
                    // ignore membership creation failure
                }
            }
            try {
                await createChannel(String(s.$id), "general", ownerId);
            } catch {
                // ignore channel creation failure
            }

            // Get actual member count for return value
            const serverRecord = {
                ...serverData,
                ...s,
                ownerId,
            };
            const actualMemberCount = await getActualMemberCount(
                getDatabases(),
                String(s.$id),
            );

            const mappedServer = mapServerDocument(serverRecord, actualMemberCount);

            if (options?.includeMembership) {
                return {
                    membership,
                    server: mappedServer,
                };
            }

            return mappedServer;
        } catch (e) {
            throw normalizeError(e);
        }
    });
}
/* eslint-enable no-redeclare */

/**
 * Lists channels page.
 *
 * @param {string} serverId - The server id value.
 * @param {number} limit - The limit value, if provided.
 * @param {string | undefined} cursorAfter - The cursor after value, if provided.
 * @returns {Promise<{ channels: Channel[]; nextCursor: string | null; }>} The return value.
 */
export async function listChannelsPage(
    serverId: string,
    limit = DEFAULT_CHANNEL_PAGE_SIZE,
    cursorAfter?: string,
): Promise<{ channels: Channel[]; nextCursor: string | null }> {
    const queries: string[] = [
        Query.equal("serverId", serverId),
        Query.limit(limit),
        Query.orderAsc("$createdAt"),
    ];
    if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
    }
    const res = await getDatabases().listDocuments({
        databaseId: DATABASE_ID,
        collectionId: CHANNELS_COLLECTION_ID,
        queries,
    });
    const items = res.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
            $id: String(d.$id),
            serverId: String(d.serverId),
            name: String(d.name),
            type: normalizeChannelType(d.type),
            topic: typeof d.topic === "string" && d.topic ? d.topic : undefined,
            categoryId:
                typeof d.categoryId === "string" ? d.categoryId : undefined,
            position: typeof d.position === "number" ? d.position : undefined,
            $createdAt: String(d.$createdAt ?? ""),
            $updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
        } satisfies Channel;
    });
    const last = items.at(-1);
    const nextCursor = items.length === limit && last ? last.$id : null;
    return { channels: items, nextCursor };
}

/**
 * Creates channel.
 *
 * @param {string} serverId - The server id value.
 * @param {string} name - The name value.
 * @param {string} _ownerId - The  owner id value.
 * @returns {Promise<Channel>} The return value.
 */
export async function createChannel(
    serverId: string,
    name: string,
    _ownerId: string,
    type: Channel["type"] = "text",
    topic?: string,
): Promise<Channel> {
    const permissions = [Permission.read(Role.any())];
    const res = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: CHANNELS_COLLECTION_ID,
        documentId: ID.unique(),
        data: {
            serverId,
            name,
            type: normalizeChannelType(type),
            topic: topic?.trim() || "",
            position: 0,
        },
        permissions,
    });
    const d = res as unknown as Record<string, unknown>;
    return {
        $id: String(d.$id),
        serverId: String(d.serverId),
        name: String(d.name),
        type: normalizeChannelType(d.type),
        topic: typeof d.topic === "string" && d.topic ? d.topic : undefined,
        categoryId: typeof d.categoryId === "string" ? d.categoryId : undefined,
        position: typeof d.position === "number" ? d.position : undefined,
        $createdAt: String(d.$createdAt ?? ""),
        $updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
    } satisfies Channel;
}

// Membership utilities
/**
 * Lists memberships for user.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<Membership[]>} The return value.
 */
export async function listMembershipsForUser(
    userId: string,
): Promise<Membership[]> {
    const membershipsCollectionId = getMembershipsCollectionId();
    if (!membershipsCollectionId) {
        return [];
    }
    const res = await getDatabases().listDocuments({
        databaseId: DATABASE_ID,
        collectionId: membershipsCollectionId,
        queries: [Query.equal("userId", userId), Query.limit(MAX_LIST_LIMIT)],
    });
    return res.documents.map((doc) =>
        mapMembershipDocument(doc as Record<string, unknown>),
    );
}

/**
 * Handles join server.
 *
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<Membership | null>} The return value.
 */
export async function joinServer(
    serverId: string,
    userId: string,
): Promise<Membership | null> {
    const membershipsCollectionId = getMembershipsCollectionId();
    if (!membershipsCollectionId) {
        return null;
    }
    const permissions = [
        Permission.read(Role.any()),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
    ];
    const res = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: membershipsCollectionId,
        documentId: ID.unique(),
        data: { serverId, userId, role: "member" },
        permissions,
    });
    try {
        await assignDefaultRoleBrowser(serverId, userId);
    } catch {
        // Non-fatal: continue even if role assignment fails
    }
    return mapMembershipDocument(res as Record<string, unknown>);
}

/**
 * Removes channel.
 *
 * @param {string} channelId - The channel id value.
 * @returns {Promise<void>} The return value.
 */
export async function deleteChannel(channelId: string) {
    await getDatabases().deleteDocument({
        databaseId: DATABASE_ID,
        collectionId: CHANNELS_COLLECTION_ID,
        documentId: channelId,
    });
}

/**
 * Removes server.
 *
 * @param {string} serverId - The server id value.
 * @returns {Promise<void>} The return value.
 */
export async function deleteServer(serverId: string) {
    const channelIds: string[] = [];
    let offset = 0;
    let paginationError: unknown = null;

    while (true) {
        try {
            const chans = await getDatabases().listDocuments({
                databaseId: DATABASE_ID,
                collectionId: CHANNELS_COLLECTION_ID,
                queries: [
                    Query.equal("serverId", serverId),
                    Query.limit(MAX_LIST_LIMIT),
                    Query.offset(offset),
                ],
            });

            if (chans.documents.length === 0) {
                break;
            }

            channelIds.push(
                ...chans.documents.map((channel) =>
                    String((channel as unknown as Record<string, unknown>).$id),
                ),
            );

            if (chans.documents.length < MAX_LIST_LIMIT) {
                break;
            }

            offset += MAX_LIST_LIMIT;
        } catch (error) {
            paginationError = error;
            logger.error("Failed to list channels while deleting server", {
                error: error instanceof Error ? error.message : String(error),
                offset,
                serverId,
            });
            break;
        }
    }

    if (channelIds.length > 0) {
        const deleteResults = await Promise.allSettled(
            channelIds.map((channelId) => deleteChannel(channelId)),
        );

        let hasDeleteFailure = false;
        for (const [index, result] of deleteResults.entries()) {
            if (result.status === "rejected") {
                hasDeleteFailure = true;
                logger.error("Failed to delete channel while deleting server", {
                    channelId: channelIds[index],
                    error:
                        result.reason instanceof Error
                            ? result.reason.message
                            : String(result.reason),
                    serverId,
                });
            }
        }

        if (hasDeleteFailure) {
            throw new Error("Failed to delete one or more channels while deleting server");
        }
    }

    if (paginationError) {
        throw paginationError;
    }

    await getDatabases().deleteDocument({
        databaseId: DATABASE_ID,
        collectionId: SERVERS_COLLECTION_ID,
        documentId: serverId,
    });
}
