import { Query } from "node-appwrite";
import { getEnvConfig } from "./appwrite-core";

type MemberCountDatabases = {
    listDocuments: {
        (
            databaseId: string,
            collectionId: string,
            queries?: string[],
        ): Promise<{ total: number }>;
        (params: {
            databaseId: string;
            collectionId: string;
            queries?: string[];
        }): Promise<{ total: number }>;
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
    let cursorAfter: string | undefined;

    try {
        while (true) {
            const queries = [
                Query.equal("serverId", uniqueServerIds),
                Query.limit(pageSize),
                Query.orderAsc("$id"),
            ];

            if (cursorAfter) {
                queries.push(Query.cursorAfter(cursorAfter));
            }

            const result = await databases.listDocuments(
                env.databaseId,
                membershipsCollectionId,
                queries,
            );

            const documents =
                (
                    result as unknown as {
                        documents?: Array<Record<string, unknown>>;
                    }
                ).documents ?? [];

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

            if (documents.length < pageSize) {
                break;
            }

            const lastDocument = documents.at(-1);
            if (!lastDocument || typeof lastDocument.$id !== "string") {
                break;
            }

            cursorAfter = lastDocument.$id;
        }
    } catch {
        return counts;
    }

    return counts;
}
