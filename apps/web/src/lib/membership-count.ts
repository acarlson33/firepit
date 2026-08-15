import { Query } from "appwrite";
import { getEnvConfig } from "./appwrite-core";
import { listPages, chunkValues } from "./appwrite-pagination";
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

// Appwrite array comparison queries cap at 100 values.
const MAX_ARRAY_QUERY_VALUES = 100;

export type MemberCountsResult = {
    counts: Map<string, number>;
    truncated: boolean;
    success: boolean;
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
    } catch (error) {
        logger.warn("membership-count: member count query failed", {
            serverId,
            errorMessage:
                error instanceof Error ? error.message : String(error),
        });
        return 0;
    }
}

/**
 * Gets actual member counts for multiple servers with batched membership scans.
 * Falls back to a map with a zero count for every requested server id if
 * memberships are unavailable. Callers should check `success` and `truncated`
 * before treating the counts as final (e.g. before persisting them).
 *
 * @param {{ listDocuments: { (databaseId: string, collectionId: string, queries?: string[] | undefined): Promise<{ total: number; }>; (params: { databaseId: string; collectionId: string; queries?: string[] | undefined; }): Promise<{ total: number; }>; }; }} databases - The databases value.
 * @param {string[]} serverIds - The server ids value.
 * @returns {Promise<MemberCountsResult>} The return value.
 */
export async function getActualMemberCounts(
    databases: MemberCountDatabases,
    serverIds: string[],
): Promise<MemberCountsResult> {
    const counts = new Map<string, number>();
    const uniqueServerIds = [...new Set(serverIds.filter(Boolean))];
    const env = getEnvConfig();
    const membershipsCollectionId = env.collections.memberships;

    for (const serverId of uniqueServerIds) {
        counts.set(serverId, 0);
    }

    if (uniqueServerIds.length === 0) {
        return { counts, truncated: false, success: true };
    }

    if (!membershipsCollectionId) {
        return { counts, truncated: false, success: false };
    }

    const pageSize = 1000;

    try {
        let truncated = false;
        for (const chunk of chunkValues(uniqueServerIds, MAX_ARRAY_QUERY_VALUES)) {
            const { documents, truncated: chunkTruncated } = await listPages({
                databases,
                databaseId: env.databaseId,
                collectionId: membershipsCollectionId,
                baseQueries: [Query.equal("serverId", chunk)],
                pageSize,
                warningContext: "membership-count",
            });
            truncated = truncated || chunkTruncated;

            for (const document of documents) {
                const serverId =
                    typeof document.serverId === "string"
                        ? document.serverId
                        : undefined;
                if (!serverId || !counts.has(serverId)) {
                    continue;
                }
                counts.set(serverId, (counts.get(serverId) ?? 0) + 1);
            }
        }

        if (truncated) {
            logger.warn("membership-count: membership scan truncated", {
                collectionId: membershipsCollectionId,
                pageSize,
            });
        }

        return { counts, truncated, success: true };
    } catch (error) {
        logger.warn("membership-count: membership scan failed", {
            collectionId: membershipsCollectionId,
            errorMessage:
                error instanceof Error ? error.message : String(error),
        });
        return { counts, truncated: false, success: false };
    }
}
