/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDirectMessages } from "@/app/chat/hooks/useDirectMessages";
import type { DirectMessage, RelationshipStatus } from "@/lib/types";

const {
    mockCreateThreadReply,
    mockDeleteDirectMessage,
    mockEditDirectMessage,
    mockListDirectMessages,
    mockListPins,
    mockListThreadMessages,
    mockPinMessage,
    mockSendDirectMessage,
    mockToggleReaction,
    mockThreadPinState,
    mockUnpinMessage,
} = vi.hoisted(() => ({
    mockCreateThreadReply: vi.fn(),
    mockDeleteDirectMessage: vi.fn(),
    mockEditDirectMessage: vi.fn(),
    mockListDirectMessages: vi.fn(),
    mockListPins: vi.fn(),
    mockListThreadMessages: vi.fn(),
    mockPinMessage: vi.fn(),
    mockSendDirectMessage: vi.fn(),
    mockToggleReaction: vi.fn(),
    mockThreadPinState: {
        activeThreadParent: null,
        closeThread: vi.fn(),
        isThreadUnread: vi.fn(() => false),
        openThread: vi.fn(),
        pins: [],
        refreshPins: vi.fn(),
        sendThreadReply: vi.fn(),
        threadLoading: false,
        threadMessages: [],
        threadReadByMessageId: {},
        threadReplySending: false,
        togglePin: vi.fn(),
    },
    mockUnpinMessage: vi.fn(),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        collections: {
            directMessages: "direct-messages",
            typing: "typing",
        },
        databaseId: "database-1",
    })),
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
    deleteDirectMessage: mockDeleteDirectMessage,
    editDirectMessage: mockEditDirectMessage,
    listDirectMessages: mockListDirectMessages,
    sendDirectMessage: mockSendDirectMessage,
}));

vi.mock("@/lib/reactions-client", () => ({
    toggleReaction: mockToggleReaction,
}));

vi.mock("@/lib/reactions-utils", () => ({
    parseReactions: vi.fn((reactions) => reactions ?? []),
}));

vi.mock("@/hooks/useDebounce", () => ({
    useDebouncedBatchUpdate: vi.fn((callback) => (update: unknown) => {
        callback([update]);
    }),
}));

vi.mock("@/lib/thread-pin-client", () => ({
    createDMThreadReply: mockCreateThreadReply,
    listConversationPins: mockListPins,
    listDMThreadMessages: mockListThreadMessages,
    pinDMMessage: mockPinMessage,
    unpinDMMessage: mockUnpinMessage,
}));

vi.mock("@/lib/realtime-pool", () => ({
    getSharedRealtime: vi.fn(() => ({
        subscribe: vi.fn(async () => ({ close: vi.fn() })),
    })),
    trackSubscription: vi.fn(() => vi.fn()),
}));

