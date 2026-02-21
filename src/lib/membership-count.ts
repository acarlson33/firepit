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
 * @param databases - Appwrite Databases instance
 * @param serverId - Server ID to count members for
 * @returns The actual number of members in the server
 */
export async function getActualMemberCount(
    databases: MemberCountDatabases,
    serverId: string
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
