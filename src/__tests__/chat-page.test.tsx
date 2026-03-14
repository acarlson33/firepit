import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
    default: () => () => null,
}));

const {
    mockConversations,
    mockContextInboxItems,
    mockInboxRefresh,
    mockUseInbox,
    mockUseInboxDigest,
    mockJumpToMessage,
    mockJumpToMessageWhenReady,
    mockReplace,
    mockSearchParams,
    mockSetSelectedServer,
} = vi.hoisted(() => ({
    mockConversations: [] as Array<{
        $id: string;
        participants: string[];
        $createdAt: string;
    }>,
    mockContextInboxItems: [] as Array<{
        authorLabel: string;
        authorUserId: string;
        contextId: string;
        contextKind: "channel" | "conversation";
        id: string;
        kind: "mention" | "thread";
        latestActivityAt: string;
        messageId: string;
        muted: boolean;
        previewText: string;
        unreadCount: number;
    }>,
    mockInboxRefresh: vi.fn(),
    mockUseInbox: vi.fn(),
    mockUseInboxDigest: vi.fn(),
    mockJumpToMessage: vi.fn(),
    mockJumpToMessageWhenReady: vi.fn(() => vi.fn()),
    mockReplace: vi.fn(),
    mockSearchParams: new URLSearchParams(),
    mockSetSelectedServer: vi.fn(),
}));

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
    useSearchParams: () => ({
        get: (key: string) => mockSearchParams.get(key),
        toString: () => mockSearchParams.toString(),
    }),
}));

vi.mock("@/lib/message-navigation", () => ({
    jumpToMessage: (...args: unknown[]) => mockJumpToMessage(...args),
    jumpToMessageWhenReady: (...args: unknown[]) =>
        mockJumpToMessageWhenReady(...args),
}));

vi.mock("@/contexts/auth-context", () => ({
    useAuth: () => ({
        loading: false,
        userData: {
            name: "User One",
            userId: "user-1",
        },
    }),
}));

vi.mock("@/hooks/useNotificationSettings", () => ({
    useNotificationSettings: () => ({
        refetch: vi.fn(),
        settings: null,
    }),
}));

vi.mock("@/hooks/useNotifications", () => ({
    useNotifications: () => ({
        requestPermission: vi.fn(),
    }),
}));

vi.mock("@/hooks/useCustomEmojis", () => ({
    useCustomEmojis: () => ({
        customEmojis: [],
        uploadEmoji: vi.fn(),
    }),
}));

vi.mock("@/components/chat-surface-panel", () => ({
    ChatSurfacePanel: ({
        onJumpToUnread,
        showSurface,
        surfaceMessages,
    }: {
        onJumpToUnread?: () => void;
        showSurface?: boolean;
        surfaceMessages: Array<{ text: string }>;
    }) => (
        <div>
            <div
                data-message-count={surfaceMessages.length}
                data-show-surface={String(Boolean(showSurface))}
                data-testid="chat-surface-panel"
            >
                {surfaceMessages.map((message) => message.text).join(",")}
            </div>
            <button onClick={() => onJumpToUnread?.()} type="button">
                jump-unread-channel
            </button>
        </div>
    ),
}));

vi.mock("@/components/loader", () => ({
    default: () => <div>loading</div>,
}));

vi.mock("../app/chat/components/ConversationList", () => ({
    ConversationList: () => <div>conversation-list</div>,
}));

vi.mock("../app/chat/components/DirectMessageView", () => ({
    DirectMessageView: ({
        onJumpToUnread,
    }: {
        onJumpToUnread?: () => void;
    }) => (
        <div>
            <div>direct-message-view</div>
            <button onClick={() => onJumpToUnread?.()} type="button">
                jump-unread
            </button>
        </div>
    ),
}));

vi.mock("../app/chat/hooks/useServers", () => ({
    useServers: () => ({
        initialLoading: false,
        refresh: vi.fn(),
        selectedServer: "server-1",
        setSelectedServer: mockSetSelectedServer,
        servers: [
            {
                $id: "server-1",
                $createdAt: "2026-03-10T12:00:00.000Z",
                name: "Firepit HQ",
                ownerId: "user-1",
            },
        ],
    }),
}));

vi.mock("../app/chat/hooks/useChannels", () => ({
    useChannels: () => ({
        channels: [
            {
                $createdAt: "2026-03-10T12:00:00.000Z",
                $id: "channel-1",
                name: "general",
                serverId: "server-1",
            },
        ],
        cursor: null,
        loadMore: vi.fn(),
        loading: false,
    }),
}));

