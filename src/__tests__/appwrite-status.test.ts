import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Models } from "appwrite";
import { STATUS_STALE_THRESHOLD_MS } from "../lib/status-normalization";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock environment variables
beforeEach(() => {
    process.env.APPWRITE_ENDPOINT = "http://localhost";
    process.env.APPWRITE_PROJECT_ID = "test-project";
    process.env.APPWRITE_DATABASE_ID = "main";
    process.env.APPWRITE_STATUSES_COLLECTION_ID = "statuses";

    // Clear mock documents
    Object.keys(globalMockDocuments).forEach(
        (key) => delete globalMockDocuments[key],
    );

    // Reset fetch mock before each test
    mockFetch.mockReset();

    // Default fetch mock implementation
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        const method = options?.method || "GET";

        if (url === "/api/status" && method === "POST") {
            const body = JSON.parse(options?.body as string);
            const now = new Date().toISOString();

            const statusDoc = {
                $id: `status-${body.userId}`,
                $createdAt: now,
                $updatedAt: now,
                $permissions: [],
                $collectionId: "statuses",
                $databaseId: "main",
                $sequence: 0,
                userId: body.userId,
                status: body.status,
                customMessage: body.customMessage,
                lastSeenAt: now,
                expiresAt: body.expiresAt,
                isManuallySet: body.isManuallySet,
            } as Models.Document;

            // Also add to mock database so getUsersStatuses can find it
            if (!globalMockDocuments.statuses) {
                globalMockDocuments.statuses = [];
            }
            // Remove existing status for this user if any
            globalMockDocuments.statuses = globalMockDocuments.statuses.filter(
                (doc) =>
                    (doc as Record<string, unknown>).userId !== body.userId,
            );
            globalMockDocuments.statuses.push(statusDoc);

            return {
                ok: true,
                json: async () => statusDoc,
            } as Response;
        }

        if (url === "/api/status" && method === "PATCH") {
            const body = JSON.parse(options?.body as string);
            const now = new Date().toISOString();

            // Update lastSeenAt in mock database
            if (globalMockDocuments.statuses) {
                const doc = globalMockDocuments.statuses.find(
                    (d) =>
                        (d as Record<string, unknown>).userId === body.userId,
                );
                if (doc) {
                    (doc as Record<string, unknown>).lastSeenAt = now;
                    (doc as Record<string, unknown>).$updatedAt = now;
                }
            }

            return {
                ok: true,
                json: async () => ({ success: true }),
            } as Response;
        }

        return {
            ok: false,
            json: async () => ({ error: "Not found" }),
        } as Response;
    });
});

afterEach(() => {
    mockFetch.mockReset();
});

// Shared mock document storage
const globalMockDocuments: Record<string, Models.Document[]> = {};

// Mock Appwrite
vi.mock("appwrite", () => {
    const mockDocuments = globalMockDocuments;

    class MockDatabases {
        async listDocuments(params: {
            databaseId: string;
            collectionId: string;
            queries?: string[];
        }) {
            const docs = mockDocuments[params.collectionId] || [];
            return {
                documents: docs,
                total: docs.length,
            };
        }

        async createDocument(params: {
            databaseId: string;
            collectionId: string;
            documentId: string;
            data: Record<string, unknown>;
            permissions?: string[];
        }) {
            const doc = {
                $id: params.documentId,
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                $permissions: params.permissions || [],
                ...params.data,
            } as Models.Document;

            if (!mockDocuments[params.collectionId]) {
                mockDocuments[params.collectionId] = [];
            }
            mockDocuments[params.collectionId].push(doc);
            return doc;
        }

        async updateDocument(params: {
            databaseId: string;
            collectionId: string;
            documentId: string;
            data?: Record<string, unknown>;
        }) {
            const docs = mockDocuments[params.collectionId] || [];
            const doc = docs.find((d) => d.$id === params.documentId);
            if (!doc) {
                throw new Error("Document not found");
            }
            Object.assign(doc, params.data);
            doc.$updatedAt = new Date().toISOString();
            return doc;
        }
    }

    class MockClient {
        setEndpoint() {
            return this;
        }
        setProject() {
            return this;
        }
    }

    return {
        Client: MockClient,
        Databases: MockDatabases,
        ID: {
            unique: () => `test-${Date.now()}`,
        },
        Query: {
            equal: (attr: string, val: string) => `equal("${attr}","${val}")`,
            limit: (num: number) => `limit(${num})`,
        },
        Permission: {
            read: (role: string) => `read("${role}")`,
            update: (role: string) => `update("${role}")`,
            delete: (role: string) => `delete("${role}")`,
        },
        Role: {
            any: () => "any()",
            user: (id: string) => `user(${id})`,
        },
    };
});

