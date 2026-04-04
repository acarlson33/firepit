import { ID, Query } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import {
    FEATURE_FLAGS,
    getFeatureFlagDescription,
    type FeatureFlagKey,
} from "./feature-flags-definitions";
import { logger } from "./newrelic-utils";
import { getServerClient } from "./appwrite-server";
import type { FeatureFlag } from "./types";

export {
    FEATURE_FLAGS,
    getFeatureFlagDescription,
} from "./feature-flags-definitions";
export type { FeatureFlagKey } from "./feature-flags-definitions";

// Default values for feature flags
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: true,
};

// Cache for feature flags to reduce database calls
const flagCache = new Map<string, { value: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Returns the effective enabled state for a feature flag.
 * Checks the in-memory cache first (1-minute TTL), then queries the database,
 * and falls back to configured defaults when the flag is not present.
 */
export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
    // Check cache first
    const cached = flagCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }

    const { databases } = getServerClient();
    const { databaseId, collections } = getEnvConfig();

    try {
        const response = await databases.listDocuments(
            databaseId,
            collections.featureFlags,
            [Query.equal("key", key), Query.limit(1)],
        );

        if (response.documents.length > 0) {
            const flag = response.documents[0] as unknown as FeatureFlag;
            const value = flag.enabled;

            // Update cache
            flagCache.set(key, { value, timestamp: Date.now() });

            return value;
        }
    } catch (error) {
        logger.error(`Failed to get feature flag ${key}:`, {
            error,
        });
    }

    // Return default value if not found or error
    return DEFAULT_FLAGS[key] ?? false;
}

/**
 * Fetches all stored feature flags from Appwrite.
 * The Promise resolves to an array of FeatureFlag objects.
 * On query or connectivity failures (for example network errors or an unavailable
 * Appwrite connection), this function logs the error and resolves to an empty array.
 *
 * @returns {Promise<FeatureFlag[]>} Resolves to all known flags; resolves to [] when loading fails.
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
    const { databases } = getServerClient();
    const { databaseId, collections } = getEnvConfig();

    try {
        const response = await databases.listDocuments(
            databaseId,
            collections.featureFlags,
            [Query.limit(100)],
        );

        return response.documents as unknown as FeatureFlag[];
    } catch (error) {
        logger.error("Failed to get all feature flags:", {
            error,
        });
        return [];
    }
}

/**
 * Updates an existing feature flag (server/admin path) and invalidates its cache entry.
 * Returns true when the flag update succeeds, or false when persistence fails.
 * The userId is required to record who performed the change in audit fields.
 *
 * @param key - Existing feature flag key to update.
 * @param enabled - Desired enabled state for the flag.
 * @param userId - Identifier of the actor used for updatedBy audit tracking.
 * @returns Resolves to true on successful update, otherwise false.
 */
export async function setFeatureFlag(
    key: FeatureFlagKey,
    enabled: boolean,
    userId: string,
): Promise<boolean> {
    const { databases } = getServerClient();
    const { databaseId, collections } = getEnvConfig();

    try {
        // Check if the flag already exists
        const response = await databases.listDocuments(
            databaseId,
            collections.featureFlags,
            [Query.equal("key", key), Query.limit(1)],
        );

        const now = new Date().toISOString();

        if (response.documents.length === 0) {
            logger.warn("Feature flag update skipped: flag not initialized", {
                key,
                userId,
            });
            return false;
        }

        // Runtime admin updates are update-only. Flags are created in setup.
        const flagId = response.documents[0].$id;
        await databases.updateDocument(
            databaseId,
            collections.featureFlags,
            flagId,
            {
                enabled,
                updatedAt: now,
                updatedBy: userId,
            },
        );

        // Clear cache for this flag
        flagCache.delete(key);

        return true;
    } catch (error) {
        logger.error("Failed to update feature flag", {
            key,
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/**
 * Initializes missing feature flags with default values for the current deployment.
 *
 * @param {string} userId - Unique identifier of the user recorded as the creator/updater during initialization.
 * @returns {Promise<void>} Resolves when initialization and any required upserts complete.
 */
export async function initializeFeatureFlags(userId: string): Promise<void> {
    const { databases } = getServerClient();
    const { databaseId, collections } = getEnvConfig();
    const existingFlags = await getAllFeatureFlags();
    const existingKeys = new Set(existingFlags.map((f) => f.key));
    const failedKeys: string[] = [];

    // Create any missing flags with default values
    for (const [key, defaultValue] of Object.entries(DEFAULT_FLAGS)) {
        if (!existingKeys.has(key)) {
            const featureKey = key as FeatureFlagKey;
            try {
                await databases.createDocument(
                    databaseId,
                    collections.featureFlags,
                    ID.unique(),
                    {
                        key: featureKey,
                        enabled: defaultValue,
                        description: getFeatureFlagDescription(featureKey),
                        updatedAt: new Date().toISOString(),
                        updatedBy: userId,
                    },
                );
            } catch (error) {
                failedKeys.push(featureKey);
                logger.error("Failed to initialize feature flag", {
                    key: featureKey,
                    userId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    if (failedKeys.length > 0) {
        throw new Error(
            `Failed to initialize feature flags: ${failedKeys.join(", ")}`,
        );
    }
}

/**
 * Clear the feature flags cache
 */
export function clearFeatureFlagsCache(): void {
    flagCache.clear();
}
