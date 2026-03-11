import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
    default: () => () => null,
}));

const {
    mockConversations,
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
        showSurface,
        surfaceMessages,
    }: {
        showSurface?: boolean;
        surfaceMessages: Array<{ text: string }>;
    }) => (
        <div
            data-message-count={surfaceMessages.length}
            data-show-surface={String(Boolean(showSurface))}
            data-testid="chat-surface-panel"
        >
            {surfaceMessages.map((message) => message.text).join(",")}
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
    DirectMessageView: () => <div>direct-message-view</div>,
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

const mockUseMessages = vi.fn(() => ({
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
}));

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
    useInbox: () => ({
        counts: { mention: 0, thread: 0 },
        error: null,
        getContextSummary: vi.fn(() => null),
        items: [],
        loading: false,
        markContextRead: vi.fn(),
        markItemRead: vi.fn(),
        refresh: vi.fn(),
        summaries: [],
        unreadCount: 0,
    }),
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
        mockUseMessages.mockClear();
        mockJumpToMessage.mockReset();
        mockJumpToMessageWhenReady.mockReset();
        mockJumpToMessageWhenReady.mockReturnValue(vi.fn());
        mockSearchParams.delete("channel");
        mockSearchParams.delete("compose");
        mockSearchParams.delete("conversation");
        mockSearchParams.delete("highlight");
        mockSearchParams.delete("invite");
        mockSearchParams.delete("server");
        mockConversations.splice(0, mockConversations.length);
        mockSetSelectedServer.mockReset();
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

        expect(mockJumpToMessage).toHaveBeenCalledWith("msg-1");
    });
});
