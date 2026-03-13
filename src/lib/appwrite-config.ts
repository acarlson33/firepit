// Deprecated: replaced by getEnvConfig() in appwrite-core.
// Keep a minimal shim for backward compatibility until all imports removed.
import { getEnvConfig } from "./appwrite-core";

export type AppwriteIds = ReturnType<typeof getEnvConfig>["collections"] & {
  databaseId: string;
};

/**
 * Returns appwrite ids.
 * @returns { servers: string; channels: string; categories: string; messages: string; audit: string; typing: string; memberships: string; bannedUsers: string; mutedUsers: string; friendships: string; blocks: string; profiles: string; conversations: string; directMessages: string; statuses: string; messageAttachments: string; pinnedMessages: string; featureFlags: string; notificationSettings: string; inboxItems: string; threadReads: string; } & { databaseId: string; }.
 */
export function getAppwriteIds(): AppwriteIds {
  const env = getEnvConfig();
  return { databaseId: env.databaseId, ...env.collections } as AppwriteIds;
}

/**
 * Handles reset appwrite ids cache.
 * @returns {void} The return value.
 */
export function resetAppwriteIdsCache() {
  // No-op; env cache reset handled via resetEnvCache in core (not re-exported here).
}
