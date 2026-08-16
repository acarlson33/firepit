import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockGetServerSession,
    mockCreateFriendRequest,
    mockGetRelationshipStatus,
    mockListFriendshipsForUser,
    mockRespondToFriendRequest,
    mockRemoveFriendship,
    mockBlockUser,
    mockUnblockUser,
    mockListBlockedUsers,
    mockGetFriendshipOtherUserId,
    mockGetProfilesByUserIds,
    mockGetAvatarUrl,
    mockGetPredefinedAvatarFrameUrlByPresetId,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockCreateFriendRequest: vi.fn(),
    mockGetRelationshipStatus: vi.fn(),
    mockListFriendshipsForUser: vi.fn(),
    mockRespondToFriendRequest: vi.fn(),
    mockRemoveFriendship: vi.fn(),
    mockBlockUser: vi.fn(),
    mockUnblockUser: vi.fn(),
    mockListBlockedUsers: vi.fn(),
    mockGetFriendshipOtherUserId: vi.fn(),
    mockGetProfilesByUserIds: vi.fn(),
    mockGetAvatarUrl: vi.fn(),
    mockGetPredefinedAvatarFrameUrlByPresetId: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-friendships", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/appwrite-friendships")
    >("@/lib/appwrite-friendships");

    return {
        ...actual,
        createFriendRequest: mockCreateFriendRequest,
        getRelationshipStatus: mockGetRelationshipStatus,
        listFriendshipsForUser: mockListFriendshipsForUser,
        respondToFriendRequest: mockRespondToFriendRequest,
        removeFriendship: mockRemoveFriendship,
        blockUser: mockBlockUser,
        unblockUser: mockUnblockUser,
        listBlockedUsers: mockListBlockedUsers,
        getFriendshipOtherUserId: mockGetFriendshipOtherUserId,
    };
});

vi.mock("@/lib/appwrite-profiles", () => ({
    getProfilesByUserIds: mockGetProfilesByUserIds,
    getAvatarUrl: mockGetAvatarUrl,
    getPredefinedAvatarFrameUrlByPresetId:
        mockGetPredefinedAvatarFrameUrlByPresetId,
}));

