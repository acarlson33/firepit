import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRelationshipStatus, mockGetServerSession } = vi.hoisted(
    () => ({
        mockGetRelationshipStatus: vi.fn(),
        mockGetServerSession: vi.fn(),
    }),
);

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-friendships", () => {
    class RelationshipError extends Error {
        readonly status: number;

        constructor(message: string, status = 400) {
            super(message);
            this.name = "RelationshipError";
            this.status = status;
        }
    }

    return {
        RelationshipError,
        getRelationshipStatus: mockGetRelationshipStatus,
    };
});

const { GET } = await import("../../app/api/users/[userId]/relationship/route");

describe("user relationship API route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue({
            $id: "user-1",
            email: "test@example.com",
            name: "Test User",
        });
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/users/user-2/relationship"), {
            params: Promise.resolve({ userId: "user-2" }),
        });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
        expect(mockGetRelationshipStatus).not.toHaveBeenCalled();
    });

    it("returns the relationship payload for the requested user", async () => {
        mockGetRelationshipStatus.mockResolvedValue({
            blockedByMe: false,
            blockedMe: false,
            canReceiveFriendRequest: true,
            canSendDirectMessage: true,
            directMessagePrivacy: "everyone",
            incomingRequest: false,
            friendshipStatus: "accepted",
            isFriend: true,
            outgoingRequest: false,
            userId: "user-2",
        });

        const response = await GET(
            new Request("http://localhost/api/users/user-2/relationship"),
            {
                params: Promise.resolve({ userId: "user-2" }),
            },
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.relationship.userId).toBe("user-2");
        expect(mockGetRelationshipStatus).toHaveBeenCalledWith(
            "user-1",
            "user-2",
        );
    });

    it("surfaces relationship errors with their status codes", async () => {
        const { RelationshipError } = await import(
            "@/lib/appwrite-friendships"
        );

        mockGetRelationshipStatus.mockRejectedValue(
            new RelationshipError("You cannot check a relationship with yourself", 400),
        );

        const response = await GET(
            new Request("http://localhost/api/users/user-1/relationship"),
            {
                params: Promise.resolve({ userId: "user-1" }),
            },
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe(
            "You cannot check a relationship with yourself",
        );
    });

    it("returns 500 for unexpected failures", async () => {
        mockGetRelationshipStatus.mockRejectedValue(new Error("database down"));

        const response = await GET(
            new Request("http://localhost/api/users/user-2/relationship"),
            {
                params: Promise.resolve({ userId: "user-2" }),
            },
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("database down");
    });
});