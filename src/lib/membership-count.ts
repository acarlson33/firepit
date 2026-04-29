import { Query } from "appwrite";
import { getEnvConfig } from "./appwrite-core";
import { listPages } from "./appwrite-pagination";
import { logger } from "@/lib/newrelic-utils";

type MemberCountDatabases = {
    listDocuments: {
        (
            databaseId: string,
            collectionId: string,
            queries?: string[],
        ): Promise<{ total: number; documents?: Array<Record<string, unknown>> }>;
        (params: {
            databaseId: string;
            collectionId: string;
            queries?: string[];
        }): Promise<{ total: number; documents?: Array<Record<string, unknown>> }>;
    };
};

/**
 * Gets the actual member count for a server by querying the memberships collection.
 * This is the single source of truth for member counts.
 *
 * @param {{ listDocuments: { (databaseId: string, collectionId: string, queries?: string[] | undefined): Promise<{ total: number; }>; (params: { databaseId: string; collectionId: string; queries?: string[] | undefined; }): Promise<{ total: number; }>; }; }} databases - The databases value.
 * @param {string} serverId - The server id value.
 * @returns {Promise<number>} The return value.
 */
export async function getActualMemberCount(
    databases: MemberCountDatabases,
    serverId: string,
): Promise<number> {
    const env = getEnvConfig();
    const membershipsCollectionId = env.collections.memberships;

    if (!membershipsCollectionId) {
        return 0;
    }

    try {
        const result = await databases.listDocuments(
            env.databaseId,
            membershipsCollectionId,
            [Query.equal("serverId", serverId), Query.limit(1)],
        );
        return result.total;
    } catch {
        return 0;
    }
}

/**
 * Gets actual member counts for multiple servers with batched membership scans.
 * Falls back to an empty map if memberships are unavailable.
 *
 * @param {{ listDocuments: { (databaseId: string, collectionId: string, queries?: string[] | undefined): Promise<{ total: number; }>; (params: { databaseId: string; collectionId: string; queries?: string[] | undefined; }): Promise<{ total: number; }>; }; }} databases - The databases value.
 * @param {string[]} serverIds - The server ids value.
 * @returns {Promise<Map<string, number>>} The return value.
 */
export async function getActualMemberCounts(
    databases: MemberCountDatabases,
    serverIds: string[],
): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const uniqueServerIds = [...new Set(serverIds.filter(Boolean))];
    const env = getEnvConfig();
    const membershipsCollectionId = env.collections.memberships;

    for (const serverId of uniqueServerIds) {
        counts.set(serverId, 0);
    }

    if (!membershipsCollectionId || uniqueServerIds.length === 0) {
        return counts;
    }

    const pageSize = 1000;

    try {
        const { documents, truncated } = await listPages({
            databases,
            databaseId: env.databaseId,
            collectionId: membershipsCollectionId,
            baseQueries: [Query.equal("serverId", uniqueServerIds)],
            pageSize,
            warningContext: "membership-count",
        });

        if (truncated) {
            logger.warn("membership-count: membership scan truncated", {
                collectionId: membershipsCollectionId,
                pageSize,
            });
        }

        for (const document of documents) {
            const serverId = typeof document.serverId === "string" ? document.serverId : undefined;
            if (!serverId || !counts.has(serverId)) {
                continue;
            }
            counts.set(serverId, (counts.get(serverId) ?? 0) + 1);
        }
    } catch {
        return counts;
    }

    return counts;
}
