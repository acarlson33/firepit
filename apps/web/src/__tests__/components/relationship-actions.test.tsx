/// <reference lib="dom" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RelationshipActions } from "../../components/relationship-actions";

const { mockUseRelationship, mockToastSuccess } = vi.hoisted(() => ({
    mockUseRelationship: vi.fn(),
    mockToastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        success: mockToastSuccess,
        error: vi.fn(),
    },
}));

vi.mock("@/hooks/useRelationship", () => ({
    useRelationship: (targetUserId: string) =>
        mockUseRelationship(targetUserId),
}));

describe("RelationshipActions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders incoming request controls and accepts a request", async () => {
        const acceptFriendRequest = vi.fn().mockResolvedValue(true);

        mockUseRelationship.mockReturnValue({
            relationship: {
                isFriend: false,
                incomingRequest: true,
                outgoingRequest: false,
                blockedByMe: false,
                blockedMe: false,
                directMessagePrivacy: "everyone",
                canReceiveFriendRequest: false,
            },
            loading: false,
            actionLoading: false,
            error: null,
            isSelf: false,
            sendFriendRequest: vi.fn(),
            acceptFriendRequest,
            declineFriendRequest: vi.fn().mockResolvedValue(true),
            removeFriendship: vi.fn().mockResolvedValue(true),
            blockUser: vi.fn().mockResolvedValue(true),
            unblockUser: vi.fn().mockResolvedValue(true),
        });

        render(
            <RelationshipActions
                displayName="Incoming User"
                targetUserId="user-2"
            />,
        );

        expect(screen.getByText("Incoming request")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Accept" }));

        await waitFor(() => {
            expect(acceptFriendRequest).toHaveBeenCalledTimes(1);
        });
        expect(mockToastSuccess).toHaveBeenCalledWith(
            "You are now friends with Incoming User",
        );
    });

    it("shows add friend and privacy badges when DMs require friendship", async () => {
        const sendFriendRequest = vi.fn().mockResolvedValue(true);

        mockUseRelationship.mockReturnValue({
            relationship: {
                isFriend: false,
                incomingRequest: false,
                outgoingRequest: false,
                blockedByMe: false,
                blockedMe: false,
                directMessagePrivacy: "friends",
                canReceiveFriendRequest: true,
            },
            loading: false,
            actionLoading: false,
            error: null,
            isSelf: false,
            sendFriendRequest,
            acceptFriendRequest: vi.fn().mockResolvedValue(true),
            declineFriendRequest: vi.fn().mockResolvedValue(true),
            removeFriendship: vi.fn().mockResolvedValue(true),
            blockUser: vi.fn().mockResolvedValue(true),
            unblockUser: vi.fn().mockResolvedValue(true),
        });

        render(
            <RelationshipActions
                displayName="Friends Only"
                targetUserId="user-3"
            />,
        );

        expect(screen.getByText("Friends-only DMs")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Add Friend" }));

        await waitFor(() => {
            expect(sendFriendRequest).toHaveBeenCalledTimes(1);
        });
        expect(mockToastSuccess).toHaveBeenCalledWith(
            "Sent a friend request to Friends Only",
        );
    });

    it("shows unblock controls when the user is already blocked", async () => {
        const unblockUser = vi.fn().mockResolvedValue(true);

        mockUseRelationship.mockReturnValue({
            relationship: {
                isFriend: false,
                incomingRequest: false,
                outgoingRequest: false,
                blockedByMe: true,
                blockedMe: false,
                directMessagePrivacy: "everyone",
                canReceiveFriendRequest: false,
            },
            loading: false,
            actionLoading: false,
            error: null,
            isSelf: false,
            sendFriendRequest: vi.fn().mockResolvedValue(true),
            acceptFriendRequest: vi.fn().mockResolvedValue(true),
            declineFriendRequest: vi.fn().mockResolvedValue(true),
            removeFriendship: vi.fn().mockResolvedValue(true),
            blockUser: vi.fn().mockResolvedValue(true),
            unblockUser,
        });

        render(
            <RelationshipActions
                displayName="Blocked User"
                targetUserId="user-4"
            />,
        );

        expect(screen.getByText("Blocked")).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Block" }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Unblock" }));

        await waitFor(() => {
            expect(unblockUser).toHaveBeenCalledTimes(1);
        });
        expect(mockToastSuccess).toHaveBeenCalledWith("Unblocked Blocked User");
    });
});
