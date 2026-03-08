import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDatabases, mockGetOrCreateNotificationSettings } = vi.hoisted(
    () => ({
        mockDatabases: {
            listDocuments: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
            deleteDocument: vi.fn(),
        },
        mockGetOrCreateNotificationSettings: vi.fn(),
    }),
);

vi.mock("node-appwrite", () => ({
    ID: {
        unique: () => "generated-id",
    },
    Permission: {
        read: (role: string) => `read:${role}`,
        update: (role: string) => `update:${role}`,
        delete: (role: string) => `delete:${role}`,
    },
    Role: {
        user: (userId: string) => `user:${userId}`,
    },
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (limit: number) => `limit(${limit})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
    },
}));

vi.mock("@/lib/appwrite-admin", () => ({
    getAdminClient: () => ({
        databases: mockDatabases,
    }),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: () => ({
        databaseId: "test-db",
        collections: {
            friendships: "friendships",
            blocks: "blocks",
        },
    }),
}));

vi.mock("@/lib/notification-settings", () => ({
    getOrCreateNotificationSettings: mockGetOrCreateNotificationSettings,
}));

describe("appwrite-friendships", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetOrCreateNotificationSettings.mockResolvedValue({
            directMessagePrivacy: "everyone",
        });
    });

    it("rejects friend requests when the requester has blocked the target", async () => {
        const { RelationshipError, createFriendRequest } =
            await import("@/lib/appwrite-friendships");

        mockDatabases.listDocuments
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "block-1",
                        userId: "user-1",
                        blockedUserId: "user-2",
                        blockedAt: "2026-03-08T00:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        await expect(
            createFriendRequest("user-1", "user-2"),
        ).rejects.toMatchObject({
            name: RelationshipError.name,
            status: 409,
        });

        expect(mockDatabases.createDocument).not.toHaveBeenCalled();
    });

    it("auto-accepts a reciprocal pending friend request", async () => {
        const { createFriendRequest } =
            await import("@/lib/appwrite-friendships");

        mockDatabases.listDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "friendship-1",
                        requesterId: "user-2",
                        recipientId: "user-1",
                        pairKey: "user-1:user-2",
                        status: "pending",
                        requestedAt: "2026-03-07T00:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({ documents: [] });

        mockDatabases.updateDocument.mockResolvedValue({
            $id: "friendship-1",
            requesterId: "user-2",
            recipientId: "user-1",
            pairKey: "user-1:user-2",
            status: "accepted",
            requestedAt: "2026-03-07T00:00:00.000Z",
            respondedAt: "2026-03-08T00:00:00.000Z",
            acceptedAt: "2026-03-08T00:00:00.000Z",
        });

        const friendship = await createFriendRequest("user-1", "user-2");

        expect(friendship.status).toBe("accepted");
        expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
            "test-db",
            "friendships",
            "friendship-1",
            expect.objectContaining({
                status: "accepted",
            }),
        );
    });

    it("respects friend-only DM privacy in relationship status", async () => {
        const { getRelationshipStatus } =
            await import("@/lib/appwrite-friendships");

        mockDatabases.listDocuments
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({ documents: [] });
        mockGetOrCreateNotificationSettings.mockResolvedValue({
            directMessagePrivacy: "friends",
        });

        const relationship = await getRelationshipStatus("user-1", "user-2");

        expect(relationship.isFriend).toBe(false);
        expect(relationship.directMessagePrivacy).toBe("friends");
        expect(relationship.canSendDirectMessage).toBe(false);
        expect(relationship.canReceiveFriendRequest).toBe(true);
    });
});
