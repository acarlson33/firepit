import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";
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
    databases: Databases,
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
            [Query.equal("serverId", serverId), Query.limit(1)]
        );
        return result.total;
    } catch {
        return 0;
    }
}

/**
 * Updates the cached memberCount field on a server document to match the actual count.
 * This ensures the cached value stays in sync with reality.
 * 
 * @param databases - Appwrite Databases instance
 * @param serverId - Server ID to update
 * @returns The updated member count, or null if update failed
 */
export async function syncServerMemberCount(
    databases: Databases,
    serverId: string
): Promise<number | null> {
    const env = getEnvConfig();
    const actualCount = await getActualMemberCount(databases, serverId);
    
    try {
        await databases.updateDocument(
            env.databaseId,
            env.collections.servers,
            serverId,
            { memberCount: actualCount }
        );
        return actualCount;
    } catch {
        return null;
    }
}
