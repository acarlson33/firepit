/**
 * @vitest-environment happy-dom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessages } from "@/app/chat/hooks/useMessages";
import * as appwriteMessages from "@/lib/appwrite-messages";
import * as appwriteMessagesEnriched from "@/lib/appwrite-messages-enriched";
import * as reactionsClient from "@/lib/reactions-client";
import * as threadPinClient from "@/lib/thread-pin-client";
import type { Message } from "@/lib/types";

// Mock dependencies
vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "https://cloud.appwrite.io/v1",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            messages: "messages",
            typing: "typing",
        },
    })),
}));

vi.mock("@/lib/appwrite-messages", () => ({
    canSend: vi.fn(),
    setTyping: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/appwrite-messages-enriched", () => ({
    getEnrichedMessages: vi.fn(),
}));

vi.mock("@/lib/thread-pin-client", () => ({
    createChannelThreadReply: vi.fn(),
    listChannelPins: vi.fn(() => Promise.resolve([])),
    listChannelThreadMessages: vi.fn(() => Promise.resolve([])),
    pinChannelMessage: vi.fn(),
    unpinChannelMessage: vi.fn(),
}));

vi.mock("@/lib/reactions-utils", () => ({
    parseReactions: vi.fn((reactions) => reactions || {}),
}));

vi.mock("@/lib/reactions-client", () => ({
    toggleReaction: vi.fn(),
}));

vi.mock("@/lib/mention-utils", () => ({
    extractMentionedUsernames: vi.fn(() => []),
    extractMentionsWithKnownNames: vi.fn(() => []),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe("useMessages", () => {
    const mockUserId = "user123";
    const mockUserName = "Test User";
    const mockChannelId = "channel123";
    const mockServerId = "server123";

    const mockMessage1: Message = {
        $id: "msg1",
        channelId: mockChannelId,
        userId: mockUserId,
        userName: mockUserName,
        text: "Hello",
        $createdAt: "2024-01-01T00:00:00.000Z",
        reactions: [],
    };

    const mockMessage2: Message = {
        $id: "msg2",
        channelId: mockChannelId,
        userId: "user456",
        userName: "Other User",
        text: "Hi there",
        $createdAt: "2024-01-01T00:01:00.000Z",
        reactions: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Message Loading", () => {
        it("should load messages when channelId is provided", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1, mockMessage2]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                    serverId: mockServerId,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([
                    mockMessage1,
                    mockMessage2,
                ]);
            });
        });

        it("should clear messages when channelId is null", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result, rerender } = renderHook(
                ({ channelId }: { channelId: string | null }) =>
                    useMessages({
                        channelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                {
                    initialProps: { channelId: mockChannelId as string | null },
                },
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            rerender({ channelId: null });

            expect(result.current.messages).toEqual([]);
        });

        it("should handle load errors", async () => {
            const { toast } = await import("sonner");
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockRejectedValue(new Error("Load failed"));

            renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith("Load failed");
            });
        });

        it("should reload messages when channelId changes", async () => {
            const mockMessage3: Message = {
                $id: "msg3",
                channelId: "channel456",
                userId: mockUserId,
                userName: mockUserName,
                text: "New channel",
                $createdAt: "2024-01-01T00:02:00.000Z",
                reactions: [],
            };

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            )
                .mockResolvedValueOnce([mockMessage1])
                .mockResolvedValueOnce([mockMessage3]);

            const { result, rerender } = renderHook(
                ({ channelId }: { channelId: string | null }) =>
                    useMessages({
                        channelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                {
                    initialProps: { channelId: mockChannelId as string | null },
                },
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            rerender({ channelId: "channel456" });

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage3]);
            });
        });

        it("should keep previous messages visible while the next channel is loading", async () => {
            const mockMessage3: Message = {
                $id: "msg3",
                channelId: "channel456",
                userId: mockUserId,
                userName: mockUserName,
                text: "New channel",
                $createdAt: "2024-01-01T00:02:00.000Z",
                reactions: [],
            };

            let resolveNextLoad: ((messages: Message[]) => void) | undefined;

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            )
                .mockResolvedValueOnce([mockMessage1])
                .mockImplementationOnce(
                    () =>
                        new Promise<Message[]>((resolve) => {
                            resolveNextLoad = resolve;
                        }),
                );

            const { result, rerender } = renderHook(
                ({ channelId }: { channelId: string | null }) =>
                    useMessages({
                        channelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                {
                    initialProps: { channelId: mockChannelId as string | null },
                },
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            rerender({ channelId: "channel456" });

            expect(result.current.loading).toBe(true);
            expect(result.current.messages).toEqual([mockMessage1]);

            await act(async () => {
                resolveNextLoad?.([mockMessage3]);
            });

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage3]);
            });
        });

        it("should set hasMore when full page of messages is loaded", async () => {
            // pageSize is now 15, so a full page should have 15 messages
            const fullPage = Array.from({ length: 15 }, (_, i) => ({
                ...mockMessage1,
                $id: `msg${i}`,
            }));

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue(fullPage);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.hasMore).toBe(true);
            });
        });

        it("should set hasMore to false when less than full page is loaded", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.hasMore).toBe(false);
            });
        });

        it("should set loading to true when channel changes and false when complete", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockImplementation(
                () =>
                    new Promise((resolve) =>
                        setTimeout(() => resolve([mockMessage1]), 50),
                    ),
            );

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            // Should be loading initially
            expect(result.current.loading).toBe(true);

            // Should be false after messages load
            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            // Should have messages
            expect(result.current.messages).toEqual([mockMessage1]);
        });

        it("should keep previous messages visible and show loading when switching channels", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            )
                .mockResolvedValueOnce([mockMessage1])
                .mockImplementation(
                    () =>
                        new Promise((resolve) =>
                            setTimeout(() => resolve([mockMessage2]), 50),
                        ),
                );

            const { result, rerender } = renderHook(
                ({ channelId }: { channelId: string | null }) =>
                    useMessages({
                        channelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                {
                    initialProps: { channelId: mockChannelId as string | null },
                },
            );

            // Wait for initial messages to load
            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
                expect(result.current.loading).toBe(false);
            });

            // Switch to a new channel
            rerender({ channelId: "channel456" });

            // Previous messages should stay visible while the next channel loads
            expect(result.current.messages).toEqual([mockMessage1]);
            expect(result.current.loading).toBe(true);

            // Wait for new messages to load
            await waitFor(() => {
                expect(result.current.loading).toBe(false);
                expect(result.current.messages).toEqual([mockMessage2]);
            });
        });
    });

    describe("Text State", () => {
        it("should update text state", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: null,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            act(() => {
                result.current.onChangeText({
                    target: { value: "Hello" },
                } as React.ChangeEvent<HTMLInputElement>);
            });

            expect(result.current.text).toBe("Hello");
        });
    });

    describe("Editing State", () => {
        it("should set editing message ID", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            act(() => {
                result.current.startEdit(mockMessage1);
            });

            expect(result.current.editingMessageId).toBe("msg1");
            expect(result.current.text).toBe("Hello");
        });

        it("should clear editing message ID", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            act(() => {
                result.current.startEdit(mockMessage1);
            });

            act(() => {
                result.current.cancelEdit();
            });

            expect(result.current.editingMessageId).toBeNull();
            expect(result.current.text).toBe("");
        });
    });

    describe("Reply State", () => {
        it("marks thread surface messages as read after opening the thread", async () => {
            const threadParent: Message = {
                ...mockMessage1,
                $id: "thread-parent",
                lastThreadReplyAt: "2024-01-01T00:05:00.000Z",
                threadMessageCount: 2,
            };

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([threadParent]);
            (
                threadPinClient.listChannelThreadMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.surfaceMessages[0]?.threadHasUnread).toBe(
                    true,
                );
            });

            await act(async () => {
                await result.current.openThread(threadParent);
            });

            await waitFor(() => {
                expect(result.current.surfaceMessages[0]?.threadHasUnread).toBe(
                    false,
                );
            });
        });

        it("should set replying to message", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            act(() => {
                result.current.startReply(mockMessage1);
            });

            expect(result.current.replyingToMessage).toEqual(mockMessage1);
        });

        it("should clear replying to message", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            act(() => {
                result.current.startReply(mockMessage1);
            });

            act(() => {
                result.current.cancelReply();
            });

            expect(result.current.replyingToMessage).toBeNull();
        });
    });

    describe("Initialization", () => {
        it("should initialize with empty messages", () => {
            const { result } = renderHook(() =>
                useMessages({
                    channelId: null,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            expect(result.current.messages).toEqual([]);
            expect(result.current.text).toBe("");
            expect(result.current.editingMessageId).toBeNull();
            expect(result.current.replyingToMessage).toBeNull();
        });

        it("should handle empty message list", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([]);
            });
        });
    });

    describe("Delete Messages", () => {
        it("removes a deleted message from local state immediately", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1, mockMessage2]);

            const fetchMock = vi.fn().mockResolvedValue({
                json: async () => ({}),
                ok: true,
            } as Response);
            vi.stubGlobal("fetch", fetchMock);

            try {
                const { result } = renderHook(() =>
                    useMessages({
                        channelId: mockChannelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                );

                await waitFor(() => {
                    expect(result.current.messages).toHaveLength(2);
                });

                await act(async () => {
                    await result.current.remove("msg1");
                });

                expect(fetchMock).toHaveBeenCalledWith(
                    "/api/messages?id=msg1",
                    {
                        method: "DELETE",
                    },
                );
                expect(result.current.messages).toEqual([mockMessage2]);
            } finally {
                vi.unstubAllGlobals();
            }
        });

        it("applies reaction updates optimistically", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([
                {
                    ...mockMessage1,
                    reactions: [],
                },
            ]);

            let resolveToggle:
                | ((value: { success: boolean }) => void)
                | undefined;
            (
                reactionsClient.toggleReaction as ReturnType<typeof vi.fn>
            ).mockImplementation(
                () =>
                    new Promise<{ success: boolean }>((resolve) => {
                        resolveToggle = resolve;
                    }),
            );

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toHaveLength(1);
            });

            act(() => {
                void result.current.toggleReaction("msg1", "🔥", true);
            });

            await waitFor(() => {
                expect(result.current.messages[0]?.reactions).toEqual([
                    {
                        count: 1,
                        emoji: "🔥",
                        userIds: [mockUserId],
                    },
                ]);
            });

            await act(async () => {
                resolveToggle?.({ success: true });
            });

            expect(reactionsClient.toggleReaction).toHaveBeenCalledWith(
                "msg1",
                "🔥",
                true,
                false,
            );
        });
    });

    describe("Poll Operations", () => {
        it("casts poll votes and reconciles poll state", async () => {
            const initialPoll = {
                channelId: mockChannelId,
                createdBy: "user456",
                id: "poll-1",
                messageId: "msg1",
                options: [
                    {
                        count: 0,
                        id: "option-1",
                        text: "Option 1",
                        voterIds: [],
                    },
                    {
                        count: 0,
                        id: "option-2",
                        text: "Option 2",
                        voterIds: [],
                    },
                ],
                question: "Pick one",
                status: "open" as const,
            };

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([
                {
                    ...mockMessage1,
                    poll: initialPoll,
                },
            ]);

            const fetchMock = vi.fn().mockResolvedValue({
                json: async () => ({
                    poll: {
                        ...initialPoll,
                        options: [
                            {
                                count: 0,
                                id: "option-1",
                                text: "Option 1",
                                voterIds: [],
                            },
                            {
                                count: 1,
                                id: "option-2",
                                text: "Option 2",
                                voterIds: [mockUserId],
                            },
                        ],
                    },
                }),
                ok: true,
            } as Response);
            vi.stubGlobal("fetch", fetchMock);

            try {
                const { result } = renderHook(() =>
                    useMessages({
                        channelId: mockChannelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                );

                await waitFor(() => {
                    expect(result.current.messages[0]?.poll).toEqual(
                        initialPoll,
                    );
                });

                await act(async () => {
                    await result.current.votePoll("msg1", "option-2");
                });

                expect(fetchMock).toHaveBeenCalledWith(
                    "/api/messages/msg1/poll-votes",
                    {
                        body: JSON.stringify({ optionId: "option-2" }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                    },
                );
                expect(
                    result.current.messages[0]?.poll?.options.find(
                        (option) => option.id === "option-2",
                    )?.voterIds,
                ).toEqual([mockUserId]);
            } finally {
                vi.unstubAllGlobals();
            }
        });

        it("closes polls and updates message state", async () => {
            const initialPoll = {
                channelId: mockChannelId,
                createdBy: mockUserId,
                id: "poll-1",
                messageId: "msg1",
                options: [
                    {
                        count: 1,
                        id: "option-1",
                        text: "Option 1",
                        voterIds: [mockUserId],
                    },
                ],
                question: "Close me",
                status: "open" as const,
            };

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([
                {
                    ...mockMessage1,
                    poll: initialPoll,
                },
            ]);

            const fetchMock = vi.fn().mockResolvedValue({
                json: async () => ({
                    poll: {
                        ...initialPoll,
                        closedAt: "2026-04-12T15:00:00.000Z",
                        closedBy: mockUserId,
                        status: "closed",
                    },
                }),
                ok: true,
            } as Response);
            vi.stubGlobal("fetch", fetchMock);

            try {
                const { result } = renderHook(() =>
                    useMessages({
                        channelId: mockChannelId,
                        userId: mockUserId,
                        userName: mockUserName,
                    }),
                );

                await waitFor(() => {
                    expect(result.current.messages[0]?.poll).toEqual(
                        initialPoll,
                    );
                });

                await act(async () => {
                    await result.current.closePoll("msg1");
                });

                expect(fetchMock).toHaveBeenCalledWith(
                    "/api/messages/msg1/poll/close",
                    {
                        method: "POST",
                    },
                );
                expect(result.current.messages[0]?.poll?.status).toBe(
                    "closed",
                );
            } finally {
                vi.unstubAllGlobals();
            }
        });
    });

    describe("Load Older Messages", () => {
        it("should not show load older button when hasMore is false", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.hasMore).toBe(false);
            });

            expect(result.current.shouldShowLoadOlder()).toBe(false);
        });

        it("should show load older button when hasMore is true", async () => {
            // pageSize is now 15, so a full page should have 15 messages
            const fullPage = Array.from({ length: 15 }, (_, i) => ({
                ...mockMessage1,
                $id: `msg${i}`,
            }));

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue(fullPage);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.hasMore).toBe(true);
            });

            expect(result.current.shouldShowLoadOlder()).toBe(true);
        });

        it("should load older messages when loadOlder is called", async () => {
            const olderMessage: Message = {
                $id: "msg0",
                channelId: mockChannelId,
                userId: mockUserId,
                userName: mockUserName,
                text: "Older message",
                $createdAt: "2023-12-31T23:59:00.000Z",
                reactions: [],
            };

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            )
                .mockResolvedValueOnce([mockMessage1])
                .mockResolvedValueOnce([olderMessage]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            await act(async () => {
                await result.current.loadOlder();
            });

            await waitFor(() => {
                expect(result.current.messages).toEqual([
                    olderMessage,
                    mockMessage1,
                ]);
            });
        });

        it("should not load older when channelId is null", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: null,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await act(async () => {
                await result.current.loadOlder();
            });

            // Should not call getEnrichedMessages for load older
            expect(
                appwriteMessagesEnriched.getEnrichedMessages,
            ).not.toHaveBeenCalled();
        });
    });

    describe("Edge Cases", () => {
        it("should handle non-Error load failure", async () => {
            const { toast } = await import("sonner");
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockRejectedValue("String error");

            renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith(
                    "Failed to load messages",
                );
            });
        });

        it("should handle null userId", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: null,
                    userName: null,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });
        });

        it("should handle null userName", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: null,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });
        });

        it("should handle messages without reactions", async () => {
            const messageNoReactions: Message = {
                ...mockMessage1,
                reactions: undefined,
            };

            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([messageNoReactions]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([messageNoReactions]);
            });
        });

        it("should preserve oldestCursor from initial load", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1, mockMessage2]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.oldestCursor).toBe("msg1");
            });
        });
    });

    describe("Text Editing", () => {
        it("should clear text when editing is canceled", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            act(() => {
                result.current.onChangeText({
                    target: { value: "Typing..." },
                } as React.ChangeEvent<HTMLInputElement>);
            });

            expect(result.current.text).toBe("Typing...");

            act(() => {
                result.current.startEdit(mockMessage1);
            });

            act(() => {
                result.current.cancelEdit();
            });

            expect(result.current.text).toBe("");
        });

        it("should set text to message text when starting edit", async () => {
            (
                appwriteMessagesEnriched.getEnrichedMessages as ReturnType<
                    typeof vi.fn
                >
            ).mockResolvedValue([mockMessage1]);

            const { result } = renderHook(() =>
                useMessages({
                    channelId: mockChannelId,
                    userId: mockUserId,
                    userName: mockUserName,
                }),
            );

            await waitFor(() => {
                expect(result.current.messages).toEqual([mockMessage1]);
            });

            act(() => {
                result.current.startEdit(mockMessage1);
            });

            expect(result.current.text).toBe("Hello");
        });
    });
});
