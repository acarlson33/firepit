import { AppwriteException, Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import type { EnvConfig } from "@/lib/appwrite-core";
import { getEffectivePermissions } from "@/lib/permissions";
import type {
    ChannelPermissionOverride,
    EffectivePermissions,
    Role,
} from "@/lib/types";

const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";
const ROLES_COLLECTION_ID = "roles";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID =
    "channel_permission_overrides";
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

type ChannelAccess = {
    serverId: string;
    isServerOwner: boolean;
    isMember: boolean;
    canRead: boolean;
    canSend: boolean;
};

type ServerAccess = {
    serverId: string;
    isServerOwner: boolean;
    isMember: boolean;
    permissions: EffectivePermissions;
    roleIds: string[];
    roles: Role[];
};

/**
 * Handles map role document.
 *
 * @param {{ [x: string]: unknown; }} doc - The doc value.
 * @returns {Role} The return value.
 */
function mapRoleDocument(doc: Record<string, unknown>): Role {
    return {
        $id: String(doc.$id),
        serverId: String(doc.serverId),
        name: String(doc.name),
        color: String(doc.color ?? "#6B7280"),
        position: typeof doc.position === "number" ? doc.position : 0,
        readMessages: Boolean(doc.readMessages),
        sendMessages: Boolean(doc.sendMessages),
        manageMessages: Boolean(doc.manageMessages),
        manageChannels: Boolean(doc.manageChannels),
        manageRoles: Boolean(doc.manageRoles),
        manageServer: Boolean(doc.manageServer),
        mentionEveryone: Boolean(doc.mentionEveryone),
        administrator: Boolean(doc.administrator),
        mentionable: Boolean(doc.mentionable),
        $createdAt: String(doc.$createdAt ?? ""),
        memberCount:
            typeof doc.memberCount === "number" ? doc.memberCount : undefined,
    } satisfies Role;
}

const NO_PERMISSIONS: EffectivePermissions = {
    readMessages: false,
    sendMessages: false,
    manageMessages: false,
    manageChannels: false,
    manageRoles: false,
    manageServer: false,
    mentionEveryone: false,
    administrator: false,
};

const ACCESS_CACHE_TTL_MS = 5 * 1000;
const MAX_ACCESS_CACHE_SIZE = 1000;

type CachedAccessEntry<T> = {
    value: T;
    expiresAt: number;
};

const serverAccessCache = new Map<string, CachedAccessEntry<ServerAccess>>();
const pendingServerAccess = new Map<string, Promise<ServerAccess>>();
const channelAccessCache = new Map<string, CachedAccessEntry<ChannelAccess>>();
const pendingChannelAccess = new Map<string, Promise<ChannelAccess>>();
const QUERY_ARRAY_LIMIT = 100;

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

function canUseAccessCache(): boolean {
    return process.env.NODE_ENV !== "test";
}

function getCachedAccess<T>(
    cache: Map<string, CachedAccessEntry<T>>,
    pending: Map<string, Promise<T>>,
    key: string,
): T | null {
    const entry = cache.get(key);
    if (!entry) {
        return null;
    }

    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        pending.delete(key);
        return null;
    }

    // LRU refresh for active entries.
    cache.delete(key);
    cache.set(key, entry);

    return entry.value;
}

function sweepExpiredAccessEntries<T>(
    cache: Map<string, CachedAccessEntry<T>>,
    pending: Map<string, Promise<T>>,
): void {
    const now = Date.now();

    for (const [key, entry] of cache.entries()) {
        if (entry.expiresAt <= now) {
            cache.delete(key);
            pending.delete(key);
        }
    }
}

function setCachedAccess<T>(
    cache: Map<string, CachedAccessEntry<T>>,
    pending: Map<string, Promise<T>>,
    key: string,
    value: T,
): void {
    sweepExpiredAccessEntries(cache, pending);

    if (cache.has(key)) {
        cache.delete(key);
    }

    while (cache.size >= MAX_ACCESS_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (typeof oldestKey !== "string") {
            break;
        }

        cache.delete(oldestKey);
        pending.delete(oldestKey);
    }

    cache.set(key, {
        value,
        expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
    });
}

function resolveWithAccessCache<T>(
    key: string,
    cache: Map<string, CachedAccessEntry<T>>,
    pending: Map<string, Promise<T>>,
    fetcher: () => Promise<T>,
): Promise<T> {
    if (!canUseAccessCache()) {
        return fetcher();
    }

    const cached = getCachedAccess(cache, pending, key);
    if (cached !== null) {
        return Promise.resolve(cached);
    }

    const pendingRequest = pending.get(key);
    if (pendingRequest) {
        return pendingRequest;
    }

    const promise = fetcher()
        .then((value) => {
            setCachedAccess(cache, pending, key, value);
            pending.delete(key);
            return value;
        })
        .catch((error: unknown) => {
            pending.delete(key);
            throw error;
        });

    pending.set(key, promise);
    return promise;
}

