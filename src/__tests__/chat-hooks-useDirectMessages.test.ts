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
    mockThreadPinState: {
        activeThreadParent: null,
        closeThread: vi.fn(),
        openThread: vi.fn(),
        pins: [],
        refreshPins: vi.fn(),
        sendThreadReply: vi.fn(),
        threadLoading: false,
        threadMessages: [],
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
    getSharedClient: vi.fn(() => ({
        subscribe: vi.fn(() => vi.fn()),
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
        mockThreadPinState.activeThreadParent = null;
        mockThreadPinState.closeThread = vi.fn();
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
});
