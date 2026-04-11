import { Query } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import type { FeatureFlag } from "./types";

// Known feature flag keys
export const FEATURE_FLAGS = {
    ALLOW_USER_SERVERS: "allow_user_servers",
    ENABLE_AUDIT_LOGGING: "enable_audit_logging",
    ENABLE_PER_MESSAGE_UNREAD: "enable_per_message_unread",
    ENABLE_INBOX_DIGEST: "enable_inbox_digest",
    ENABLE_INBOX_DIGEST_V1_5: "enable_inbox_digest_v1_5",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

// Default values for feature flags
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: true,
    [FEATURE_FLAGS.ENABLE_PER_MESSAGE_UNREAD]: false,
    [FEATURE_FLAGS.ENABLE_INBOX_DIGEST]: false,
    [FEATURE_FLAGS.ENABLE_INBOX_DIGEST_V1_5]: false,
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
        console.error(`Failed to get feature flag ${key}:`, error);
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
        console.error("Failed to get all feature flags:", error);
        return [];
    }
}

/**
 * Creates or updates a feature flag (server/admin path) and invalidates its cache entry.
 * Returns true when the flag write succeeds, or false when persistence fails.
 * The userId is required to record who performed the change in audit fields.
 *
 * @param key - Feature flag key to create or update.
 * @param enabled - Desired enabled state for the flag.
 * @param userId - Identifier of the actor used for updatedBy audit tracking.
 * @returns Resolves to true on successful create/update, otherwise false.
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

        if (response.documents.length > 0) {
            // Update existing flag
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
        } else {
            // Create new flag
            await databases.createDocument(
                databaseId,
                collections.featureFlags,
                "unique()",
                {
                    key,
                    enabled,
                    description: getFeatureFlagDescription(key),
                    updatedAt: now,
                    updatedBy: userId,
                },
            );
        }

        // Clear cache for this flag
        flagCache.delete(key);

        return true;
    } catch (error) {
        console.error(`Failed to set feature flag ${key}:`, error);
        return false;
    }
}

/**
 * Returns a human-readable description for getFeatureFlagDescription keys.
 * Key descriptions:
 * - allow_user_servers: Allow members to create their own servers.
 * - enable_audit_logging: Enable audit logging for moderation actions.
 * - enable_per_message_unread: Enable per-message unread inbox semantics.
 * - enable_inbox_digest: Enable inbox digest API payloads.
 * - enable_inbox_digest_v1_5: Enable inbox digest v1.5 rollout behavior.
 * Unknown keys return an empty string.
 *
 * @param {FeatureFlagKey} key - Feature key to describe.
 * @returns {string} Human-readable description, or an empty string for unknown keys.
 */
export function getFeatureFlagDescription(key: FeatureFlagKey): string {
    const descriptions: Record<FeatureFlagKey, string> = {
        [FEATURE_FLAGS.ALLOW_USER_SERVERS]:
            "Allow members to create their own servers",
        [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]:
            "Enable audit logging for moderation actions",
        [FEATURE_FLAGS.ENABLE_PER_MESSAGE_UNREAD]:
            "Enable per-message unread model and message-level inbox semantics",
        [FEATURE_FLAGS.ENABLE_INBOX_DIGEST]:
            "Enable inbox digest API foundation for chronological unread payloads",
        [FEATURE_FLAGS.ENABLE_INBOX_DIGEST_V1_5]:
            "Enable inbox digest v1.5 staged rollout behavior",
    };

    return descriptions[key] || "";
}

/**
 * Initializes missing feature flags with default values for the current deployment.
 *
 * @param {string} userId - Unique identifier of the user recorded as the creator/updater during initialization.
 * @returns {Promise<void>} Resolves when initialization and any required upserts complete.
 */
export async function initializeFeatureFlags(userId: string): Promise<void> {
    const existingFlags = await getAllFeatureFlags();
    const existingKeys = new Set(existingFlags.map((f) => f.key));

    // Create any missing flags with default values
    for (const [key, defaultValue] of Object.entries(DEFAULT_FLAGS)) {
        if (!existingKeys.has(key)) {
            await setFeatureFlag(key as FeatureFlagKey, defaultValue, userId);
        }
    }
}

/**
 * Clear the feature flags cache
 */
export function clearFeatureFlagsCache(): void {
    flagCache.clear();
}