vi.mock("../app/chat/hooks/useCategories", () => ({
    useCategories: () => ({
        categories: [],
    }),
}));

const createDefaultUseMessagesValue = () => ({
    activeThreadParent: null,
    applyEdit: vi.fn(),
    cancelEdit: vi.fn(),
    cancelReply: vi.fn(),
    channelPins: [],
    closeThread: vi.fn(),
    editingMessageId: null,
    loadOlder: vi.fn(),
    loading: false,
    maxTypingDisplay: 3,
    messages: [
        {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "msg-1",
            channelId: "channel-1",
            text: "Hello channel",
            userId: "user-1",
        },
    ],
    onChangeText: vi.fn(),
    openThread: vi.fn(),
    remove: vi.fn(),
    replyingToMessage: null,
    send: vi.fn(),
    sending: false,
    sendThreadReply: vi.fn(),
    setMentionedNames: vi.fn(),
    shouldShowLoadOlder: () => false,
    startEdit: vi.fn(),
    startReply: vi.fn(),
    surfaceMessages: [
        {
            authorId: "user-1",
            authorLabel: "User One",
            context: { channelId: "channel-1", kind: "channel" },
            createdAt: "2026-03-10T12:00:00.000Z",
            id: "msg-1",
            sourceMessageId: "msg-1",
            sourceType: "channel",
            text: "Hello channel",
        },
    ],
    text: "",
    threadLoading: false,
    threadMessages: [],
    togglePin: vi.fn(),
    typingUsers: {},
    userIdSlice: 6,
});

const mockUseMessages = vi.fn(createDefaultUseMessagesValue);

vi.mock("../app/chat/hooks/useMessages", () => ({
    useMessages: (...args: unknown[]) => mockUseMessages(...args),
}));

vi.mock("../app/chat/hooks/useConversations", () => ({
    useConversations: () => ({
        conversations: mockConversations,
        loading: false,
    }),
}));

vi.mock("../app/chat/hooks/useDirectMessages", () => ({
    useDirectMessages: () => ({
        activeThreadParent: null,
        closeThread: vi.fn(),
        conversationPins: [],
        deleteMsg: vi.fn(),
        edit: vi.fn(),
        handleTypingChange: vi.fn(),
        loading: false,
        messages: [],
        openThread: vi.fn(),
        readOnly: false,
        readOnlyReason: null,
        send: vi.fn(),
        sendThreadReply: vi.fn(),
        sending: false,
        surfaceMessages: [],
        threadLoading: false,
        threadMessages: [],
        togglePin: vi.fn(),
        typingUsers: {},
    }),
}));

vi.mock("../app/chat/hooks/useInbox", () => ({
    useInbox: (...args: unknown[]) => mockUseInbox(...args),
}));