function getServerAccessCacheKey(
    env: EnvConfig,
    serverId: string,
    userId: string,
): string {
    return `${env.databaseId}:server:${serverId}:user:${userId}`;
}

function getChannelAccessCacheKey(
    env: EnvConfig,
    channelId: string,
    userId: string,
): string {
    return `${env.databaseId}:channel:${channelId}:user:${userId}`;
}

/**
 * Returns role ids for user.
 *
 * @param {Databases} databases - The databases value.
 * @param {EnvConfig} env - The env value.
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<string[]>} The return value.
 */
async function getRoleIdsForUser(
    databases: Databases,
    env: EnvConfig,
    serverId: string,
    userId: string,
): Promise<string[]> {
    const roleAssignment = await databases.listDocuments(
        env.databaseId,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
        ],
    );

    return roleAssignment.documents.length > 0 &&
        Array.isArray(roleAssignment.documents[0].roleIds)
        ? (roleAssignment.documents[0].roleIds as string[])
        : [];
}

/**
 * Returns roles by ids.
 *
 * @param {Databases} databases - The databases value.
 * @param {EnvConfig} env - The env value.
 * @param {string} serverId - The server id value.
 * @param {string[]} roleIds - The role ids value.
 * @returns {Promise<Role[]>} The return value.
 */
async function getRolesByIds(
    databases: Databases,
    env: EnvConfig,
    serverId: string,
    roleIds: string[],
): Promise<Role[]> {
    if (roleIds.length === 0) {
        return [];
    }

    const roleIdChunks = chunkValues(roleIds, QUERY_ARRAY_LIMIT);
    const rolePages = await Promise.all(
        roleIdChunks.map((roleIdChunk) =>
            databases.listDocuments(
                env.databaseId,
                ROLES_COLLECTION_ID,
                [
                    Query.equal("serverId", serverId),
                    Query.equal("$id", roleIdChunk),
                    Query.limit(roleIdChunk.length),
                ],
            ),
        ),
    );

    const rolesById = new Map<string, Role>();
    for (const rolePage of rolePages) {
        for (const doc of rolePage.documents) {
            const mapped = mapRoleDocument(doc as Record<string, unknown>);
            rolesById.set(mapped.$id, mapped);
        }
    }

    return roleIds.flatMap((roleId) => {
        const role = rolesById.get(roleId);
        return role ? [role] : [];
    });
}

/**
 * Returns base server access.
 *
 * @param {Databases} databases - The databases value.
 * @param {EnvConfig} env - The env value.
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<{ isServerOwner: boolean; isMember: boolean; roleIds: string[]; roles: Role[]; }>} The return value.
 */
async function getBaseServerAccess(
    databases: Databases,
    env: EnvConfig,
    serverId: string,
    userId: string,
): Promise<{
    isServerOwner: boolean;
    isMember: boolean;
    roleIds: string[];
    roles: Role[];
}> {
    const [server, membership] = await Promise.all([
        databases.getDocument(
            env.databaseId,
            env.collections.servers,
            serverId,
        ),
        databases.listDocuments(env.databaseId, env.collections.memberships, [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]),
    ]);

    const isServerOwner = String(server.ownerId) === userId;
    if (isServerOwner) {
        return {
            isServerOwner: true,
            isMember: true,
            roleIds: [],
            roles: [],
        };
    }

    if (membership.documents.length === 0) {
        return {
            isServerOwner: false,
            isMember: false,
            roleIds: [],
            roles: [],
        };
    }

    const roleIds = await getRoleIdsForUser(databases, env, serverId, userId);
    const roles = await getRolesByIds(databases, env, serverId, roleIds);

    return {
        isServerOwner: false,
        isMember: true,
        roleIds,
        roles,
    };
}

/**
 * Returns server permissions for user.
 *
 * @param {Databases} databases - The databases value.
 * @param {EnvConfig} env - The env value.
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<ServerAccess>} The return value.
 */
async function computeServerPermissionsForUser(
    databases: Databases,
    env: EnvConfig,
    serverId: string,
    userId: string,
): Promise<ServerAccess> {
    const baseAccess = await getBaseServerAccess(
        databases,
        env,
        serverId,
        userId,
    );

    if (baseAccess.isServerOwner) {
        return {
            serverId,
            isServerOwner: true,
            isMember: true,
            permissions: getEffectivePermissions([], [], true),
            roleIds: [],
            roles: [],
        };
    }

    if (!baseAccess.isMember) {
        return {
            serverId,
            isServerOwner: false,
            isMember: false,
            permissions: NO_PERMISSIONS,
            roleIds: [],
            roles: [],
        };
    }

    return {
        serverId,
        isServerOwner: false,
        isMember: true,
        permissions: getEffectivePermissions(baseAccess.roles, [], false),
        roleIds: baseAccess.roleIds,
        roles: baseAccess.roles,
    };
}

