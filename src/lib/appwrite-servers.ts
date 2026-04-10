import { ID, Permission, Query, Role } from "appwrite";

import {
    getBrowserDatabases,
    getEnvConfig,
    normalizeError,
    withSession,
} from "./appwrite-core";
import type { Channel, ChannelCategory, Membership, Server } from "./types";
import { assignDefaultRoleBrowser } from "./default-role";
import {
    getActualMemberCount,
    getActualMemberCounts,
} from "./membership-count";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
const CATEGORIES_COLLECTION_ID = env.collections.categories;
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
            throw normalizeError(
                new Error(
                    `Failed to verify server creation policy (${response.status}). Contact an administrator.`,
                ),
            );
        }

        const payload = (await response.json().catch(() => null)) as
            | { enabled?: unknown }
            | null;
        if (payload?.enabled !== true) {
            throw normalizeError(
                new Error(
                    "Server creation is currently disabled. Contact an administrator.",
                ),
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
 * Lists servers.
 *
 * @param {number} limit - The limit value, if provided.
 * @returns {Promise<Server[]>} The return value.
 */
export async function listServers(limit = 25): Promise<Server[]> {
    const databases = getDatabases();
    const res = await databases.listDocuments({
        databaseId: DATABASE_ID,
        collectionId: SERVERS_COLLECTION_ID,
        // Use system attribute $createdAt for ordering to avoid schema attribute requirement
        queries: [
            Query.limit(Math.min(limit, 100)),
            Query.orderAsc("$createdAt"),
        ],
    });

    const memberCounts = await getActualMemberCounts(
        databases,
        res.documents.map((doc) => String(doc.$id)),
    );

    const servers = res.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
            $id: String(d.$id),
            name: String(d.name),
            $createdAt: String(d.$createdAt ?? ""),
            ownerId: String(d.ownerId),
            memberCount: memberCounts.get(String(d.$id)) ?? 0,
        } satisfies Server;
    });

    return servers;
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
        return {
            $id: String(d.$id),
            name: String(d.name),
            $createdAt: String(d.$createdAt ?? ""),
            ownerId: String(d.ownerId),
            memberCount: memberCounts.get(String(d.$id)) ?? 0,
        } satisfies Server;
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
export function createServer(
    name: string,
    options?: { bypassFeatureCheck?: boolean },
): Promise<Server> {
    return withSession(async ({ userId }) => {
        const ownerId = userId;

        // Check feature flag for browser calls unless bypassed.
        if (!options?.bypassFeatureCheck) {
            await assertUserServerCreationEnabled();
        }

        try {
            const permissions = [
                Permission.read(Role.any()),
                Permission.update(Role.user(ownerId)),
                Permission.delete(Role.user(ownerId)),
            ];
            const serverDoc = await getDatabases().createDocument({
                databaseId: DATABASE_ID,
                collectionId: SERVERS_COLLECTION_ID,
                documentId: ID.unique(),
                data: { name, ownerId },
                permissions,
            });
            const s = serverDoc as unknown as Record<string, unknown>;
            const membershipsCollectionId = getMembershipsCollectionId();
            if (membershipsCollectionId) {
                try {
                    const membershipPerms = [
                        Permission.read(Role.any()),
                        Permission.update(Role.user(ownerId)),
                        Permission.delete(Role.user(ownerId)),
                    ];
                    await getDatabases().createDocument({
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
            const actualMemberCount = await getActualMemberCount(
                getDatabases(),
                String(s.$id),
            );

            return {
                $id: String(s.$id),
                name: String(s.name),
                $createdAt: String(s.$createdAt ?? ""),
                ownerId: String(s.ownerId),
                memberCount: actualMemberCount,
            } satisfies Server;
        } catch (e) {
            throw normalizeError(e);
        }
    });
}

/**
 * Lists channels.
 *
 * @param {string} serverId - The server id value.
 * @param {number} limit - The limit value, if provided.
 * @returns {Promise<Channel[]>} The return value.
 */
export async function listChannels(
    serverId: string,
    limit = 100,
): Promise<Channel[]> {
    const res = await getDatabases().listDocuments({
        databaseId: DATABASE_ID,
        collectionId: CHANNELS_COLLECTION_ID,
        queries: [
            Query.equal("serverId", serverId),
            Query.limit(limit),
            Query.orderAsc("$createdAt"),
        ],
    });
    return res.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
            $id: String(d.$id),
            serverId: String(d.serverId),
            name: String(d.name),
            categoryId:
                typeof d.categoryId === "string" ? d.categoryId : undefined,
            position: typeof d.position === "number" ? d.position : undefined,
            $createdAt: String(d.$createdAt ?? ""),
            $updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
        } satisfies Channel;
    });
}

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
): Promise<Channel> {
    const permissions = [Permission.read(Role.any())];
    const res = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: CHANNELS_COLLECTION_ID,
        documentId: ID.unique(),
        data: { serverId, name, position: 0 },
        permissions,
    });
    const d = res as unknown as Record<string, unknown>;
    return {
        $id: String(d.$id),
        serverId: String(d.serverId),
        name: String(d.name),
        categoryId: typeof d.categoryId === "string" ? d.categoryId : undefined,
        position: typeof d.position === "number" ? d.position : undefined,
        $createdAt: String(d.$createdAt ?? ""),
        $updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
    } satisfies Channel;
}

/**
 * Lists categories.
 *
 * @param {string} serverId - The server id value.
 * @param {number} limit - The limit value, if provided.
 * @returns {Promise<ChannelCategory[]>} The return value.
 */
export async function listCategories(
    serverId: string,
    limit = 100,
): Promise<ChannelCategory[]> {
    const res = await getDatabases().listDocuments({
        databaseId: DATABASE_ID,
        collectionId: CATEGORIES_COLLECTION_ID,
        queries: [
            Query.equal("serverId", serverId),
            Query.limit(limit),
            Query.orderAsc("position"),
        ],
    });

    return res.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
            $id: String(d.$id),
            serverId: String(d.serverId),
            name: String(d.name),
            position: typeof d.position === "number" ? d.position : 0,
            createdBy:
                typeof d.createdBy === "string" ? d.createdBy : undefined,
            $createdAt: String(d.$createdAt ?? ""),
            $updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
        } satisfies ChannelCategory;
    });
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
    return res.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
            $id: String(d.$id),
            serverId: String(d.serverId),
            userId: String(d.userId),
            role: d.role as "owner" | "member",
            $createdAt: String(d.$createdAt ?? ""),
        } satisfies Membership;
    });
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
    const d = res as unknown as Record<string, unknown>;
    try {
        await assignDefaultRoleBrowser(serverId, userId);
    } catch {
        // Non-fatal: continue even if role assignment fails
    }
    return {
        $id: String(d.$id),
        serverId: String(d.serverId),
        userId: String(d.userId),
        role: d.role as "owner" | "member",
        $createdAt: String(d.$createdAt ?? ""),
    } satisfies Membership;
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
    // Best effort delete channels first
    try {
        const chans = await getDatabases().listDocuments({
            databaseId: DATABASE_ID,
            collectionId: CHANNELS_COLLECTION_ID,
            queries: [
                Query.equal("serverId", serverId),
                Query.limit(MAX_LIST_LIMIT),
            ],
        });
        for (const c of chans.documents) {
            const id = String((c as unknown as Record<string, unknown>).$id);

            await deleteChannel(id);
        }
    } catch {
        // ignore
    }
    await getDatabases().deleteDocument({
        databaseId: DATABASE_ID,
        collectionId: SERVERS_COLLECTION_ID,
        documentId: serverId,
    });
}
