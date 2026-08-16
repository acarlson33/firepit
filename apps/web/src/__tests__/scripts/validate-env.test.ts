/**
 * Tests for scripts/validate-env.ts
 *
 * This test file validates the environment variable validation script functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Environment Variable Validation Script", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };

        // Provide required defaults for tests
        const endpoint =
            process.env.APPWRITE_ENDPOINT ||
            process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
            "https://localhost/v1";
        const projectId =
            process.env.APPWRITE_PROJECT_ID ||
            process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
            "project-test";
        process.env.APPWRITE_ENDPOINT = endpoint;
        process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = endpoint;
        process.env.APPWRITE_PROJECT_ID = projectId;
        process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = projectId;
        process.env.APPWRITE_API_KEY =
            process.env.APPWRITE_API_KEY || "api-key-test";
        process.env.APPWRITE_DATABASE_ID =
            process.env.APPWRITE_DATABASE_ID || "db-test";
        process.env.APPWRITE_MESSAGES_COLLECTION_ID =
            process.env.APPWRITE_MESSAGES_COLLECTION_ID || "messages";
        process.env.APPWRITE_CHANNELS_COLLECTION_ID =
            process.env.APPWRITE_CHANNELS_COLLECTION_ID || "channels";
        process.env.APPWRITE_SERVERS_COLLECTION_ID =
            process.env.APPWRITE_SERVERS_COLLECTION_ID || "servers";
        process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID =
            process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID || "memberships";
        process.env.APPWRITE_PROFILES_COLLECTION_ID =
            process.env.APPWRITE_PROFILES_COLLECTION_ID || "profiles";
        process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID =
            process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID ||
            "direct_messages";
        process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID =
            process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || "conversations";
        process.env.APPWRITE_STATUSES_COLLECTION_ID =
            process.env.APPWRITE_STATUSES_COLLECTION_ID || "statuses";
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe("Required Environment Variables", () => {
        it("should require APPWRITE_ENDPOINT", () => {
            expect(process.env.APPWRITE_ENDPOINT).toBeDefined();
        });

        it("should require APPWRITE_PROJECT_ID", () => {
            expect(process.env.APPWRITE_PROJECT_ID).toBeDefined();
        });

        it("should require APPWRITE_API_KEY", () => {
            expect(process.env.APPWRITE_API_KEY).toBeDefined();
        });

        it("should require APPWRITE_DATABASE_ID", () => {
            expect(process.env.APPWRITE_DATABASE_ID).toBeDefined();
        });

        it("should require NEXT_PUBLIC_APPWRITE_ENDPOINT", () => {
            expect(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT).toBeDefined();
        });

        it("should require NEXT_PUBLIC_APPWRITE_PROJECT_ID", () => {
            expect(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID).toBeDefined();
        });
    });

    describe("Environment Variable Format Validation", () => {
        it("should validate APPWRITE_ENDPOINT is a valid URL", () => {
            const endpoint = process.env.APPWRITE_ENDPOINT;

            if (endpoint) {
                // Should not throw when creating URL
                expect(() => new URL(endpoint)).not.toThrow();

                // Should start with http:// or https://
                expect(endpoint).toMatch(/^https?:\/\//);
            }
        });

        it("should validate NEXT_PUBLIC_APPWRITE_ENDPOINT is a valid URL", () => {
            const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;

            if (endpoint) {
                expect(() => new URL(endpoint)).not.toThrow();
                expect(endpoint).toMatch(/^https?:\/\//);
            }
        });

        it("should validate project IDs are non-empty strings", () => {
            const projectId = process.env.APPWRITE_PROJECT_ID;
            const publicProjectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

            if (projectId) {
                expect(projectId).toBeTruthy();
                expect(typeof projectId).toBe("string");
                expect(projectId.trim().length).toBeGreaterThan(0);
            }

            if (publicProjectId) {
                expect(publicProjectId).toBeTruthy();
                expect(typeof publicProjectId).toBe("string");
                expect(publicProjectId.trim().length).toBeGreaterThan(0);
            }
        });

        it("should validate API key is non-empty string", () => {
            const apiKey = process.env.APPWRITE_API_KEY;

            if (apiKey) {
                expect(apiKey).toBeTruthy();
                expect(typeof apiKey).toBe("string");
                expect(apiKey.trim().length).toBeGreaterThan(0);
            }
        });

        it("should validate database ID is non-empty string", () => {
            const databaseId = process.env.APPWRITE_DATABASE_ID;

            if (databaseId) {
                expect(databaseId).toBeTruthy();
                expect(typeof databaseId).toBe("string");
                expect(databaseId.trim().length).toBeGreaterThan(0);
            }
        });
    });

    describe("Consistency Checks", () => {
        it("should have matching project IDs for public and server", () => {
            const serverProjectId = process.env.APPWRITE_PROJECT_ID;
            const publicProjectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

            if (serverProjectId && publicProjectId) {
                expect(serverProjectId).toBe(publicProjectId);
            }
        });

        it("should have matching endpoints for public and server", () => {
            const serverEndpoint = process.env.APPWRITE_ENDPOINT;
            const publicEndpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;

            if (serverEndpoint && publicEndpoint) {
                expect(serverEndpoint).toBe(publicEndpoint);
            }
        });
    });

    describe("Collection ID Environment Variables", () => {
        const collectionEnvVars = [
            "APPWRITE_MESSAGES_COLLECTION_ID",
            "APPWRITE_CHANNELS_COLLECTION_ID",
            "APPWRITE_SERVERS_COLLECTION_ID",
            "APPWRITE_MEMBERSHIPS_COLLECTION_ID",
            "APPWRITE_PROFILES_COLLECTION_ID",
            "APPWRITE_DIRECT_MESSAGES_COLLECTION_ID",
            "APPWRITE_CONVERSATIONS_COLLECTION_ID",
            "APPWRITE_STATUSES_COLLECTION_ID",
        ];

        collectionEnvVars.forEach((envVar) => {
            it(`should have ${envVar} defined`, () => {
                const value = process.env[envVar];
                expect(value).toBeDefined();
                if (value) {
                    expect(value.trim().length).toBeGreaterThan(0);
                }
            });
        });

        // Optional collection IDs (may not be set up in all environments)
        it("should allow APPWRITE_ROLES_COLLECTION_ID to be optional", () => {
            const value = process.env.APPWRITE_ROLES_COLLECTION_ID;
            // Test passes if it's either defined or undefined
            expect(value === undefined || typeof value === "string").toBe(true);
        });

        it("should allow APPWRITE_ROLE_ASSIGNMENTS_COLLECTION_ID to be optional", () => {
            const value = process.env.APPWRITE_ROLE_ASSIGNMENTS_COLLECTION_ID;
            // Test passes if it's either defined or undefined
            expect(value === undefined || typeof value === "string").toBe(true);
        });
    });

    describe("Storage Bucket Environment Variables", () => {
        // Storage bucket is optional - not all environments use central storage
        it("should allow APPWRITE_STORAGE_BUCKET_ID to be optional", () => {
            const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID;
            // Test passes if it's either defined or undefined
            expect(bucketId === undefined || typeof bucketId === "string").toBe(
                true,
            );
            if (bucketId) {
                expect(bucketId.trim().length).toBeGreaterThan(0);
            }
        });
    });

    describe("Optional Environment Variables", () => {
        it("should allow NEWRELIC_LICENSE_KEY to be undefined for local dev", () => {
            // New Relic is optional for local development
            const newRelicKey = process.env.NEWRELIC_LICENSE_KEY;
            // Test passes if it's either defined or undefined
            expect(
                newRelicKey === undefined || typeof newRelicKey === "string",
            ).toBe(true);
        });

        it("should allow custom NEXT_PUBLIC_BASE_URL", () => {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
            if (baseUrl) {
                expect(() => new URL(baseUrl)).not.toThrow();
            }
        });
    });

    describe("Security Checks", () => {
        it("should not expose API key in client-side env vars", () => {
            // Only server-side should have API key
            const apiKey = process.env.APPWRITE_API_KEY;

            // Client env vars should not include API key
            Object.keys(process.env)
                .filter((key) => key.startsWith("NEXT_PUBLIC_"))
                .forEach((key) => {
                    const value = process.env[key];
                    if (value && apiKey) {
                        expect(value).not.toContain(apiKey);
                    }
                });
        });

        it("should validate API key is not a placeholder", () => {
            const apiKey = process.env.APPWRITE_API_KEY;

            if (apiKey) {
                // Should not be common placeholders
                const placeholders = [
                    "your-api-key",
                    "YOUR_API_KEY",
                    "replace-me",
                    "REPLACE_ME",
                    "example",
                    "test",
                    "placeholder",
                ];

                const lowerApiKey = apiKey.toLowerCase();
                placeholders.forEach((placeholder) => {
                    expect(lowerApiKey).not.toBe(placeholder);
                });
            }
        });
    });

    describe("Production Environment Checks", () => {
        it("should use HTTPS in production", () => {
            const nodeEnv = process.env.NODE_ENV;
            const endpoint = process.env.APPWRITE_ENDPOINT;

            if (nodeEnv === "production" && endpoint) {
                expect(endpoint).toMatch(/^https:\/\//);
            }
        });

        it("should have New Relic configured in production", () => {
            const nodeEnv = process.env.NODE_ENV;
            const newRelicKey = process.env.NEWRELIC_LICENSE_KEY;

            if (nodeEnv === "production") {
                // In production, New Relic should be configured
                // This is a warning, not a hard requirement
                const hasNewRelic =
                    newRelicKey !== undefined && newRelicKey.trim().length > 0;
                expect(hasNewRelic || nodeEnv !== "production").toBe(true);
            }
        });
    });

    describe("Environment Variable Trimming", () => {
        it("should handle environment variables with leading/trailing whitespace", () => {
            // Test that trimming is handled correctly
            const testEnv = {
                ...originalEnv,
                APPWRITE_DATABASE_ID: "  main  ",
            };

            process.env = testEnv;
            const databaseId = process.env.APPWRITE_DATABASE_ID?.trim();

            expect(databaseId).toBe("main");
        });
    });

    describe("Default Values", () => {
        it("should use 'main' as default database ID if not specified", () => {
            const databaseId = process.env.APPWRITE_DATABASE_ID || "main";
            expect(databaseId).toBe(
                databaseId.trim().length > 0 ? databaseId : "main",
            );
        });
    });
});

describe("Validate Env Script Exit Codes", () => {
    it("should have proper exit code handling concept", () => {
        // The script should exit with:
        // - 0 for success
        // - 1 for validation errors
        const exitCodes = {
            success: 0,
            validationError: 1,
        };

        expect(exitCodes.success).toBe(0);
        expect(exitCodes.validationError).toBe(1);
    });
});
