import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConversationList } from "@/app/chat/components/ConversationList";
import type { InboxItem } from "@/lib/types";

const mockUseFriends = vi.fn();
const mockGetOrCreateConversation = vi.fn();
const mockListInboxWithFilters = vi.fn();
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

vi.mock("@/lib/inbox-client", () => ({
    listInboxWithFilters: (...args: unknown[]) =>
        mockListInboxWithFilters(...args),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

describe("ConversationList", () => {
    function createTestInboxItem(overrides: Partial<InboxItem>): InboxItem {
        return {
            authorLabel: "Test Author",
            authorUserId: "test-user",
            contextId: "context-1",
            contextKind: "conversation",
            id: "inbox-item-1",
            kind: "mention",
            latestActivityAt: "2026-03-10T12:00:00.000Z",
            messageId: "message-1",
            muted: false,
            previewText: "Preview",
            unreadCount: 1,
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
        mockListInboxWithFilters.mockResolvedValue({
            contractVersion: "message_v2",
            counts: { mention: 0, thread: 0 },
            items: [],
            unreadCount: 0,
        });
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
                inboxItems={[]}
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
                inboxItems={[]}
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

    it("renders unified inbox items across direct messages and channels", async () => {
        mockListInboxWithFilters.mockResolvedValueOnce({
            contractVersion: "message_v2",
            counts: { mention: 1, thread: 1 },
            items: [
                {
                    authorLabel: "Unread Friend",
                    authorUserId: "unread-friend",
                    contextId: "conv-unread",
                    contextKind: "conversation",
                    id: "thread:conversation:conv-unread:message-1",
                    kind: "thread",
                    latestActivityAt: "2026-03-11T12:00:00.000Z",
                    messageId: "message-1",
                    muted: false,
                    previewText: "Unread thread reply",
                    unreadCount: 2,
                },
                {
                    authorLabel: "Channel Author",
                    authorUserId: "channel-user",
                    contextId: "channel-1",
                    contextKind: "channel",
                    id: "mention:channel:channel-1:message-2",
                    kind: "mention",
                    latestActivityAt: "2026-03-11T12:01:00.000Z",
                    messageId: "message-2",
                    muted: true,
                    previewText: "hello @current-user",
                    serverId: "server-1",
                    unreadCount: 1,
                },
            ],
            unreadCount: 3,
        });

        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                inboxItems={[
                    createTestInboxItem({
                        authorLabel: "Unread Friend",
                        authorUserId: "unread-friend",
                        contextId: "conv-unread",
                        contextKind: "conversation",
                        id: "thread:conversation:conv-unread:message-1",
                        kind: "thread",
                        latestActivityAt: "2026-03-11T12:00:00.000Z",
                        messageId: "message-1",
                        muted: false,
                        previewText: "Unread thread reply",
                        unreadCount: 2,
                    }),
                    createTestInboxItem({
                        authorLabel: "Channel Author",
                        authorUserId: "channel-user",
                        contextId: "channel-1",
                        contextKind: "channel",
                        id: "mention:channel:channel-1:message-2",
                        kind: "mention",
                        latestActivityAt: "2026-03-11T12:01:00.000Z",
                        messageId: "message-2",
                        muted: true,
                        previewText: "hello @current-user",
                        serverId: "server-1",
                        unreadCount: 1,
                    }),
                ]}
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /inbox/i }));

        await waitFor(() => {
            expect(screen.getByText("Unread Friend")).toBeInTheDocument();
        });
        expect(screen.getByText("Channel Author")).toBeInTheDocument();
        expect(screen.getByText("Direct message")).toBeInTheDocument();
        expect(screen.getByText("Channel")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /inbox/i }),
        ).toHaveTextContent("3");
    });

    it("ignores legacy unreadThreadCount fallback under message_v2 contract", async () => {
        render(
            <ConversationList
                conversations={
                    [
                        {
                            $createdAt: "2026-03-10T12:00:00.000Z",
                            $id: "conv-legacy",
                            otherUser: {
                                displayName: "Legacy Friend",
                                userId: "legacy-friend",
                            },
                            participants: ["current-user", "legacy-friend"],
                            unreadThreadCount: 5,
                        },
                    ] as never[]
                }
                currentUserId="current-user"
                inboxContractVersion="message_v2"
                inboxItems={[]}
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

        expect(conversationButton).not.toHaveTextContent("5");
    });

    it("renders mention inbox items and routes using unread entry links", async () => {
        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                inboxItems={[
                    createTestInboxItem({
                        authorLabel: "Mention Author",
                        authorUserId: "mention-author",
                        contextId: "conv-mention",
                        contextKind: "conversation",
                        id: "mention:conversation:conv-mention:message-1",
                        kind: "mention",
                        latestActivityAt: "2026-03-10T12:00:00.000Z",
                        messageId: "message-1",
                        muted: false,
                        previewText: "hello @current-user",
                        unreadCount: 1,
                    }),
                ]}
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /mentions/i }));

        fireEvent.click(
            screen.getByRole("button", { name: /mention author/i }),
        );

        expect(mockPush).toHaveBeenCalledWith(
            "/chat?conversation=conv-mention&unread=message-1",
        );
    });

    it("filters inbox items by all, direct, and server views", async () => {
        mockListInboxWithFilters.mockImplementation(async (params) => {
            if (params?.scope === "direct") {
                return {
                    contractVersion: "message_v2",
                    counts: { mention: 0, thread: 1 },
                    items: [
                        {
                            authorLabel: "Direct Author",
                            authorUserId: "user-direct",
                            contextId: "conv-1",
                            contextKind: "conversation",
                            id: "thread:conversation:conv-1:message-1",
                            kind: "thread",
                            latestActivityAt: "2026-03-11T12:00:00.000Z",
                            messageId: "message-1",
                            muted: false,
                            previewText: "direct unread",
                            unreadCount: 1,
                        },
                    ],
                    unreadCount: 1,
                };
            }

            if (params?.scope === "server") {
                return {
                    contractVersion: "message_v2",
                    counts: { mention: 1, thread: 0 },
                    items: [
                        {
                            authorLabel: "Server Author",
                            authorUserId: "user-server",
                            contextId: "channel-1",
                            contextKind: "channel",
                            id: "mention-item-1",
                            kind: "mention",
                            latestActivityAt: "2026-03-11T12:01:00.000Z",
                            messageId: "message-2",
                            muted: false,
                            previewText: "server mention",
                            unreadCount: 1,
                        },
                    ],
                    unreadCount: 1,
                };
            }

            return {
                contractVersion: "message_v2",
                counts: { mention: 1, thread: 1 },
                items: [
                    {
                        authorLabel: "Direct Author",
                        authorUserId: "user-direct",
                        contextId: "conv-1",
                        contextKind: "conversation",
                        id: "thread:conversation:conv-1:message-1",
                        kind: "thread",
                        latestActivityAt: "2026-03-11T12:00:00.000Z",
                        messageId: "message-1",
                        muted: false,
                        previewText: "direct unread",
                        unreadCount: 1,
                    },
                    {
                        authorLabel: "Server Author",
                        authorUserId: "user-server",
                        contextId: "channel-1",
                        contextKind: "channel",
                        id: "mention-item-1",
                        kind: "mention",
                        latestActivityAt: "2026-03-11T12:01:00.000Z",
                        messageId: "message-2",
                        muted: false,
                        previewText: "server mention",
                        unreadCount: 1,
                    },
                ],
                unreadCount: 2,
            };
        });

        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                inboxItems={[
                    createTestInboxItem({
                        authorLabel: "Direct Author",
                        authorUserId: "user-direct",
                        contextId: "conv-1",
                        contextKind: "conversation",
                        id: "thread:conversation:conv-1:message-1",
                        kind: "thread",
                        latestActivityAt: "2026-03-11T12:00:00.000Z",
                        messageId: "message-1",
                        muted: false,
                        previewText: "direct unread",
                        unreadCount: 1,
                    }),
                    createTestInboxItem({
                        authorLabel: "Server Author",
                        authorUserId: "user-server",
                        contextId: "channel-1",
                        contextKind: "channel",
                        id: "mention-item-1",
                        kind: "mention",
                        latestActivityAt: "2026-03-11T12:01:00.000Z",
                        messageId: "message-2",
                        muted: false,
                        previewText: "server mention",
                        unreadCount: 1,
                    }),
                ]}
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /inbox/i }));
        await waitFor(() => {
            expect(screen.getByText("Direct Author")).toBeInTheDocument();
            expect(screen.getByText("Server Author")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /^Direct$/i }));
        await waitFor(() => {
            expect(screen.getByText("Direct Author")).toBeInTheDocument();
            expect(screen.queryByText("Server Author")).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /^Servers$/i }));
        await waitFor(() => {
            expect(screen.getByText("Server Author")).toBeInTheDocument();
            expect(screen.queryByText("Direct Author")).not.toBeInTheDocument();
        });

        expect(mockListInboxWithFilters).toHaveBeenCalledWith({
            scope: "direct",
            kinds: undefined,
        });
        expect(mockListInboxWithFilters).toHaveBeenCalledWith({
            scope: "server",
            kinds: undefined,
        });
    });
});
