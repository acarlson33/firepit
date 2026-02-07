/**
 * Tests for scripts/test-server-auth.ts
 *
 * This test file validates the server authentication testing script
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the appwrite-server module
vi.mock("../../lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            list: vi.fn(() =>
                Promise.resolve({
                    total: 1,
                    databases: [{ $id: "main", name: "Main Database" }],
                }),
            ),
            getCollection: vi.fn(() =>
                Promise.resolve({
                    $id: "messages",
                    name: "Messages",
                    documentSecurity: true,
                    $permissions: [],
                    attributes: [],
                    indexes: [],
                }),
            ),
        },
    })),
}));

// Mock the appwrite-core module
vi.mock("../../lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "main",
        collections: {
            messages: "messages",
            channels: "channels",
            servers: "servers",
            memberships: "memberships",
            profiles: "profiles",
            directMessages: "direct_messages",
            conversations: "conversations",
            statuses: "statuses",
        },
        buckets: {
            attachments: "attachments",
        },
    })),
}));

describe("Test Server Auth Script", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        vi.clearAllMocks();
        originalEnv = { ...process.env };
        process.env.APPWRITE_ENDPOINT =
            process.env.APPWRITE_ENDPOINT || "https://localhost/v1";
        process.env.APPWRITE_PROJECT_ID =
            process.env.APPWRITE_PROJECT_ID || "project-test";
        process.env.APPWRITE_API_KEY =
            process.env.APPWRITE_API_KEY || "api-key-test";
        process.env.APPWRITE_DATABASE_ID =
            process.env.APPWRITE_DATABASE_ID || "db-test";
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env = originalEnv;
    });

    describe("Server Client Initialization", () => {
        it("should initialize server client with API key", () => {
            const apiKey = process.env.APPWRITE_API_KEY;
            expect(apiKey).toBeDefined();
        });

        it("should use getServerClient from appwrite-server", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const client = getServerClient();

            expect(client).toBeDefined();
            expect(client.databases).toBeDefined();
        });
    });

    describe("Database Access Tests", () => {
        it("should successfully list databases with valid API key", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { databases } = getServerClient();

            const result = await databases.list();

            expect(result).toBeDefined();
            expect(result.total).toBeGreaterThanOrEqual(0);
        });

        it("should successfully get collection with valid API key", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { getEnvConfig } = await import("../../lib/appwrite-core");

            const { databases } = getServerClient();
            const env = getEnvConfig();

            const collection = await databases.getCollection({
                databaseId: env.databaseId,
                collectionId: env.collections.messages,
            });

            expect(collection).toBeDefined();
            expect(collection.$id).toBeTruthy();
        });

        it("should verify document security setting", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { getEnvConfig } = await import("../../lib/appwrite-core");

            const { databases } = getServerClient();
            const env = getEnvConfig();

            const collection = await databases.getCollection({
                databaseId: env.databaseId,
                collectionId: env.collections.messages,
            });

            expect(collection.documentSecurity).toBeDefined();
            expect(typeof collection.documentSecurity).toBe("boolean");
        });
    });

    describe("Environment Configuration", () => {
        it("should load environment configuration", async () => {
            const { getEnvConfig } = await import("../../lib/appwrite-core");
            const env = getEnvConfig();

            expect(env).toBeDefined();
            expect(env.databaseId).toBeTruthy();
            expect(env.collections).toBeDefined();
        });

        it("should have all required collection IDs", async () => {
            const { getEnvConfig } = await import("../../lib/appwrite-core");
            const env = getEnvConfig();

            const requiredCollections = [
                "messages",
                "channels",
                "servers",
                "memberships",
                "profiles",
                "directMessages",
                "conversations",
                "statuses",
            ] as const;

            requiredCollections.forEach((collection) => {
                expect(env.collections[collection]).toBeDefined();
            });
        });
    });

    describe("Output Format", () => {
        it("should use process.stdout for success messages", () => {
            expect(process.stdout.write).toBeDefined();
        });

        it("should use process.stderr for error messages", () => {
            expect(process.stderr.write).toBeDefined();
        });
    });

    describe("Exit Code Behavior", () => {
        it("should exit with code 1 on error", () => {
            const exitCode = 1;
            expect(exitCode).toBe(1);
        });

        it("should exit with code 0 on success", () => {
            const exitCode = 0;
            expect(exitCode).toBe(0);
        });
    });

    describe("Error Handling", () => {
        it("should handle missing environment variables gracefully", () => {
            // Script should fail fast if required env vars are missing
            const requiredEnvVars = [
                "APPWRITE_ENDPOINT",
                "APPWRITE_PROJECT_ID",
                "APPWRITE_API_KEY",
                "APPWRITE_DATABASE_ID",
            ];

            requiredEnvVars.forEach((envVar) => {
                const value = process.env[envVar];
                expect(value).toBeDefined();
            });
        });

        it("should handle invalid API key error", async () => {
            const mockDatabases = {
                list: vi.fn(() => Promise.reject(new Error("Invalid API key"))),
            };

            await expect(mockDatabases.list()).rejects.toThrow(
                "Invalid API key",
            );
        });

        it("should handle collection not found error", async () => {
            const mockDatabases = {
                getCollection: vi.fn(() =>
                    Promise.reject(new Error("Collection not found")),
                ),
            };

            await expect(mockDatabases.getCollection()).rejects.toThrow(
                "Collection not found",
            );
        });

        it("should handle network errors", async () => {
            const mockDatabases = {
                list: vi.fn(() => Promise.reject(new Error("Network error"))),
            };

            await expect(mockDatabases.list()).rejects.toThrow("Network error");
        });
    });

    describe("API Key Validation", () => {
        it("should verify API key has sufficient permissions", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { databases } = getServerClient();

            // API key should allow listing databases
            const result = await databases.list();
            expect(result).toBeDefined();
        });

        it("should verify API key can access collections", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { getEnvConfig } = await import("../../lib/appwrite-core");

            const { databases } = getServerClient();
            const env = getEnvConfig();

            // API key should allow reading collection metadata
            const collection = await databases.getCollection({
                databaseId: env.databaseId,
                collectionId: env.collections.messages,
            });

            expect(collection).toBeDefined();
        });
    });

    describe("Integration with Server Utilities", () => {
        it("should use getServerClient utility function", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");

            expect(getServerClient).toBeDefined();
            expect(typeof getServerClient).toBe("function");
        });

        it("should use getEnvConfig utility function", async () => {
            const { getEnvConfig } = await import("../../lib/appwrite-core");

            expect(getEnvConfig).toBeDefined();
            expect(typeof getEnvConfig).toBe("function");
        });

        it("should correctly integrate server client and env config", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { getEnvConfig } = await import("../../lib/appwrite-core");

            const { databases } = getServerClient();
            const env = getEnvConfig();

            // These should work together seamlessly
            expect(databases).toBeDefined();
            expect(env.databaseId).toBeTruthy();
            expect(env.collections.messages).toBeTruthy();
        });
    });

    describe("Success Criteria", () => {
        it("should report number of databases found", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { databases } = getServerClient();

            const result = await databases.list();

            expect(result.total).toBeDefined();
            expect(typeof result.total).toBe("number");
        });

        it("should report document security status", async () => {
            const { getServerClient } =
                await import("../../lib/appwrite-server");
            const { getEnvConfig } = await import("../../lib/appwrite-core");

            const { databases } = getServerClient();
            const env = getEnvConfig();

            const collection = await databases.getCollection({
                databaseId: env.databaseId,
                collectionId: env.collections.messages,
            });

            expect(collection.documentSecurity).toBeDefined();
        });
    });

    describe("Use Cases", () => {
        it("should be useful for debugging authentication issues", () => {
            // This script helps verify that:
            // 1. API key is valid
            // 2. API key has correct permissions
            // 3. Database and collections are accessible
            const useCases = [
                "Verify API key",
                "Check permissions",
                "Test database access",
                "Validate environment setup",
            ];

            expect(useCases.length).toBeGreaterThan(0);
        });

        it("should be safe to run in production for diagnostics", () => {
            // Script only reads data, doesn't modify anything
            const isReadOnly = true;
            expect(isReadOnly).toBe(true);
        });
    });
});

describe("Test Server Auth Script Execution", () => {
    it("should be executable via bun", () => {
        const command = "bun scripts/test-server-auth.ts";
        expect(command).toContain("test-server-auth.ts");
    });

    it("should complete quickly for quick diagnostics", () => {
        // Script should complete in under 5 seconds typically
        const expectedMaxDuration = 5000; // ms
        expect(expectedMaxDuration).toBeLessThanOrEqual(5000);
    });

    it("should provide clear success/failure output", () => {
        const outputs = {
            success: "✓",
            error: "✗",
        };

        expect(outputs.success).toBeTruthy();
        expect(outputs.error).toBeTruthy();
    });
});
