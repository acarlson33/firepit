// Deprecated: replaced by getEnvConfig() in appwrite-core.
// Keep a minimal shim for backward compatibility until all imports removed.
import { getEnvConfig } from "./appwrite-core";

export type AppwriteIds = ReturnType<typeof getEnvConfig>["collections"] & {
    databaseId: string;
};

/**
 * Returns appwrite ids.
 * @returns {AppwriteIds} Appwrite collection ids plus databaseId.
 */
export function getAppwriteIds(): AppwriteIds {
    const env = getEnvConfig();
    return { databaseId: env.databaseId, ...env.collections } as AppwriteIds;
}

/**
 * Compatibility shim: this function is intentionally a no-op and does not reset any cache.
 * Use resetEnvCache from appwrite-core when a real env/cache reset is required.
 */
export function resetAppwriteIdsCache() {
    // No-op; env cache reset handled via resetEnvCache in core (not re-exported here).
}
