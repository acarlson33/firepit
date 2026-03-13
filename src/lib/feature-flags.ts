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
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

// Default values for feature flags
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: true,
    [FEATURE_FLAGS.ENABLE_PER_MESSAGE_UNREAD]: false,
    [FEATURE_FLAGS.ENABLE_INBOX_DIGEST]: false,
};

// Cache for feature flags to reduce database calls
const flagCache = new Map<string, { value: boolean; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Get a feature flag value from the database
 *
 * @param {'allow_user_servers' | 'enable_audit_logging' | 'enable_per_message_unread' | 'enable_inbox_digest'} key - The key value.
 * @returns {Promise<boolean>} The return value.
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
 * Get all feature flags from the database
 * @returns {Promise<FeatureFlag[]>} The return value.
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
 * Set a feature flag value (admin only - should be called from server actions)
 *
 * @param {'allow_user_servers' | 'enable_audit_logging' | 'enable_per_message_unread' | 'enable_inbox_digest'} key - The key value.
 * @param {boolean} enabled - The enabled value.
 * @param {string} userId - The user id value.
 * @returns {Promise<boolean>} The return value.
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
 * Get description for a feature flag key
 *
 * @param {'allow_user_servers' | 'enable_audit_logging' | 'enable_per_message_unread' | 'enable_inbox_digest'} key - The key value.
 * @returns {string} The return value.
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
    };

    return descriptions[key] || "";
}

/**
 * Initialize feature flags with default values if they don't exist
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<void>} The return value.
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
 * @returns {void} The return value.
 */
export function clearFeatureFlagsCache(): void {
    flagCache.clear();
}