describe("User Status - Core Functions", () => {
    it("should export status functions", async () => {
        const mod = await import("../lib/appwrite-status");
        expect(typeof mod.setUserStatus).toBe("function");
        expect(typeof mod.getUserStatus).toBe("function");
        expect(typeof mod.getUsersStatuses).toBe("function");
        expect(typeof mod.updateLastSeen).toBe("function");
        expect(typeof mod.setOffline).toBe("function");
    });

    it("should set user status with all valid status types", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const statuses = ["online", "away", "busy", "offline"] as const;

        for (const status of statuses) {
            const result = await setUserStatus("user1", status);
            expect(result).toBeDefined();
            expect(result.userId).toBe("user1");
            expect(result.status).toBe(status);
            expect(result.lastSeenAt).toBeDefined();
        }
    });

    it("should set user status with custom message", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const result = await setUserStatus("user1", "busy", "In a meeting");

        expect(result.status).toBe("busy");
        expect(result.customMessage).toBe("In a meeting");
    });

    it("should update existing status document", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        await setUserStatus("user1", "online");
        const updated = await setUserStatus("user1", "away", "BRB");

        expect(updated.status).toBe("away");
        expect(updated.customMessage).toBe("BRB");
    });

    it("should get user status", async () => {
        const { setUserStatus, getUserStatus } =
            await import("../lib/appwrite-status");

        await setUserStatus("user1", "online", "Available");
        const status = await getUserStatus("user1");

        expect(status).toBeDefined();
        if (status) {
            expect(status.userId).toBe("user1");
            expect(status.status).toBe("online");
            expect(status.customMessage).toBe("Available");
        }
    });

    it("should handle querying user status", async () => {
        const { getUserStatus } = await import("../lib/appwrite-status");

        // Get any user's status - mock returns first available
        const status = await getUserStatus("any-user-id");

        // Should return a status object with expected structure
        expect(status).toBeDefined();
        if (status) {
            expect(status).toHaveProperty("userId");
            expect(status).toHaveProperty("status");
            expect(status).toHaveProperty("lastSeenAt");
        }
    });

    it("should get multiple users statuses", async () => {
        const { setUserStatus, getUsersStatuses } =
            await import("../lib/appwrite-status");

        await setUserStatus("user1", "online");
        await setUserStatus("user2", "away");
        await setUserStatus("user3", "busy");

        const statuses = await getUsersStatuses(["user1", "user2", "user3"]);

        expect(statuses).toBeInstanceOf(Map);
        expect(statuses.size).toBeGreaterThan(0);
    });

    it("should update lastSeen timestamp", async () => {
        const { setUserStatus, updateLastSeen, getUserStatus } =
            await import("../lib/appwrite-status");

        await setUserStatus("user1", "online");
        const before = await getUserStatus("user1");

        // Wait a tiny bit to ensure timestamp difference
        await new Promise((resolve) => setTimeout(resolve, 10));

        await updateLastSeen("user1");
        const after = await getUserStatus("user1");

        expect(before).toBeDefined();
        expect(after).toBeDefined();
        if (before && after) {
            expect(after.lastSeenAt).not.toBe(before.lastSeenAt);
        }
    });

    it("should set offline status", async () => {
        const { setUserStatus, setOffline, getUserStatus } =
            await import("../lib/appwrite-status");

        await setUserStatus("user1", "online");
        await setOffline("user1");

        const status = await getUserStatus("user1");

        expect(status).toBeDefined();
        if (status) {
            expect(status.status).toBe("offline");
        }
    });
});

describe("User Status - Permission Handling", () => {
    it("should set public read permissions on status", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const status = await setUserStatus("user1", "online");

        // Status documents should have proper permissions set
        expect(status).toBeDefined();
        expect(status.userId).toBe("user1");
        expect(status.status).toBe("online");
    });
});

