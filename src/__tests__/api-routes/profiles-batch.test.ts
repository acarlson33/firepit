/**
 * Tests for POST /api/profiles/batch endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/profiles/batch/route";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockGetRelationshipMap, mockListDocuments } =
    vi.hoisted(() => ({
        mockGetServerSession: vi.fn(),
        mockGetRelationshipMap: vi.fn(),
        mockListDocuments: vi.fn(),
    }));

// Mock dependencies
vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join("|") : value})`,
        limit: (value: number) => `limit(${value})`,
    },
}));

vi.mock("@/lib/appwrite-profiles", () => ({
    getAvatarUrl: vi.fn(),
    getProfileBackgroundUrl: vi.fn(),
    getPredefinedAvatarFrameUrlByPresetId: vi.fn(),
    getExistingPredefinedAvatarFrameIds: vi.fn(() =>
        Promise.resolve(new Set()),
    ),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "https://example.com",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            profiles: "profiles",
            statuses: "statuses",
        },
        buckets: {
            avatars: "avatars",
        },
    })),
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    recordError: vi.fn(),
    setTransactionName: vi.fn(),
    trackApiCall: vi.fn(),
    addTransactionAttributes: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-friendships", () => ({
    getRelationshipMap: mockGetRelationshipMap,
}));

vi.mock("@/lib/api-compression", () => ({
    compressedResponse: vi.fn((data: unknown) => Response.json(data)),
}));

import { getUserProfile, getAvatarUrl } from "@/lib/appwrite-profiles";

describe("POST /api/profiles/batch", () => {
    let mockGetAvatarUrl: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockListDocuments.mockReset();
        mockGetServerSession.mockResolvedValue({
            $id: "current-user",
            name: "Current User",
        });
        mockGetRelationshipMap.mockImplementation(
            async (_currentUserId: string, userIds: string[]) =>
                new Map(
                    userIds.map((userId) => [
                        userId,
                        {
                            blockedByMe: false,
                            blockedMe: false,
                        },
                    ]),
                ),
        );
        const profiles = await import("@/lib/appwrite-profiles");
        mockGetAvatarUrl = profiles.getAvatarUrl;
        mockGetAvatarUrl.mockReturnValue("https://example.com/avatar.png");
        mockListDocuments
            .mockResolvedValue({ documents: [] })
            .mockResolvedValue({ documents: [] });
    });

    const createRequest = (body: unknown) => {
        return new NextRequest("http://localhost:3000/api/profiles/batch", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        });
    };

    it("should require authentication", async () => {
        mockGetServerSession.mockResolvedValueOnce(null);

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("should return 400 when userIds is not an array", async () => {
        const request = createRequest({ userIds: "not-an-array" });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("userIds array is required");
    });

    it("should return 400 when userIds is empty", async () => {
        const request = createRequest({ userIds: [] });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("userIds array is required");
    });

    it("should return 400 when userIds exceeds 100 items", async () => {
        const userIds = Array.from({ length: 101 }, (_, i) => `user${i}`);
        const request = createRequest({ userIds });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Maximum 100 userIds per request");
    });

    it("should fetch profiles for valid userIds", async () => {
        const lastSeenAt = new Date().toISOString();
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user1",
                        displayName: "Test User",
                        bio: "Test bio",
                        pronouns: "they/them",
                        location: "Test City",
                        website: "https://test.com",
                        avatarFileId: "avatar123",
                    },
                ],
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user1",
                        status: "online",
                        customMessage: "Working",
                        lastSeenAt,
                    },
                ],
            });

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles.user1).toBeDefined();
        expect(data.profiles.user1.displayName).toBe("Test User");
        expect(data.profiles.user1.bio).toBe("Test bio");
        expect(data.profiles.user1.status?.status).toBe("online");
        expect(data.profiles.user1.status?.lastSeenAt).toBe(lastSeenAt);
    });

    it("should deduplicate userIds", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [{ userId: "user1", displayName: "Test User" }],
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({
            userIds: ["user1", "user1", "user1"],
        });
        await POST(request);

        expect(mockListDocuments).toHaveBeenCalledTimes(2);
        expect(mockListDocuments.mock.calls[0]?.[2]?.[0]).toContain("user1");
    });

    it("should handle multiple users in parallel", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    { userId: "user1", displayName: "User 1" },
                    { userId: "user2", displayName: "User 2" },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds: ["user1", "user2"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles.user1).toBeDefined();
        expect(data.profiles.user2).toBeDefined();
        expect(mockListDocuments).toHaveBeenCalledTimes(2);
    });

    it("should handle missing profiles gracefully", async () => {
        mockListDocuments
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles.user1).toBeUndefined();
    });

    it("should handle missing status gracefully", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [{ userId: "user1", displayName: "Test User" }],
            })
            .mockRejectedValueOnce(new Error("Status not found"));

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles.user1).toBeDefined();
        expect(data.profiles.user1.status).toBeUndefined();
    });

    it("should include avatarUrl when avatarFileId exists", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user1",
                        displayName: "Test User",
                        avatarFileId: "avatar123",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });
        mockGetAvatarUrl.mockReturnValue(
            "https://example.com/avatar/avatar123.png",
        );

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        expect(data.profiles.user1.avatarUrl).toBe(
            "https://example.com/avatar/avatar123.png",
        );
        expect(mockGetAvatarUrl).toHaveBeenCalledWith("avatar123");
    });

    it("should not include avatarUrl when avatarFileId is missing", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user1",
                        displayName: "Test User",
                        avatarFileId: undefined,
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        expect(data.profiles.user1.avatarUrl).toBeUndefined();
        expect(mockGetAvatarUrl).not.toHaveBeenCalled();
    });

    it("should include all profile fields", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user1",
                        displayName: "Test User",
                        bio: "Test bio",
                        pronouns: "they/them",
                        location: "Test City",
                        website: "https://test.com",
                        avatarFileId: "avatar123",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        const profile = data.profiles.user1;
        expect(profile.userId).toBe("user1");
        expect(profile.displayName).toBe("Test User");
        expect(profile.bio).toBe("Test bio");
        expect(profile.pronouns).toBe("they/them");
        expect(profile.location).toBe("Test City");
        expect(profile.website).toBe("https://test.com");
        expect(profile.avatarFileId).toBe("avatar123");
    });

    it("should include status fields when present", async () => {
        const lastSeenAt = new Date().toISOString();
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [{ userId: "user1", displayName: "Test User" }],
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        userId: "user1",
                        status: "away",
                        customMessage: "On break",
                        lastSeenAt,
                    },
                ],
            });

        const request = createRequest({ userIds: ["user1"] });
        const response = await POST(request);
        const data = await response.json();

        const status = data.profiles.user1.status;
        expect(status?.status).toBe("away");
        expect(status?.customMessage).toBe("On break");
        expect(status?.lastSeenAt).toBe(lastSeenAt);
    });

    it("should handle mixed success and failure", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    { userId: "user1", displayName: "User 1" },
                    { userId: "user3", displayName: "User 3" },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds: ["user1", "user2", "user3"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles.user1).toBeDefined();
        expect(data.profiles.user2).toBeUndefined();
        expect(data.profiles.user3).toBeDefined();
    });

    it("should handle maximum batch size (100 items)", async () => {
        const userIds = Array.from({ length: 100 }, (_, i) => `user${i}`);
        mockListDocuments
            .mockResolvedValueOnce({
                documents: userIds.map((userId) => ({
                    userId,
                    displayName: `User ${userId}`,
                })),
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds });
        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(mockListDocuments).toHaveBeenCalledTimes(2);
    });

    it("should handle general errors with 500 status", async () => {
        const request = createRequest({ userIds: ["user1"] });
        // Force a JSON parse error by modifying the request
        vi.spyOn(request, "json").mockRejectedValue(new Error("Parse error"));

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to fetch profiles");
    });

    it("should return empty profiles object when all fetches fail", async () => {
        mockListDocuments
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({ userIds: ["user1", "user2"] });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles).toEqual({});
    });

    it("should handle userIds without body wrapper", async () => {
        const request = createRequest({ wrongField: ["user1"] });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("userIds array is required");
    });

    it("should filter blocked users before fetching profiles", async () => {
        mockGetRelationshipMap.mockResolvedValueOnce(
            new Map([
                ["allowed-user", { blockedByMe: false, blockedMe: false }],
                ["blocked-user", { blockedByMe: true, blockedMe: false }],
            ]),
        );
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    { userId: "allowed-user", displayName: "Allowed User" },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        const request = createRequest({
            userIds: ["allowed-user", "blocked-user"],
        });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.profiles["allowed-user"]).toBeDefined();
        expect(data.profiles["blocked-user"]).toBeUndefined();
        expect(mockListDocuments).toHaveBeenCalledTimes(2);
        expect(mockListDocuments.mock.calls[0]?.[2]?.[0]).toContain(
            "allowed-user",
        );
        expect(mockListDocuments.mock.calls[0]?.[2]?.[0]).not.toContain(
            "blocked-user",
        );
    });
});
