import { Query } from "node-appwrite";
import { getEnvConfig } from "./appwrite-core";

/**
 * Gets the actual member count for a server by querying the memberships collection.
 * This is the single source of truth for member counts.
 * 
 * @param databases - Appwrite Databases instance
 * @param serverId - Server ID to count members for
 * @returns The actual number of members in the server
 */
export async function getActualMemberCount(
    databases: unknown,
    serverId: string
): Promise<number> {
    const env = getEnvConfig();
    const membershipsCollectionId = env.collections.memberships;
    
    if (!membershipsCollectionId) {
        return 0;
    }
    
    try {
        const db = databases as {
            listDocuments: (
                databaseId: string,
                collectionId: string,
                queries: string[],
            ) => Promise<{ total: number }>;
        };
        const query = [Query.equal("serverId", serverId), Query.limit(1)];
        const result = await db.listDocuments(
            env.databaseId,
            membershipsCollectionId,
            query,
        );
        return result.total;
    } catch {
        try {
            const db = databases as {
                listDocuments: (params: {
                    databaseId: string;
                    collectionId: string;
                    queries: string[];
                }) => Promise<{ total: number }>;
            };
            const query = [Query.equal("serverId", serverId), Query.limit(1)];
            const result = await db.listDocuments({
                databaseId: env.databaseId,
                collectionId: membershipsCollectionId,
                queries: query,
            });
            return result.total;
        } catch {
            return 0;
        }
    }
}