export async function getServerPermissionsForUser(
    databases: Databases,
    env: EnvConfig,
    serverId: string,
    userId: string,
): Promise<ServerAccess> {
    return resolveWithAccessCache(
        getServerAccessCacheKey(env, serverId, userId),
        serverAccessCache,
        pendingServerAccess,
        () => computeServerPermissionsForUser(databases, env, serverId, userId),
    );
}

/**
 * Returns whether user has access to a category based on required role.
 *
 * @param {Databases} databases - The databases value.
 * @param {EnvConfig} env - The env value.
 * @param {string} categoryId - The category id value.
 * @param {ServerAccess} serverAccess - The server access value.
 * @returns {Promise<boolean>} The return value.
 */
async function hasAccessToCategory(
    databases: Databases,
    env: EnvConfig,
    categoryId: string,
    serverAccess: ServerAccess,
): Promise<boolean> {
    if (serverAccess.isServerOwner) {
        return true;
    }

    try {
        const category = await databases.getDocument(
            env.databaseId,
            env.collections.categories,
            categoryId,
        );

        const allowedRoleIds = Array.isArray(category.allowedRoleIds)
            ? (category.allowedRoleIds as string[])
            : undefined;
        if (!allowedRoleIds || allowedRoleIds.length === 0) {
            return true;
        }

        return allowedRoleIds.some((roleId) =>
            serverAccess.roleIds.includes(roleId),
        );
    } catch (error) {
        // Fail closed on missing category documents to avoid over-permissive access.
        if (error instanceof AppwriteException && error.code === 404) {
            return false;
        }
        throw error;
    }
}

/**
 * Returns channel access for user.
 *
 * @param {Databases} databases - The databases value.
 * @param {EnvConfig} env - The env value.
 * @param {string} channelId - The channel id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<ChannelAccess>} The return value.
 */
async function computeChannelAccessForUser(
    databases: Databases,
    env: EnvConfig,
    channelId: string,
    userId: string,
): Promise<ChannelAccess> {
    const channel = await databases.getDocument(
        env.databaseId,
        env.collections.channels,
        channelId,
    );
    const channelType = normalizeChannelType(channel.type);
    const isAnnouncementChannel = channelType === "announcement";

    const serverId = String(channel.serverId);
    const serverAccess = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        userId,
    );

    if (!serverAccess.isMember) {
        return {
            serverId,
            isServerOwner: serverAccess.isServerOwner,
            isMember: false,
            canRead: false,
            canSend: false,
        };
    }

    if (serverAccess.isServerOwner || serverAccess.permissions.administrator) {
        return {
            serverId,
            isServerOwner: serverAccess.isServerOwner,
            isMember: true,
            canRead: true,
            canSend: true,
        };
    }

    if (channel.categoryId) {
        const categoryAccess = await hasAccessToCategory(
            databases,
            env,
            String(channel.categoryId),
            serverAccess,
        );
        if (!categoryAccess) {
            return {
                serverId,
                isServerOwner: false,
                isMember: true,
                canRead: false,
                canSend: false,
            };
        }
    }

    const overrides = await databases.listDocuments(
        env.databaseId,
        CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
        [Query.equal("channelId", channelId), Query.limit(1000)],
    );

    const applicableOverrides: ChannelPermissionOverride[] = [];
    for (const doc of overrides.documents) {
        const d = doc as Record<string, unknown>;
        const roleId = typeof d.roleId === "string" ? d.roleId : "";
        const overrideUserId = typeof d.userId === "string" ? d.userId : "";

        const appliesToUser = overrideUserId === userId;
        const appliesToRole =
            roleId !== "" && serverAccess.roleIds.includes(roleId);
        if (!appliesToUser && !appliesToRole) {
            continue;
        }

        applicableOverrides.push({
            $id: String(d.$id),
            channelId,
            roleId,
            userId: overrideUserId,
            allow: Array.isArray(d.allow)
                ? (d.allow as ChannelPermissionOverride["allow"])
                : [],
            deny: Array.isArray(d.deny)
                ? (d.deny as ChannelPermissionOverride["deny"])
                : [],
            $createdAt: String(d.$createdAt ?? ""),
        });
    }

    const effective = getEffectivePermissions(
        serverAccess.roles,
        applicableOverrides,
        false,
    );

    const canRead = effective.readMessages;
    const canSend = isAnnouncementChannel
        ? canRead && effective.manageChannels
        : canRead && effective.sendMessages;

    return {
        serverId,
        isServerOwner: false,
        isMember: true,
        canRead,
        canSend,
    };
}

export async function getChannelAccessForUser(
    databases: Databases,
    env: EnvConfig,
    channelId: string,
    userId: string,
): Promise<ChannelAccess> {
    return resolveWithAccessCache(
        getChannelAccessCacheKey(env, channelId, userId),
        channelAccessCache,
        pendingChannelAccess,
        () => computeChannelAccessForUser(databases, env, channelId, userId),
    );
}

export function clearServerChannelAccessCache(): void {
    serverAccessCache.clear();
    pendingServerAccess.clear();
    channelAccessCache.clear();
    pendingChannelAccess.clear();
}