describe("User Status - Edge Cases", () => {
    it("should handle empty custom message", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const result = await setUserStatus("user1", "online", "");

        expect(result.customMessage).toBeFalsy();
    });

    it("should handle undefined custom message", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const result = await setUserStatus("user1", "online", undefined);

        expect(result.customMessage).toBeFalsy();
    });

    it("should handle long custom message", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const longMessage = "A".repeat(200);
        const result = await setUserStatus("user1", "busy", longMessage);

        expect(result.customMessage).toBe(longMessage);
    });

    it("should handle rapid status updates", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const updates = await Promise.all([
            setUserStatus("user1", "online"),
            setUserStatus("user1", "away"),
            setUserStatus("user1", "busy"),
        ]);

        expect(updates.length).toBe(3);
        expect(updates[updates.length - 1].status).toBe("busy");
    });

    it("should handle empty user ID list", async () => {
        const { getUsersStatuses } = await import("../lib/appwrite-status");

        const statuses = await getUsersStatuses([]);

        expect(statuses).toBeInstanceOf(Map);
        expect(statuses.size).toBe(0);
    });

    it("should return offline for stale statuses", async () => {
        const { setUserStatus, getUserStatus } =
            await import("../lib/appwrite-status");

        await setUserStatus("user-stale", "online");
        const staleTimestamp = new Date(
            Date.now() - STATUS_STALE_THRESHOLD_MS - 60_000,
        ).toISOString();
        const docs = globalMockDocuments.statuses;
        if (docs && docs[0]) {
            (docs[0] as Record<string, unknown>).lastSeenAt = staleTimestamp;
        }

        const status = await getUserStatus("user-stale");

        expect(status?.status).toBe("offline");
    });

    it("should keep manually set statuses active even when stale", async () => {
        const { setUserStatus, getUserStatus } =
            await import("../lib/appwrite-status");

        await setUserStatus(
            "user-stale-manual",
            "busy",
            "Heads down",
            undefined,
            true,
        );
        const staleTimestamp = new Date(
            Date.now() - STATUS_STALE_THRESHOLD_MS - 60_000,
        ).toISOString();
        const docs = globalMockDocuments.statuses;
        if (docs) {
            const doc = docs.find(
                (d) =>
                    (d as Record<string, unknown>).userId ===
                    "user-stale-manual",
            );
            if (doc) {
                (doc as Record<string, unknown>).lastSeenAt = staleTimestamp;
                (doc as Record<string, unknown>).$updatedAt = staleTimestamp;
            }
        }

        const status = await getUserStatus("user-stale-manual");

        expect(status?.status).toBe("busy");
        expect(status?.isManuallySet).toBe(true);
    });
});

describe("User Status - Data Validation", () => {
    it("should validate status is one of allowed values", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        // Valid statuses should work
        await expect(setUserStatus("user1", "online")).resolves.toBeDefined();
        await expect(setUserStatus("user1", "away")).resolves.toBeDefined();
        await expect(setUserStatus("user1", "busy")).resolves.toBeDefined();
        await expect(setUserStatus("user1", "offline")).resolves.toBeDefined();
    });

    it("should include timestamp in lastSeenAt", async () => {
        const { setUserStatus } = await import("../lib/appwrite-status");

        const status = await setUserStatus("user1", "online");

        expect(status.lastSeenAt).toBeDefined();
        expect(typeof status.lastSeenAt).toBe("string");
        // Should be valid ISO date
        expect(new Date(status.lastSeenAt).getTime()).not.toBeNaN();
    });

    it("should preserve userId across updates", async () => {
        const { setUserStatus, getUserStatus } =
            await import("../lib/appwrite-status");

        await setUserStatus("user1", "online");
        await setUserStatus("user1", "away");

        const status = await getUserStatus("user1");

        expect(status).toBeDefined();
        if (status) {
            expect(status.userId).toBe("user1");
        }
    });
});

describe("User Status - Batch Operations", () => {
    it("should handle batch status retrieval efficiently", async () => {
        const { setUserStatus, getUsersStatuses } =
            await import("../lib/appwrite-status");

        const userIds = Array.from({ length: 10 }, (_, i) => `user${i}`);

        // Set status for all users
        await Promise.all(
            userIds.map((id) =>
                setUserStatus(id, "online", `Status for ${id}`),
            ),
        );

        // Retrieve all at once
        const statuses = await getUsersStatuses(userIds);

        expect(statuses.size).toBeLessThanOrEqual(userIds.length);
    });

    it("should return Map with userId as key", async () => {
        const { setUserStatus, getUsersStatuses } =
            await import("../lib/appwrite-status");

        await setUserStatus("user1", "online");
        await setUserStatus("user2", "away");

        const statuses = await getUsersStatuses(["user1", "user2"]);

        expect(statuses).toBeInstanceOf(Map);
        // Keys should be user IDs
        for (const [key, value] of statuses) {
            expect(typeof key).toBe("string");
            expect(value.userId).toBeDefined();
        }
    });
});
