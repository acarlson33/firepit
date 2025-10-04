// Deprecated: replaced by getEnvConfig() in appwrite-core.
// Keep a minimal shim for backward compatibility until all imports removed.
import { getEnvConfig } from "./appwrite-core";

export type AppwriteIds = ReturnType<typeof getEnvConfig>["collections"] & {
  databaseId: string;
};

export function getAppwriteIds(): AppwriteIds {
  const env = getEnvConfig();
  return { databaseId: env.databaseId, ...env.collections } as AppwriteIds;
}

export function resetAppwriteIdsCache() {
  // No-op; env cache reset handled via resetEnvCache in core (not re-exported here).
}
