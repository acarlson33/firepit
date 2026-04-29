import { describe, expect, it } from "vitest";

import { clearFeatureFlagsCache, FEATURE_FLAGS } from "../lib/feature-flags";

const requiredFlagKeys = [
    "ALLOW_USER_SERVERS",
    "ENABLE_AUDIT_LOGGING",
    "ENABLE_EMAIL_VERIFICATION",
] as const;

describe("Feature Flags", () => {
    describe("FEATURE_FLAGS constants", () => {
        it("should have ALLOW_USER_SERVERS flag with correct key", () => {
            expect(FEATURE_FLAGS.ALLOW_USER_SERVERS).toBe("allow_user_servers");
        });

        it("should have ENABLE_AUDIT_LOGGING flag with correct key", () => {
            expect(FEATURE_FLAGS.ENABLE_AUDIT_LOGGING).toBe(
                "enable_audit_logging",
            );
        });

        it("should have ENABLE_EMAIL_VERIFICATION flag with correct key", () => {
            expect(FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION).toBe(
                "enable_email_verification",
            );
        });

        it.each(requiredFlagKeys)("should define %s as a string", (key) => {
            expect(FEATURE_FLAGS[key]).toBeDefined();
            expect(typeof FEATURE_FLAGS[key]).toBe("string");
        });
    });

    describe("clearFeatureFlagsCache", () => {
        it("should be callable without errors", () => {
            expect(() => clearFeatureFlagsCache()).not.toThrow();
        });
    });

    // Note: Integration tests for getFeatureFlag, setFeatureFlag, and getAllFeatureFlags
    // should be performed against a real database or with proper node-appwrite mocking.
    // These functions use server-side node-appwrite which requires different mocking
    // strategies than the browser appwrite client.

    describe("feature flag module structure", () => {
        it("should export all required functions", async () => {
            const module = await import("../lib/feature-flags");

            expect(module.getFeatureFlag).toBeDefined();
            expect(module.setFeatureFlag).toBeDefined();
            expect(module.getAllFeatureFlags).toBeDefined();
            expect(module.initializeFeatureFlags).toBeDefined();
            expect(module.clearFeatureFlagsCache).toBeDefined();
            expect(module.FEATURE_FLAGS).toBeDefined();
        });
    });
});
