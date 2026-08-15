import { Query } from "appwrite";

import type { UserStatus } from "./types";
import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";
import { normalizeStatus } from "./status-normalization";

/**
 * Returns config.
 * @returns {ReturnType<typeof getEnvConfig>} The return value.
 */
function getConfig() {
    return getEnvConfig();
}

/**
 * Returns databases.
 * @returns {ReturnType<typeof getBrowserDatabases>} The return value.
 */
function getDatabases() {
    return getBrowserDatabases();
}

/**
 * Set or update user status (via server API)
 *
 * @param {string} userId - The user id value.
 * @param {'online' | 'away' | 'busy' | 'offline'} status - The status value.
 * @param {string | undefined} customMessage - The custom message value, if provided.
 * @param {string | undefined} expiresAt - The expires at value, if provided.
 * @param {boolean | undefined} isManuallySet - The is manually set value, if provided.
 * @returns {Promise<UserStatus>} The return value.
 */
export async function setUserStatus(
    userId: string,
    status: "online" | "away" | "busy" | "offline",
    customMessage?: string,
    expiresAt?: string,
    isManuallySet?: boolean,
): Promise<UserStatus> {
    const env = getConfig();
    const STATUSES_COLLECTION = env.collections.statuses;

    if (!STATUSES_COLLECTION) {
        throw new Error("Statuses collection not configured");
    }

    const response = await fetch("/api/status", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            userId,
            status,
            customMessage,
            expiresAt,
            isManuallySet,
        }),
    });

    if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as {
            details?: string;
            error?: string;
        } | null;
        throw new Error(
            errorData?.details ||
                errorData?.error ||
                `Failed to set user status (${response.status})`,
        );
    }

    const data = await response.json();
    const { normalized } = normalizeStatus(data);
    return normalized;
}

/**
 * Get status for a single user
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<UserStatus | null>} The return value.
 */
export async function getUserStatus(
    userId: string,
): Promise<UserStatus | null> {
    const env = getConfig();
    const DATABASE_ID = env.databaseId;
    const STATUSES_COLLECTION = env.collections.statuses;

    if (!STATUSES_COLLECTION) {
        return null;
    }

    try {
        const response = await getDatabases().listDocuments({
            databaseId: DATABASE_ID,
            collectionId: STATUSES_COLLECTION,
            queries: [Query.equal("userId", userId), Query.limit(1)],
        });

        if (response.documents.length === 0) {
            return null;
        }

        const doc = response.documents[0] as Record<string, unknown>;
        const { normalized } = normalizeStatus(doc);
        return normalized;
    } catch {
        return null;
    }
}

/**
 * Get statuses for multiple users (batch fetch)
 *
 * @param {string[]} userIds - The user ids value.
 * @returns {Promise<Map<string, UserStatus>>} The return value.
 */
export async function getUsersStatuses(
    userIds: string[],
): Promise<Map<string, UserStatus>> {
    const env = getConfig();
    const DATABASE_ID = env.databaseId;
    const STATUSES_COLLECTION = env.collections.statuses;

    if (!STATUSES_COLLECTION || userIds.length === 0) {
        return new Map();
    }

    try {
        const uniqueUserIds = [...new Set(userIds)];
        const chunks: string[][] = [];

        // Keep Query.limit(100) while chunking below it so users with multiple
        // status documents don't crowd out the rest of the chunk.
        const STATUS_CHUNK_SIZE = 50;

        for (let index = 0; index < uniqueUserIds.length; index += STATUS_CHUNK_SIZE) {
            chunks.push(uniqueUserIds.slice(index, index + STATUS_CHUNK_SIZE));
        }

        const responses = await Promise.all(
            chunks.map((chunk) =>
                getDatabases().listDocuments({
                    databaseId: DATABASE_ID,
                    collectionId: STATUSES_COLLECTION,
                    queries: [Query.equal("userId", chunk), Query.limit(100)],
                }),
            ),
        );

        const statusMap = new Map<string, UserStatus>();
        for (const response of responses) {
            for (const doc of response.documents) {
                const { normalized } = normalizeStatus(doc);
                if (!statusMap.has(normalized.userId)) {
                    statusMap.set(normalized.userId, normalized);
                }
            }
        }

        return statusMap;
    } catch {
        return new Map();
    }
}

/**
 * Update last seen timestamp (via server API)
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<void>} The return value.
 */
export async function updateLastSeen(userId: string): Promise<void> {
    const env = getConfig();
    const STATUSES_COLLECTION = env.collections.statuses;

    if (!STATUSES_COLLECTION) {
        return;
    }

    try {
        await fetch("/api/status", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId }),
        });
    } catch {
        // Ignore errors for last seen updates
    }
}

/**
 * Set user offline
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<void>} The return value.
 */
export async function setOffline(userId: string): Promise<void> {
    await setUserStatus(userId, "offline");
}