vi.mock("../app/chat/hooks/useInboxDigest", () => ({
    useInboxDigest: (...args: unknown[]) => mockUseInboxDigest(...args),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

const ChatPage = (await import("../app/chat/page")).default;

describe("ChatPage", () => {
    beforeEach(() => {
        mockPush.mockReset();
        mockReplace.mockReset();
        mockUseMessages.mockReset();
        mockUseMessages.mockImplementation(createDefaultUseMessagesValue);
        mockUseInbox.mockReset();
        mockUseInboxDigest.mockReset();
        mockInboxRefresh.mockReset();
        mockJumpToMessage.mockReset();
        mockJumpToMessageWhenReady.mockReset();
        mockJumpToMessageWhenReady.mockReturnValue(vi.fn());
        mockSearchParams.delete("channel");
        mockSearchParams.delete("compose");
        mockSearchParams.delete("conversation");
        mockSearchParams.delete("highlight");
        mockSearchParams.delete("invite");
        mockSearchParams.delete("server");
        mockSearchParams.delete("unread");
        mockConversations.splice(0, mockConversations.length);
        mockContextInboxItems.splice(0, mockContextInboxItems.length);
        mockSetSelectedServer.mockReset();
        mockUseInbox.mockReturnValue({
            contractVersion: "thread_v1",
            counts: { mention: 0, thread: 0 },
            error: null,
            getContextSummary: vi.fn(() => null),
            items: [],
            loading: false,
            markContextRead: vi.fn(),
            markItemRead: vi.fn(),
            refresh: mockInboxRefresh,
            summaries: [],
            unreadCount: 0,
        });
        mockUseInboxDigest.mockReturnValue({
            contractVersion: "thread_v1",
            contextId: undefined,
            contextKind: undefined,
            error: null,
            items: [],
            loading: false,
            refresh: vi.fn(),
            totalUnreadCount: 0,
            unreadByKind: { mention: 0, thread: 0 },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);

                if (url.includes("/permissions")) {
                    return {
                        json: async () => ({ manageMessages: true }),
                        ok: true,
                    } as Response;
                }

                if (url.includes("/api/inbox") && url.includes("contextId=")) {
                    const parsedUrl = new URL(url, "http://localhost");
                    const contextId = parsedUrl.searchParams.get("contextId");
                    const contextKind =
                        parsedUrl.searchParams.get("contextKind");
                    const scopedItems = mockContextInboxItems.filter(
                        (item) =>
                            item.contextId === contextId &&
                            item.contextKind === contextKind,
                    );

                    return {
                        json: async () => ({
                            contractVersion: "message_v2",
                            counts: scopedItems.reduce(
                                (accumulator, item) => {
                                    accumulator[item.kind] += item.unreadCount;
                                    return accumulator;
                                },
                                { mention: 0, thread: 0 },
                            ),
                            items: scopedItems,
                            unreadCount: scopedItems.reduce(
                                (total, item) => total + item.unreadCount,
                                0,
                            ),
                        }),
                        ok: true,
                    } as Response;
                }

                return {
                    json: async () => ({ allowUserServers: true, flags: [] }),
                    ok: true,
                } as Response;
            }),
        );
    });

    it("selects a channel and renders the shared chat surface shell", async () => {
        const user = userEvent.setup();

        render(<ChatPage />);

        expect(screen.getByTestId("chat-surface-panel")).toHaveAttribute(
            "data-show-surface",
            "false",
        );

        await user.click(screen.getByRole("button", { name: /general/i }));

        expect(
            screen.getByRole("heading", { name: "general" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Pinned Messages")).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Thread" }),
        ).toBeInTheDocument();
        expect(screen.getByTestId("chat-surface-panel")).toHaveAttribute(
            "data-show-surface",
            "true",
        );
        expect(screen.getByTestId("chat-surface-panel")).toHaveAttribute(
            "data-message-count",
            "1",
        );
        expect(screen.getByText("Hello channel")).toBeInTheDocument();
    });

    it("consumes channel deep links and schedules a highlighted jump", async () => {
        mockSearchParams.set("channel", "channel-1");
        mockSearchParams.set("server", "server-1");
        mockSearchParams.set("highlight", "msg-1");

        render(<ChatPage />);

        expect(
            await screen.findByRole("heading", { name: "general" }),
        ).toBeInTheDocument();
        expect(mockJumpToMessageWhenReady).toHaveBeenCalledWith(
            "msg-1",
            expect.objectContaining({
                retryAttempts: 12,
                retryDelayMs: 200,
            }),
        );
    });

    it("consumes dm deep links and schedules a highlighted jump", async () => {
        mockConversations.push({
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conversation-1",
            participants: ["user-1", "user-2"],
        });
        mockSearchParams.set("conversation", "conversation-1");
        mockSearchParams.set("highlight", "dm-1");

        render(<ChatPage />);

        expect(
            await screen.findByText("direct-message-view"),
        ).toBeInTheDocument();
        expect(mockJumpToMessageWhenReady).toHaveBeenCalledWith(
            "dm-1",
            expect.objectContaining({
                retryAttempts: 12,
                retryDelayMs: 200,
            }),
        );
    });

    it("consumes unread-entry deep links distinctly from highlight links", async () => {
        mockConversations.push({
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conversation-1",
            participants: ["user-1", "user-2"],
        });
        mockSearchParams.set("conversation", "conversation-1");
        mockSearchParams.set("unread", "dm-2");

        render(<ChatPage />);

        expect(
            await screen.findByText("direct-message-view"),
        ).toBeInTheDocument();
        expect(mockJumpToMessageWhenReady).toHaveBeenCalledWith(
            "dm-2",
            expect.objectContaining({
                retryAttempts: 12,
                retryDelayMs: 200,
            }),
        );
    });

    it("uses the shared jump helper for pinned channel messages", async () => {
        mockUseMessages.mockReturnValue({
            activeThreadParent: null,
            applyEdit: vi.fn(),
            cancelEdit: vi.fn(),
            cancelReply: vi.fn(),
            channelPins: [
                {
                    message: {
                        $createdAt: "2026-03-10T12:00:00.000Z",
                        $id: "msg-1",
                        channelId: "channel-1",
                        pinnedAt: "2026-03-10T12:10:00.000Z",
                        text: "Pinned hello",
                        userId: "user-1",
                    },
                    pin: {
                        $id: "pin-1",
                        contextId: "channel-1",
                        contextType: "channel",
                        messageId: "msg-1",
                        pinnedAt: "2026-03-10T12:10:00.000Z",
                        pinnedBy: "user-1",
                    },
                },
            ],
            closeThread: vi.fn(),
            editingMessageId: null,
            loadOlder: vi.fn(),
            loading: false,
            maxTypingDisplay: 3,
            messages: [
                {
                    $createdAt: "2026-03-10T12:00:00.000Z",
                    $id: "msg-1",
                    channelId: "channel-1",
                    text: "Pinned hello",
                    userId: "user-1",
                },
            ],
            onChangeText: vi.fn(),
            openThread: vi.fn(),
            refreshPins: vi.fn(),
            remove: vi.fn(),
            replyingToMessage: null,
            send: vi.fn(),
            sending: false,
            sendThreadReply: vi.fn(),
            setMentionedNames: vi.fn(),
            shouldShowLoadOlder: () => false,
            startEdit: vi.fn(),
            startReply: vi.fn(),
            surfaceMessages: [
                {
                    authorId: "user-1",
                    authorLabel: "User One",
                    context: { channelId: "channel-1", kind: "channel" },
                    createdAt: "2026-03-10T12:00:00.000Z",
                    id: "msg-1",
                    isPinned: true,
                    pinnedAt: "2026-03-10T12:10:00.000Z",
                    sourceMessageId: "msg-1",
                    sourceType: "channel",
                    text: "Pinned hello",
                },
            ],
            text: "",
            threadLoading: false,
            threadMessages: [],
            togglePin: vi.fn(),
            typingUsers: {},
            userIdSlice: 6,
        });

        const user = userEvent.setup();

        render(<ChatPage />);
        await user.click(screen.getByRole("button", { name: /general/i }));
        await user.click(
            await screen.findByRole("button", { name: "Jump to message" }),
        );

        expect(mockJumpToMessageWhenReady).toHaveBeenCalledWith(
            "msg-1",
            expect.objectContaining({
                onRetry: expect.any(Function),
                retryAttempts: 12,
            }),
        );
    });

    it("refreshes inbox when jump-to-unread cannot resolve the target message", async () => {
        mockConversations.push({
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conversation-1",
            participants: ["user-1", "user-2"],
        });
        mockSearchParams.set("conversation", "conversation-1");

        mockUseInbox.mockReturnValue({
            contractVersion: "message_v2",
            counts: { mention: 0, thread: 1 },
            error: null,
            getContextSummary: vi.fn(() => ({
                contextId: "conversation-1",
                contextKind: "conversation",
                firstUnreadItem: {
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    id: "thread:conversation:conversation-1:missing-1",
                    kind: "thread",
                    latestActivityAt: "2026-03-12T10:00:00.000Z",
                    messageId: "missing-1",
                    muted: false,
                    previewText: "Missing unread target",
                    unreadCount: 1,
                    authorLabel: "User Two",
                    authorUserId: "user-2",
                },
                latestItem: null,
                mentionCount: 0,
                muted: false,
                threadCount: 1,
                totalCount: 1,
            })),
            items: [],
            loading: false,
            markContextRead: vi.fn(),
            markItemRead: vi.fn(),
            refresh: mockInboxRefresh,
            summaries: [
                {
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    firstUnreadItem: {
                        contextId: "conversation-1",
                        contextKind: "conversation",
                        id: "thread:conversation:conversation-1:missing-1",
                        kind: "thread",
                        latestActivityAt: "2026-03-12T10:00:00.000Z",
                        messageId: "missing-1",
                        muted: false,
                        previewText: "Missing unread target",
                        unreadCount: 1,
                        authorLabel: "User Two",
                        authorUserId: "user-2",
                    },
                    latestItem: null,
                    mentionCount: 0,
                    muted: false,
                    threadCount: 1,
                    totalCount: 1,
                },
            ],
            unreadCount: 1,
        });
        mockContextInboxItems.push({
            authorLabel: "User Two",
            authorUserId: "user-2",
            contextId: "conversation-1",
            contextKind: "conversation",
            id: "thread:conversation:conversation-1:missing-1",
            kind: "thread",
            latestActivityAt: "2026-03-12T10:00:00.000Z",
            messageId: "missing-1",
            muted: false,
            previewText: "Missing unread target",
            unreadCount: 1,
        });

        mockJumpToMessageWhenReady.mockImplementation(
            (
                _messageId: string,
                options?: { onComplete?: (found: boolean) => void },
            ) => {
                options?.onComplete?.(false);
                return vi.fn();
            },
        );

        const user = userEvent.setup();
        render(<ChatPage />);

        await screen.findByText("direct-message-view");
        await user.click(screen.getByRole("button", { name: "jump-unread" }));

        expect(mockJumpToMessageWhenReady).toHaveBeenCalledWith(
            "missing-1",
            expect.objectContaining({
                retryAttempts: 12,
                retryDelayMs: 200,
            }),
        );
        expect(mockInboxRefresh).toHaveBeenCalled();
    });

    it("refreshes inbox when channel jump-to-unread cannot resolve the target message", async () => {
        mockSearchParams.set("channel", "channel-1");
        mockSearchParams.set("server", "server-1");

        mockUseInbox.mockReturnValue({
            contractVersion: "message_v2",
            counts: { mention: 0, thread: 1 },
            error: null,
            getContextSummary: vi.fn(
                (contextKind: string, contextId: string) =>
                    contextKind === "channel" && contextId === "channel-1"
                        ? {
                              contextId: "channel-1",
                              contextKind: "channel",
                              firstUnreadItem: {
                                  contextId: "channel-1",
                                  contextKind: "channel",
                                  id: "thread:channel:channel-1:missing-channel-1",
                                  kind: "thread",
                                  latestActivityAt: "2026-03-12T10:00:00.000Z",
                                  messageId: "missing-channel-1",
                                  muted: false,
                                  previewText: "Missing channel unread target",
                                  unreadCount: 1,
                                  authorLabel: "User Two",
                                  authorUserId: "user-2",
                              },
                              latestItem: null,
                              mentionCount: 0,
                              muted: false,
                              threadCount: 1,
                              totalCount: 1,
                          }
                        : null,
            ),
            items: [],
            loading: false,
            markContextRead: vi.fn(),
            markItemRead: vi.fn(),
            refresh: mockInboxRefresh,
            summaries: [
                {
                    contextId: "channel-1",
                    contextKind: "channel",
                    firstUnreadItem: {
                        contextId: "channel-1",
                        contextKind: "channel",
                        id: "thread:channel:channel-1:missing-channel-1",
                        kind: "thread",
                        latestActivityAt: "2026-03-12T10:00:00.000Z",
                        messageId: "missing-channel-1",
                        muted: false,
                        previewText: "Missing channel unread target",
                        unreadCount: 1,
                        authorLabel: "User Two",
                        authorUserId: "user-2",
                    },
                    latestItem: null,
                    mentionCount: 0,
                    muted: false,
                    threadCount: 1,
                    totalCount: 1,
                },
            ],
            unreadCount: 1,
        });
        mockContextInboxItems.push({
            authorLabel: "User Two",
            authorUserId: "user-2",
            contextId: "channel-1",
            contextKind: "channel",
            id: "thread:channel:channel-1:missing-channel-1",
            kind: "thread",
            latestActivityAt: "2026-03-12T10:00:00.000Z",
            messageId: "missing-channel-1",
            muted: false,
            previewText: "Missing channel unread target",
            unreadCount: 1,
        });

        mockJumpToMessageWhenReady.mockImplementation(
            (
                _messageId: string,
                options?: { onComplete?: (found: boolean) => void },
            ) => {
                options?.onComplete?.(false);
                return vi.fn();
            },
        );

        const user = userEvent.setup();
        render(<ChatPage />);

        await screen.findByRole("heading", { name: "general" });
        await user.click(
            screen.getByRole("button", { name: "jump-unread-channel" }),
        );

        expect(mockJumpToMessageWhenReady).toHaveBeenCalledWith(
            "missing-channel-1",
            expect.objectContaining({
                retryAttempts: 12,
                retryDelayMs: 200,
            }),
        );
        expect(mockInboxRefresh).toHaveBeenCalled();
    });
});
