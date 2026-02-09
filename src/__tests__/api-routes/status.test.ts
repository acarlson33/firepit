import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PATCH, DELETE } from "../../app/api/status/route";
import { STATUS_STALE_THRESHOLD_MS } from "@/lib/status-normalization";

// Mock node-appwrite for server-side
vi.mock("node-appwrite", () => ({
    ID: { unique: () => "mock-id" },
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (n: number) => `limit(${n})`,
    },
}));

// Create mock databases object
const mockDatabases = {
    listDocuments: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
};

// Mock dependencies
vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: mockDatabases,
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            statuses: "statuses-collection",
        },
    })),
    perms: {
        status: vi.fn(() => ["read(any)", "write(user:test-user)"]),
        serverOwner: vi.fn(() => ["write(user:test-user)"]),
    },
}));

describe("Status API Routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("POST /api/status", () => {
        it("should create a new status document", async () => {
            mockDatabases.listDocuments.mockResolvedValue({ documents: [] });
            mockDatabases.createDocument.mockResolvedValue({
                $id: "status-1",
                userId: "user-1",
                status: "online",
                customMessage: "",
                lastSeenAt: new Date().toISOString(),
            });

            const request = new NextRequest("http://localhost/api/status", {
                method: "POST",
                body: JSON.stringify({
                    userId: "user-1",
                    status: "online",
                    customMessage: "",
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.userId).toBe("user-1");
            expect(data.status).toBe("online");
            expect(mockDatabases.createDocument).toHaveBeenCalled();
        });

        it("should update existing status document", async () => {
            const existingDoc = {
                $id: "status-1",
                userId: "user-1",
                status: "away",
                isManuallySet: false,
            };

            mockDatabases.listDocuments.mockResolvedValue({
                documents: [existingDoc],
            });
            mockDatabases.updateDocument.mockResolvedValue({
                ...existingDoc,
                status: "online",
            });

            const request = new NextRequest("http://localhost/api/status", {
                method: "POST",
                body: JSON.stringify({
                    userId: "user-1",
                    status: "online",
                }),
            });

            const response = await POST(request);
            await response.json();

            expect(response.status).toBe(200);
            expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
                "test-db",
                "statuses-collection",
                "status-1",
                expect.any(Object),
                expect.any(Array),
            );
        });

        it("should return 400 if userId or status is missing", async () => {
            const request = new NextRequest("http://localhost/api/status", {
                method: "POST",
                body: JSON.stringify({ userId: "user-1" }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("userId and status are required");
        });
    });

    describe("PATCH /api/status", () => {
        it("should update lastSeenAt timestamp", async () => {
            mockDatabases.listDocuments.mockResolvedValue({
                documents: [
                    {
                        $id: "status-1",
                        userId: "user-1",
                        status: "online",
                    },
                ],
            });
            mockDatabases.updateDocument.mockResolvedValue({
                $id: "status-1",
                userId: "user-1",
                status: "online",
                lastSeenAt: new Date().toISOString(),
            });

            const request = new NextRequest("http://localhost/api/status", {
                method: "PATCH",
                body: JSON.stringify({ userId: "user-1" }),
            });

            const response = await PATCH(request);
            await response.json();

            expect(response.status).toBe(200);
            expect(mockDatabases.updateDocument).toHaveBeenCalled();
        });

        it("should return 400 if userId is missing", async () => {
            const request = new NextRequest("http://localhost/api/status", {
                method: "PATCH",
                body: JSON.stringify({}),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("userId is required");
        });
    });

    describe("GET /api/status", () => {
        it("should get a single user status", async () => {
            mockDatabases.listDocuments.mockResolvedValue({
                documents: [
                    {
                        $id: "status-1",
                        userId: "user-1",
                        status: "online",
                        customMessage: "Working",
                        lastSeenAt: new Date().toISOString(),
                    },
                ],
            });

            const request = new NextRequest(
                "http://localhost/api/status?userId=user-1",
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.userId).toBe("user-1");
            expect(data.status).toBe("online");
        });

        it("should return null status if user has no status", async () => {
            mockDatabases.listDocuments.mockResolvedValue({ documents: [] });

            const request = new NextRequest(
                "http://localhost/api/status?userId=user-1",
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBeNull();
        });

        it("should get multiple user statuses", async () => {
            mockDatabases.listDocuments.mockResolvedValue({
                documents: [
                    {
                        $id: "status-1",
                        userId: "user-1",
                        status: "online",
                    },
                    {
                        $id: "status-2",
                        userId: "user-2",
                        status: "away",
                    },
                ],
            });

            const request = new NextRequest(
                "http://localhost/api/status?userIds=user-1,user-2",
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.statuses).toHaveLength(2);
            expect(data.statuses[0].userId).toBe("user-1");
            expect(data.statuses[1].userId).toBe("user-2");
        });

        it("should mark stale statuses as offline", async () => {
            const staleTimestamp = new Date(
                Date.now() - STATUS_STALE_THRESHOLD_MS - 60_000,
            ).toISOString();
            mockDatabases.listDocuments.mockResolvedValue({
                documents: [
                    {
                        $id: "status-1",
                        userId: "user-1",
                        status: "online",
                        lastSeenAt: staleTimestamp,
                    },
                ],
            });

            const request = new NextRequest(
                "http://localhost/api/status?userId=user-1",
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe("offline");
        });

        it("should keep manually set status even when stale", async () => {
            const staleTimestamp = new Date(
                Date.now() - STATUS_STALE_THRESHOLD_MS - 60_000,
            ).toISOString();
            mockDatabases.listDocuments.mockResolvedValue({
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

            const request = new NextRequest(
                "http://localhost/api/status?userId=user-1",
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe("busy");
            expect(data.isManuallySet).toBe(true);
        });

        it("should return 400 if no userId or userIds parameter", async () => {
            const request = new NextRequest("http://localhost/api/status");

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("userId or userIds parameter is required");
        });
    });

    describe("DELETE /api/status", () => {
        it("should delete a user status", async () => {
            mockDatabases.listDocuments.mockResolvedValue({
                documents: [
                    {
                        $id: "status-1",
                        userId: "user-1",
                        status: "online",
                    },
                ],
            });
            mockDatabases.deleteDocument.mockResolvedValue({});

            const request = new NextRequest("http://localhost/api/status", {
                method: "DELETE",
                body: JSON.stringify({ userId: "user-1" }),
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.deletedId).toBe("status-1");
            expect(mockDatabases.deleteDocument).toHaveBeenCalledWith(
                "test-db",
                "statuses-collection",
                "status-1",
            );
        });

        it("should return 404 if status not found", async () => {
            mockDatabases.listDocuments.mockResolvedValue({ documents: [] });

            const request = new NextRequest("http://localhost/api/status", {
                method: "DELETE",
                body: JSON.stringify({ userId: "user-1" }),
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe("Status not found");
        });

        it("should return 400 if userId is missing", async () => {
            const request = new NextRequest("http://localhost/api/status", {
                method: "DELETE",
                body: JSON.stringify({}),
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("userId is required");
        });
    });
});
