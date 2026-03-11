import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConversationList } from "@/app/chat/components/ConversationList";

const mockUseFriends = vi.fn();
const mockGetOrCreateConversation = vi.fn();
const mockPush = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/hooks/useFriends", () => ({
    useFriends: (enabled: boolean) => mockUseFriends(enabled),
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
    getOrCreateConversation: (...args: unknown[]) =>
        mockGetOrCreateConversation(...args),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

describe("ConversationList", () => {
    function clickFriendShortcut(name: string) {
        const label = screen.getAllByText(name)[0];
        const shortcutButton = label.closest("button");
        if (!shortcutButton) {
            throw new Error(`Shortcut button not found for ${name}`);
        }

        fireEvent.click(shortcutButton);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", vi.fn());
        mockUseFriends.mockReturnValue({
            friends: [
                {
                    friendship: {
                        $id: "friendship-1",
                    },
                    user: {
                        userId: "friend-1",
                        displayName: "Friend One",
                        pronouns: "they/them",
                    },
                },
            ],
            incoming: [
                {
                    friendship: {
                        $id: "incoming-1",
                    },
                    user: {
                        userId: "incoming-user",
                        displayName: "Incoming User",
                    },
                },
            ],
            loading: false,
            actionLoading: null,
            acceptFriendRequest: vi.fn().mockResolvedValue(true),
            declineFriendRequest: vi.fn().mockResolvedValue(true),
            removeFriendship: vi.fn().mockResolvedValue(true),
        });
    });

    it("creates a direct message from a friend shortcut when no existing conversation exists", async () => {
        mockGetOrCreateConversation.mockResolvedValue({ $id: "conv-new" });
        const onConversationCreated = vi.fn();

        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={onConversationCreated}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        clickFriendShortcut("Friend One");

        await waitFor(() => {
            expect(mockGetOrCreateConversation).toHaveBeenCalledWith(
                "current-user",
                "friend-1",
            );
        });

        expect(onConversationCreated).toHaveBeenCalledWith({ $id: "conv-new" });
    });

    it("selects an existing one-to-one conversation from a friend shortcut", async () => {
        const onSelectConversation = vi.fn();
        const conversation = {
            $id: "conv-existing",
            participants: ["current-user", "friend-1"],
            otherUser: { userId: "friend-1", displayName: "Friend One" },
        };

        render(
            <ConversationList
                conversations={[conversation] as never[]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={onSelectConversation}
                selectedConversationId={null}
            />,
        );

        clickFriendShortcut("Friend One");

        expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
        expect(onSelectConversation).toHaveBeenCalledWith(conversation);
    });

    it("filters the inbox view to unread conversations", async () => {
        render(
            <ConversationList
                conversations={
                    [
                        {
                            $id: "conv-unread",
                            otherUser: {
                                displayName: "Unread Friend",
                                userId: "unread-friend",
                            },
                            participants: ["current-user", "unread-friend"],
                            unreadThreadCount: 2,
                        },
                        {
                            $id: "conv-read",
                            otherUser: {
                                displayName: "Read Friend",
                                userId: "read-friend",
                            },
                            participants: ["current-user", "read-friend"],
                            unreadThreadCount: 0,
                        },
                    ] as never[]
                }
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /inbox/i }));

        expect(screen.getByText("Unread Friend")).toBeInTheDocument();
        expect(screen.queryByText("Read Friend")).not.toBeInTheDocument();
        expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });

    it("loads mentions and routes to the highlighted message", async () => {
        vi.mocked(fetch).mockResolvedValue({
            json: vi.fn().mockResolvedValue({
                results: [
                    {
                        message: {
                            $createdAt: "2026-03-10T12:00:00.000Z",
                            $id: "message-1",
                            conversationId: "conv-mention",
                            senderDisplayName: "Mention Author",
                            text: "hello @current-user",
                        },
                        type: "dm",
                    },
                ],
            }),
            ok: true,
        } as Response);

        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /mentions/i }));

        await waitFor(() => {
            expect(screen.getByText("Mention Author")).toBeInTheDocument();
        });

        fireEvent.click(
            screen.getByRole("button", { name: /mention author/i }),
        );

        expect(mockPush).toHaveBeenCalledWith(
            "/chat?conversation=conv-mention&highlight=message-1",
        );
    });
});
