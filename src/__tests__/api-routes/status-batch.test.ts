/**
 * Tests for /api/status/batch endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { STATUS_STALE_THRESHOLD_MS } from "@/lib/status-normalization";

// Create persistent mocks
const { mockListDocuments } = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/appwrite-core", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
        },
    })),
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            statuses: "statuses-collection",
        },
    })),
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    setTransactionName: vi.fn(),
    trackApiCall: vi.fn(),
    addTransactionAttributes: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: string[]) =>
            `equal(${field},${JSON.stringify(value)})`,
    },
}));

describe("POST /api/status/batch", () => {
    let POST: (request: NextRequest) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Dynamically import the route handler
        const module = await import("../../app/api/status/batch/route");
        POST = module.POST;
    });

    it("should return 400 if userIds is missing", async () => {
        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({}),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("userIds");
    });

    it("should return 400 if userIds is not an array", async () => {
        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: "not-an-array" }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("array");
    });

    it("should return 400 if userIds array is empty", async () => {
        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: [] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("userIds array is required");
    });

    it("should fetch statuses for multiple users", async () => {
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "status-1",
                    userId: "user-1",
                    status: "online",
                    customMessage: "Working",
                    lastSeenAt: new Date().toISOString(),
                    $updatedAt: new Date().toISOString(),
                },
                {
                    $id: "status-2",
                    userId: "user-2",
                    status: "away",
                    lastSeenAt: new Date().toISOString(),
                    $updatedAt: new Date().toISOString(),
                },
            ],
        });

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: ["user-1", "user-2"] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.statuses).toBeDefined();
        expect(data.statuses["user-1"]).toBeDefined();
        expect(data.statuses["user-1"].status).toBe("online");
        expect(data.statuses["user-2"]).toBeDefined();
        expect(data.statuses["user-2"].status).toBe("away");
    });

    it("should handle users with no status", async () => {
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "status-1",
                    userId: "user-1",
                    status: "online",
                    lastSeenAt: "2024-01-01T00:00:00Z",
                    $updatedAt: "2024-01-01T00:00:00Z",
                },
            ],
        });

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: ["user-1", "user-2", "user-3"] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.statuses["user-1"]).toBeDefined();
        expect(data.statuses["user-2"]).toBeUndefined();
        expect(data.statuses["user-3"]).toBeUndefined();
    });

    it("should batch process large user lists", async () => {
        const userIds = Array.from({ length: 150 }, (_, i) => `user-${i}`);

        // Mock multiple batch calls
        mockListDocuments
            .mockResolvedValueOnce({
                documents: Array.from({ length: 100 }, (_, i) => ({
                    $id: `status-${i}`,
                    userId: `user-${i}`,
                    status: "online",
                    lastSeenAt: "2024-01-01T00:00:00Z",
                    $updatedAt: "2024-01-01T00:00:00Z",
                })),
            })
            .mockResolvedValueOnce({
                documents: Array.from({ length: 50 }, (_, i) => ({
                    $id: `status-${100 + i}`,
                    userId: `user-${100 + i}`,
                    status: "online",
                    lastSeenAt: "2024-01-01T00:00:00Z",
                    $updatedAt: "2024-01-01T00:00:00Z",
                })),
            });

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Object.keys(data.statuses).length).toBe(150);
        expect(mockListDocuments).toHaveBeenCalledTimes(2);
    });

    it("should handle database errors gracefully", async () => {
        mockListDocuments.mockRejectedValue(new Error("Database error"));

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: ["user-1"] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toContain("Failed to fetch statuses");
    });

    it("should mark stale statuses as offline", async () => {
        const staleTimestamp = new Date(
            Date.now() - STATUS_STALE_THRESHOLD_MS - 60_000,
        ).toISOString();
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "status-1",
                    userId: "user-1",
                    status: "online",
                    lastSeenAt: staleTimestamp,
                    $updatedAt: staleTimestamp,
                },
            ],
        });

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: ["user-1"] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.statuses["user-1"].status).toBe("offline");
    });

    it("should keep manually set statuses even when stale", async () => {
        const staleTimestamp = new Date(
            Date.now() - STATUS_STALE_THRESHOLD_MS - 60_000,
        ).toISOString();
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "status-1",
                    userId: "user-1",
                    status: "busy",
                    lastSeenAt: staleTimestamp,
                    isManuallySet: true,
                },
            ],
        });

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: ["user-1"] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.statuses["user-1"].status).toBe("busy");
        expect(data.statuses["user-1"].isManuallySet).toBe(true);
    });

    it("should include optional fields when present", async () => {
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "status-1",
                    userId: "user-1",
                    status: "dnd",
                    customMessage: "In a meeting",
                    lastSeenAt: "2024-01-01T00:00:00Z",
                    expiresAt: "2024-01-01T01:00:00Z",
                    isManuallySet: true,
                    $updatedAt: "2024-01-01T00:00:00Z",
                },
            ],
        });

        const request = new NextRequest("http://localhost/api/status/batch", {
            method: "POST",
            body: JSON.stringify({ userIds: ["user-1"] }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.statuses["user-1"].customMessage).toBe("In a meeting");
        expect(data.statuses["user-1"].expiresAt).toBe("2024-01-01T01:00:00Z");
        expect(data.statuses["user-1"].isManuallySet).toBe(true);
    });
});
