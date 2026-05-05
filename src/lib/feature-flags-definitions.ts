// Shared feature flag definitions that are safe to import in client bundles.

export const FEATURE_FLAGS = {
    ALLOW_USER_SERVERS: "allow_user_servers",
    ENABLE_AUDIT_LOGGING: "enable_audit_logging",
    ENABLE_INSTANCE_ANNOUNCEMENTS: "enable_instance_announcements",
    ENABLE_EMAIL_VERIFICATION: "enable_email_verification",
    ENABLE_GIF_STICKER_SUPPORT: "enable_gif_sticker_support",
    ENABLE_TENOR_GIF_SEARCH: "enable_tenor_gif_search",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

const descriptions = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]:
        "Allow members to create their own servers",
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]:
        "Enable audit logging for moderation actions",
    [FEATURE_FLAGS.ENABLE_INSTANCE_ANNOUNCEMENTS]:
        "Enable instance-wide system DM announcements",
    [FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION]:
        "Require email verification before allowing sign in",
    [FEATURE_FLAGS.ENABLE_GIF_STICKER_SUPPORT]:
        "Enable built-in GIF and sticker messaging support",
    [FEATURE_FLAGS.ENABLE_TENOR_GIF_SEARCH]:
        "Enable external GIF search provider",
} satisfies Record<FeatureFlagKey, string>;

/**
 * Returns a human-readable description for known feature flag keys.
 *
 * @param {FeatureFlagKey} key - Feature key to describe.
 * @returns {string} Human-readable description for the provided feature key.
 */
export function getFeatureFlagDescription(key: FeatureFlagKey): string {
    return descriptions[key];
}
