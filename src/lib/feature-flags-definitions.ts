// Shared feature flag definitions that are safe to import in client bundles.

export const FEATURE_FLAGS = {
    ALLOW_USER_SERVERS: "allow_user_servers",
    ENABLE_AUDIT_LOGGING: "enable_audit_logging",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

const descriptions: Record<FeatureFlagKey, string> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]:
        "Allow members to create their own servers",
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]:
        "Enable audit logging for moderation actions",
};

/**
 * Returns a human-readable description for known feature flag keys.
 *
 * @param {FeatureFlagKey} key - Feature key to describe.
 * @returns {string} Human-readable description for the provided feature key.
 */
export function getFeatureFlagDescription(key: FeatureFlagKey): string {
    return descriptions[key];
}