vi.mock("@/app/chat/hooks/useThreadPinState", () => ({
    useThreadPinState: vi.fn((options) => {
        mockThreadPinState._lastOptions = options;
        return mockThreadPinState;
    }),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

type DirectMessagesResult = {
    items: DirectMessage[];
    nextCursor?: string | null;
    readOnly: boolean;
    readOnlyReason?: string | null;
    relationship?: RelationshipStatus | null;
};

function createListResult(
    overrides: Partial<DirectMessagesResult> = {},
): DirectMessagesResult {
    return {
        items: [
            {
                $createdAt: "2026-03-10T12:00:00.000Z",
                $id: "dm-1",
                conversationId: "conversation-1",
                senderDisplayName: "User Two",
                senderId: "user-2",
                text: "Hello",
            },
        ],
        readOnly: false,
        readOnlyReason: null,
        relationship: null,
        ...overrides,
    };
}

describe("useDirectMessages", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        mockListDirectMessages.mockResolvedValue(createListResult());
        mockSendDirectMessage.mockResolvedValue({
            $createdAt: "2026-03-10T12:05:00.000Z",
            $id: "dm-2",
            conversationId: "conversation-1",
            senderId: "user-1",
            text: "Sent message",
        });
        mockToggleReaction.mockResolvedValue({ success: true });
        mockThreadPinState.activeThreadParent = null;
        mockThreadPinState.closeThread = vi.fn();
        mockThreadPinState.isThreadUnread = vi.fn(() => false);
        mockThreadPinState.openThread = vi.fn();
        mockThreadPinState.pins = [
            {
                message: {
                    $createdAt: "2026-03-10T12:00:00.000Z",
                    $id: "dm-1",
                    conversationId: "conversation-1",
                    senderId: "user-2",
                    text: "Hello",
                },
                pin: {
                    $id: "pin-1",
                    contextId: "conversation-1",
                    contextType: "conversation",
                    messageId: "dm-1",
                    pinnedAt: "2026-03-10T12:10:00.000Z",
                    pinnedBy: "user-1",
                },
            },
        ];
        mockThreadPinState.refreshPins = vi.fn();
        mockThreadPinState.sendThreadReply = vi.fn();
        mockThreadPinState.threadLoading = false;
        mockThreadPinState.threadMessages = [];
        mockThreadPinState.threadReadByMessageId = {};
        mockThreadPinState.threadReplySending = false;
        mockThreadPinState.togglePin = vi.fn();
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url.startsWith("/api/users/")) {
                    return {
                        json: async () => ({
                            avatarUrl: "https://example.com/avatar.png",
                            displayName: "User One",
                            pronouns: "they/them",
                        }),
                        ok: true,
                    } as Response;
                }

                if (url.startsWith("/api/typing")) {
                    return {
                        json: async () => ({ success: true, init }),
                        ok: true,
                    } as Response;
                }

                return {
                    json: async () => ({}),
                    ok: true,
                } as Response;
            },
        );
        vi.stubGlobal("fetch", fetchMock);
        if (typeof window !== "undefined") {
            window.fetch = fetchMock as typeof fetch;
        }
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("loads direct messages and exposes read-only and relationship state", async () => {
        mockListDirectMessages.mockResolvedValue(
            createListResult({
                readOnly: true,
                readOnlyReason: "Friends only",
                relationship: {
                    blockedByMe: false,
                    blockedMe: true,
                    canReceiveFriendRequest: false,
                    canSendDirectMessage: false,
                    directMessagePrivacy: "friends",
                    incomingRequest: false,
                    isFriend: false,
                    outgoingRequest: false,
                    userId: "user-2",
                },
            }),
        );

        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(1);
        });

        expect(result.current.readOnly).toBe(true);
        expect(result.current.readOnlyReason).toBe("Friends only");
        expect(result.current.relationship).toEqual(
            expect.objectContaining({
                blockedMe: true,
                directMessagePrivacy: "friends",
                userId: "user-2",
            }),
        );
        expect(result.current.conversationPins).toEqual(
            mockThreadPinState.pins,
        );
        expect(mockThreadPinState._lastOptions).toEqual(
            expect.objectContaining({
                contextId: "conversation-1",
                currentUserId: "user-1",
            }),
        );
    });

    it("clears direct messages while the next conversation is loading", async () => {
        let resolveNextLoad:
            | ((value: DirectMessagesResult) => void)
            | undefined;

        mockListDirectMessages
            .mockResolvedValueOnce(createListResult())
            .mockImplementationOnce(
                () =>
                    new Promise<DirectMessagesResult>((resolve) => {
                        resolveNextLoad = resolve;
                    }),
            );

        const { result, rerender } = renderHook(
            ({ conversationId }: { conversationId: string | null }) =>
                useDirectMessages({
                    conversationId,
                    userId: "user-1",
                    userName: "User One",
                }),
            {
                initialProps: { conversationId: "conversation-1" },
            },
        );

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(1);
        });

        rerender({ conversationId: "conversation-2" });

        expect(result.current.loading).toBe(true);
        expect(result.current.messages).toHaveLength(0);

        await act(async () => {
            resolveNextLoad?.(
                createListResult({
                    items: [
                        {
                            $createdAt: "2026-03-10T12:10:00.000Z",
                            $id: "dm-2",
                            conversationId: "conversation-2",
                            senderId: "user-2",
                            text: "New conversation",
                        },
                    ],
                }),
            );
        });

        await waitFor(() => {
            expect(result.current.messages[0]?.$id).toBe("dm-2");
        });
    });

    it("projects unread thread state onto normalized surface messages", async () => {
        mockListDirectMessages.mockResolvedValue(
            createListResult({
                items: [
                    {
                        $createdAt: "2026-03-10T12:00:00.000Z",
                        $id: "dm-thread-1",
                        conversationId: "conversation-1",
                        lastThreadReplyAt: "2026-03-10T12:20:00.000Z",
                        senderDisplayName: "User Two",
                        senderId: "user-2",
                        text: "Hello",
                        threadMessageCount: 3,
                    },
                ],
            }),
        );
        mockThreadPinState.isThreadUnread = vi.fn(
            (message) => message.$id === "dm-thread-1",
        );
        mockThreadPinState.threadReadByMessageId = {
            "dm-thread-1": "2026-03-10T12:10:00.000Z",
        };

        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.surfaceMessages[0]).toEqual(
                expect.objectContaining({
                    id: "dm-thread-1",
                    threadHasUnread: true,
                    threadLastReadAt: "2026-03-10T12:10:00.000Z",
                }),
            );
        });
    });

    it("clears messages when the conversation id becomes null", async () => {
        const { result, rerender } = renderHook(
            ({ conversationId }: { conversationId: string | null }) =>
                useDirectMessages({
                    conversationId,
                    userId: "user-1",
                }),
            {
                initialProps: { conversationId: "conversation-1" },
            },
        );

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(1);
        });

        rerender({ conversationId: null });

        await waitFor(() => {
            expect(result.current.messages).toEqual([]);
        });
        expect(result.current.readOnly).toBe(false);
        expect(result.current.readOnlyReason).toBeNull();
    });

    it("loads older direct messages when pagination is available", async () => {
        mockListDirectMessages
            .mockResolvedValueOnce({
                ...createListResult({
                    items: [
                        {
                            $createdAt: "2026-03-10T12:02:00.000Z",
                            $id: "dm-newer",
                            conversationId: "conversation-1",
                            senderId: "user-2",
                            text: "Newer",
                        },
                    ],
                }),
                nextCursor: "cursor-1",
            })
            .mockResolvedValueOnce({
                ...createListResult({
                    items: [
                        {
                            $createdAt: "2026-03-10T12:01:00.000Z",
                            $id: "dm-older",
                            conversationId: "conversation-1",
                            senderId: "user-2",
                            text: "Older",
                        },
                    ],
                }),
                nextCursor: null,
            });

        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.shouldShowLoadOlder).toBe(true);
        });

        await act(async () => {
            await result.current.loadOlder();
        });

        expect(result.current.messages.map((message) => message.$id)).toEqual([
            "dm-older",
            "dm-newer",
        ]);
        expect(result.current.shouldShowLoadOlder).toBe(false);
    });

    it("sends a direct message and enriches it with the sender profile", async () => {
        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                receiverId: "user-2",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.send("Sent message");
        });

        expect(mockSendDirectMessage).toHaveBeenCalledWith(
            "conversation-1",
            "user-1",
            "user-2",
            "Sent message",
            undefined,
            undefined,
            undefined,
            undefined,
        );

        await waitFor(() => {
            expect(result.current.messages.at(-1)).toEqual(
                expect.objectContaining({
                    $id: "dm-2",
                    senderAvatarUrl: "https://example.com/avatar.png",
                    senderDisplayName: "User One",
                    senderPronouns: "they/them",
                }),
            );
        });
    });

    it("prevents sending when the conversation is read-only", async () => {
        const { toast } = await import("sonner");
        mockListDirectMessages.mockResolvedValue(
            createListResult({
                readOnly: true,
                readOnlyReason: "DMs disabled",
            }),
        );

        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
            }),
        );

        await waitFor(() => {
            expect(result.current.readOnly).toBe(true);
        });

        await act(async () => {
            await result.current.send("Nope");
        });

        expect(mockSendDirectMessage).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith("DMs disabled");
    });

    it("sends typing updates for the active conversation", async () => {
        const fetchMock = vi.mocked(fetch);
        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        act(() => {
            result.current.handleTypingChange("typing");
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("/api/typing", {
                body: JSON.stringify({
                    conversationId: "conversation-1",
                    userName: "User One",
                }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
        });

        act(() => {
            result.current.handleTypingChange("");
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/typing?conversationId=conversation-1",
                { method: "DELETE" },
            );
        });
    });

    it("removes a deleted DM from local state immediately", async () => {
        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(1);
            expect(result.current.messages[0]?.$id).toBe("dm-1");
        });

        await act(async () => {
            await result.current.deleteMsg("dm-1");
        });

        expect(mockDeleteDirectMessage).toHaveBeenCalledWith("dm-1", "user-1");
        expect(result.current.messages).toEqual([]);
        expect(mockListDirectMessages).toHaveBeenCalledTimes(1);
    });

    it("applies DM reaction updates optimistically", async () => {
        let resolveToggle: ((value: { success: boolean }) => void) | undefined;
        mockToggleReaction.mockImplementation(
            () =>
                new Promise<{ success: boolean }>((resolve) => {
                    resolveToggle = resolve;
                }),
        );

        const { result } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(1);
        });

        act(() => {
            void result.current.toggleReaction("dm-1", "👍", true);
        });

        await waitFor(() => {
            expect(result.current.messages[0]?.reactions).toEqual([
                {
                    count: 1,
                    emoji: "👍",
                    userIds: ["user-1"],
                },
            ]);
        });

        await act(async () => {
            resolveToggle?.({ success: true });
        });

        expect(mockToggleReaction).toHaveBeenCalledWith(
            "dm-1",
            "👍",
            true,
            true,
        );
    });
});
