import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NewConversationDialog } from "@/app/chat/components/NewConversationDialog";

const mockSendFriendRequest = vi.fn();
const mockAcceptFriendRequest = vi.fn();
const mockDeclineFriendRequest = vi.fn();

vi.mock("next/image", () => ({
    default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("@/hooks/useRelationship", () => ({
    useRelationship: (targetUserId: string) => {
        if (targetUserId === "friend-only-user") {
            return {
                relationship: {
                    isFriend: false,
                    incomingRequest: false,
                    outgoingRequest: false,
                    blockedByMe: false,
                    blockedMe: false,
                    directMessagePrivacy: "friends",
                    canReceiveFriendRequest: true,
                    canSendDirectMessage: false,
                },
                loading: false,
                actionLoading: false,
                sendFriendRequest: mockSendFriendRequest,
                acceptFriendRequest: mockAcceptFriendRequest,
                declineFriendRequest: mockDeclineFriendRequest,
            };
        }

        if (targetUserId === "incoming-user") {
            return {
                relationship: {
                    isFriend: false,
                    incomingRequest: true,
                    outgoingRequest: false,
                    blockedByMe: false,
                    blockedMe: false,
                    directMessagePrivacy: "everyone",
                    canReceiveFriendRequest: false,
                    canSendDirectMessage: true,
                },
                loading: false,
                actionLoading: false,
                sendFriendRequest: mockSendFriendRequest,
                acceptFriendRequest: mockAcceptFriendRequest,
                declineFriendRequest: mockDeclineFriendRequest,
            };
        }

        return {
            relationship: null,
            loading: false,
            actionLoading: false,
            sendFriendRequest: mockSendFriendRequest,
            acceptFriendRequest: mockAcceptFriendRequest,
            declineFriendRequest: mockDeclineFriendRequest,
        };
    },
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
    createGroupConversation: vi.fn(),
    getOrCreateConversation: vi.fn(),
    uploadImage: vi.fn(),
}));

const originalFetch = global.fetch;

describe("NewConversationDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                users: [
                    {
                        userId: "friend-only-user",
                        displayName: "Friends Only",
                        pronouns: "they/them",
                    },
                    {
                        userId: "incoming-user",
                        displayName: "Incoming Friend",
                    },
                ],
            }),
        } as Response);
        mockSendFriendRequest.mockResolvedValue(true);
        mockAcceptFriendRequest.mockResolvedValue(true);
        mockDeclineFriendRequest.mockResolvedValue(true);
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("renders relationship badges and sends a friend request from search results", async () => {
        render(
            <NewConversationDialog
                currentUserId="current-user"
                onConversationCreated={vi.fn()}
                onOpenChange={vi.fn()}
                open={true}
            />,
        );

        fireEvent.change(screen.getByLabelText("Search by name or user ID"), {
            target: { value: "fr" },
        });

        await waitFor(
            () => {
                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/users/search?q=fr",
                );
            },
            { timeout: 2000 },
        );

        await waitFor(
            () => {
                expect(screen.getByText("Friends Only")).toBeInTheDocument();
            },
            { timeout: 2000 },
        );

        expect(screen.getByText("Friends-only DMs")).toBeInTheDocument();
        expect(screen.getByText("Incoming request")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Add Friend" }));

        await waitFor(() => {
            expect(mockSendFriendRequest).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole("button", { name: "Accept" }));

        await waitFor(() => {
            expect(mockAcceptFriendRequest).toHaveBeenCalledTimes(1);
        });
    });
});