describe("friend system API routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGetServerSession.mockResolvedValue({ $id: "current-user" });
        mockGetRelationshipStatus.mockResolvedValue({
            userId: "user-2",
            friendshipStatus: "pending",
            isFriend: false,
            outgoingRequest: true,
            incomingRequest: false,
            blockedByMe: false,
            blockedMe: false,
            directMessagePrivacy: "everyone",
            canSendDirectMessage: true,
            canReceiveFriendRequest: false,
        });
        mockGetFriendshipOtherUserId.mockImplementation(
            (
                friendship: { requesterId: string; recipientId: string },
                currentUserId: string,
            ) =>
                friendship.requesterId === currentUserId
                    ? friendship.recipientId
                    : friendship.requesterId,
        );
        mockGetProfilesByUserIds.mockResolvedValue(
            new Map([
                [
                    "user-2",
                    {
                        userId: "user-2",
                        displayName: "User Two",
                        pronouns: "they/them",
                        avatarFileId: "avatar-2",
                    },
                ],
                [
                    "user-3",
                    {
                        userId: "user-3",
                        displayName: "User Three",
                    },
                ],
            ]),
        );
        mockGetAvatarUrl.mockImplementation(
            (fileId: string) => `https://cdn.test/${fileId}`,
        );
        mockGetPredefinedAvatarFrameUrlByPresetId.mockReturnValue(undefined);
    });

    it("lists friends, incoming requests, and outgoing requests with profile summaries", async () => {
        const friendship = {
            $id: "friendship-1",
            requesterId: "current-user",
            recipientId: "user-2",
            pairKey: "current-user:user-2",
            status: "accepted",
            requestedAt: "2026-03-01T00:00:00.000Z",
        };

        mockListFriendshipsForUser.mockResolvedValue({
            friends: [friendship],
            incoming: [
                {
                    $id: "friendship-2",
                    requesterId: "user-3",
                    recipientId: "current-user",
                    pairKey: "current-user:user-3",
                    status: "pending",
                    requestedAt: "2026-03-02T00:00:00.000Z",
                },
            ],
            outgoing: [],
        });

        const { GET } = await import("@/app/api/friends/route");
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListFriendshipsForUser).toHaveBeenCalledWith("current-user");
        expect(data.friends).toEqual([
            {
                friendship,
                user: {
                    userId: "user-2",
                    displayName: "User Two",
                    pronouns: "they/them",
                    avatarUrl: "https://cdn.test/avatar-2",
                },
            },
        ]);
        expect(data.incoming[0].user.displayName).toBe("User Three");
    });

    it("creates a friend request and returns the refreshed relationship", async () => {
        mockCreateFriendRequest.mockResolvedValue({
            $id: "friendship-1",
            requesterId: "current-user",
            recipientId: "user-2",
            status: "pending",
        });

        const { POST } = await import("@/app/api/friends/request/route");
        const response = await POST(
            new Request("http://localhost/api/friends/request", {
                method: "POST",
                body: JSON.stringify({ targetUserId: "user-2" }),
                headers: { "Content-Type": "application/json" },
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(mockCreateFriendRequest).toHaveBeenCalledWith(
            "current-user",
            "user-2",
        );
        expect(mockGetRelationshipStatus).toHaveBeenCalledWith(
            "current-user",
            "user-2",
        );
        expect(data.relationship.outgoingRequest).toBe(true);
    });

    it("rejects friend requests without a target user id", async () => {
        const { POST } = await import("@/app/api/friends/request/route");
        const response = await POST(
            new Request("http://localhost/api/friends/request", {
                method: "POST",
                body: JSON.stringify({}),
                headers: { "Content-Type": "application/json" },
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("targetUserId is required");
        expect(mockCreateFriendRequest).not.toHaveBeenCalled();
    });

    it("accepts and removes friendships through the user-specific routes", async () => {
        mockRespondToFriendRequest.mockResolvedValue({
            $id: "friendship-2",
            status: "accepted",
        });
        mockRemoveFriendship.mockResolvedValue({
            $id: "friendship-2",
            status: "accepted",
        });

        const acceptRoute =
            await import("@/app/api/friends/[userId]/accept/route");
        const removeRoute = await import("@/app/api/friends/[userId]/route");

        const acceptResponse = await acceptRoute.POST(
            new Request("http://localhost/api/friends/user-2/accept", {
                method: "POST",
            }),
            { params: Promise.resolve({ userId: "user-2" }) },
        );
        const removeResponse = await removeRoute.DELETE(
            new Request("http://localhost/api/friends/user-2", {
                method: "DELETE",
            }),
            { params: Promise.resolve({ userId: "user-2" }) },
        );

        expect(acceptResponse.status).toBe(200);
        expect(removeResponse.status).toBe(200);
        expect(mockRespondToFriendRequest).toHaveBeenCalledWith(
            "current-user",
            "user-2",
            "accept",
        );
        expect(mockRemoveFriendship).toHaveBeenCalledWith(
            "current-user",
            "user-2",
        );
    });

    it("blocks and unblocks users through the block route", async () => {
        mockBlockUser.mockResolvedValue({
            $id: "block-1",
            userId: "current-user",
            blockedUserId: "user-2",
            blockedAt: "2026-03-09T00:00:00.000Z",
            reason: "spam",
        });
        mockUnblockUser.mockResolvedValue({
            $id: "block-1",
            userId: "current-user",
            blockedUserId: "user-2",
            blockedAt: "2026-03-09T00:00:00.000Z",
        });

        const route = await import("@/app/api/users/[userId]/block/route");

        const postResponse = await route.POST(
            new Request("http://localhost/api/users/user-2/block", {
                method: "POST",
                body: JSON.stringify({ reason: "spam" }),
                headers: { "Content-Type": "application/json" },
            }),
            { params: Promise.resolve({ userId: "user-2" }) },
        );
        const deleteResponse = await route.DELETE(
            new Request("http://localhost/api/users/user-2/block", {
                method: "DELETE",
            }),
            { params: Promise.resolve({ userId: "user-2" }) },
        );

        expect(postResponse.status).toBe(201);
        expect(deleteResponse.status).toBe(200);
        expect(mockBlockUser).toHaveBeenCalledWith(
            "current-user",
            "user-2",
            "spam",
        );
        expect(mockUnblockUser).toHaveBeenCalledWith("current-user", "user-2");
    });

    it("lists blocked users with enriched profile data", async () => {
        mockListBlockedUsers.mockResolvedValue([
            {
                $id: "block-1",
                userId: "current-user",
                blockedUserId: "user-2",
                blockedAt: "2026-03-09T00:00:00.000Z",
                reason: "spam",
            },
        ]);

        const { GET } = await import("@/app/api/users/blocked/route");
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListBlockedUsers).toHaveBeenCalledWith("current-user");
        expect(data.items).toEqual([
            {
                block: {
                    $id: "block-1",
                    userId: "current-user",
                    blockedUserId: "user-2",
                    blockedAt: "2026-03-09T00:00:00.000Z",
                    reason: "spam",
                },
                user: {
                    userId: "user-2",
                    displayName: "User Two",
                    pronouns: "they/them",
                    avatarUrl: "https://cdn.test/avatar-2",
                },
            },
        ]);
    });
});
