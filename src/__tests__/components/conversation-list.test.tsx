/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";

import { ConversationList } from "@/app/chat/components/ConversationList";
import type { Conversation } from "@/lib/types";

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
    function createTestConversation(
        overrides: Partial<Conversation>,
    ): Conversation {
        return {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conv-1",
            participants: ["current-user", "friend-1"],
            ...overrides,
        };
    }

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

    afterEach(() => {
        vi.unstubAllGlobals();
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
        const conversation = createTestConversation({
            $id: "conv-existing",
            otherUser: { userId: "friend-1", displayName: "Friend One" },
        });

        render(
            <ConversationList
                conversations={[conversation]}
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

    it("prioritizes unread conversations when unread state is provided", async () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-read",
                        otherUser: {
                            userId: "friend-read",
                            displayName: "Read Friend",
                        },
                        participants: ["current-user", "friend-read"],
                    }),
                    createTestConversation({
                        $id: "conv-unread",
                        otherUser: {
                            userId: "friend-unread",
                            displayName: "Unread Friend",
                        },
                        participants: ["current-user", "friend-unread"],
                    }),
                ]}
                conversationUnreadStateById={{
                    "conv-unread": { count: 2, muted: false },
                }}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Unread Friend")).toBeInTheDocument();
        });
        expect(screen.queryByText("Read Friend")).not.toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("ignores legacy unreadThreadCount fallback under message_v2 contract", async () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $createdAt: "2026-03-10T12:00:00.000Z",
                        $id: "conv-legacy",
                        otherUser: {
                            displayName: "Legacy Friend",
                            userId: "legacy-friend",
                        },
                        participants: ["current-user", "legacy-friend"],
                        unreadThreadCount: 5,
                    }),
                ]}
                currentUserId="current-user"
                inboxContractVersion="message_v2"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        const conversationButton = screen.getByRole("button", {
            name: /legacy friend/i,
        });

        expect(within(conversationButton).queryByText("5")).toBeNull();
    });

    it("uses conversation unread state over legacy unreadThreadCount in message_v2", async () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-mention",
                        otherUser: {
                            userId: "mention-author",
                            displayName: "Mention Author",
                        },
                        participants: ["current-user", "mention-author"],
                        unreadThreadCount: 99,
                    }),
                ]}
                conversationUnreadStateById={{
                    "conv-mention": { count: 3, muted: false },
                }}
                currentUserId="current-user"
                inboxContractVersion="message_v2"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        expect(
            screen.getByRole("button", { name: /mention author/i }),
        ).toHaveTextContent("3");
        expect(
            screen.getByRole("button", { name: /mention author/i }),
        ).not.toHaveTextContent("99");
    });

    it("selects a conversation when a row is clicked", async () => {
        const onSelectConversation = vi.fn();
        const conversation = createTestConversation({
            $id: "conv-select",
            otherUser: {
                userId: "select-user",
                displayName: "Select Me",
            },
            participants: ["current-user", "select-user"],
        });

        render(
            <ConversationList
                conversations={[conversation]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={onSelectConversation}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /select me/i }));

        expect(onSelectConversation).toHaveBeenCalledWith(conversation);
        expect(mockPush).not.toHaveBeenCalled();
    });
});
