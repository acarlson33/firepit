// Shared feature flag definitions that are safe to import in client bundles.

export const FEATURE_FLAGS = {
    ALLOW_USER_SERVERS: "allow_user_servers",
    ENABLE_AUDIT_LOGGING: "enable_audit_logging",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Returns a human-readable description for getFeatureFlagDescription keys.
 * Key descriptions:
 * - allow_user_servers: Allow members to create their own servers.
 * - enable_audit_logging: Enable audit logging for moderation actions.
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
    };

    return descriptions[key] || "";
}
