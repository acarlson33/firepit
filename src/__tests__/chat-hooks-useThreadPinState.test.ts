/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useThreadPinState } from "@/app/chat/hooks/useThreadPinState";

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
    },
}));

type TestMessage = {
    $createdAt: string;
    $id: string;
    text: string;
    threadId?: string;
    threadMessageCount?: number;
    threadParticipants?: string[];
    lastThreadReplyAt?: string;
    isPinned?: boolean;
    pinnedAt?: string;
    pinnedBy?: string;
    userId?: string;
};

function createOptimisticReply(params: {
    createdAt: string;
    currentUserId: string | null;
    parentMessage: TestMessage;
    tempId: string;
    text: string;
}) {
    return {
        $createdAt: params.createdAt,
        $id: params.tempId,
        text: params.text,
        threadId: params.parentMessage.$id,
        userId: params.currentUserId ?? undefined,
    } satisfies TestMessage;
}

describe("useThreadPinState", () => {
    it("loads pins for the current context and applies optimistic pin toggles", async () => {
        const listPins = vi.fn().mockResolvedValue([
            {
                message: {
                    $createdAt: "2026-03-10T12:00:00.000Z",
                    $id: "message-1",
                    text: "Pinned",
                },
                pin: {
                    $id: "pin-1",
                    contextId: "context-1",
                    contextType: "channel",
                    messageId: "message-1",
                    pinnedAt: "2026-03-10T12:00:00.000Z",
                    pinnedBy: "user-1",
                },
            },
        ]);

        let resolvePin: (() => void) | undefined;
        const pinMessage = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolvePin = () => {
                        resolve({ $id: "pin-2" });
                    };
                }),
        );
        const unpinMessage = vi.fn().mockResolvedValue(undefined);

        const { result } = renderHook(() => {
            const [messages, setMessages] = useState<TestMessage[]>([
                {
                    $createdAt: "2026-03-10T12:00:00.000Z",
                    $id: "message-2",
                    text: "Regular",
                },
            ]);

            return {
                messages,
                ...useThreadPinState<TestMessage>({
                    buildOptimisticThreadReply: createOptimisticReply,
                    contextId: "context-1",
                    createThreadReply: vi.fn(),
                    currentUserId: "user-1",
                    listPins,
                    listThreadMessages: vi.fn(),
                    messages,
                    pinContextType: "channel",
                    pinMessage,
                    setMessages,
                    unpinMessage,
                }),
            };
        });

        await waitFor(() => {
            expect(result.current.pins).toHaveLength(1);
        });

        await act(async () => {
            void result.current.togglePin({
                $createdAt: "2026-03-10T12:01:00.000Z",
                $id: "message-2",
                text: "Regular",
            });
        });

        expect(result.current.pins.map((item) => item.message.$id)).toEqual([
            "message-2",
            "message-1",
        ]);
        expect(result.current.messages[0]).toEqual(
            expect.objectContaining({
                isPinned: true,
                pinnedBy: "user-1",
            }),
        );

        await act(async () => {
            resolvePin?.();
        });

        expect(pinMessage).toHaveBeenCalledWith("message-2");

        await act(async () => {
            await result.current.togglePin({
                $createdAt: "2026-03-10T12:00:00.000Z",
                $id: "message-1",
                text: "Pinned",
            });
        });

        expect(unpinMessage).toHaveBeenCalledWith("message-1");
        expect(listPins).toHaveBeenCalledTimes(3);
    });

    it("opens threads and applies optimistic replies before server confirmation", async () => {
        const parent: TestMessage = {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "parent-1",
            lastThreadReplyAt: "2026-03-10T12:04:00.000Z",
            text: "Parent",
            threadMessageCount: 1,
            threadParticipants: ["user-2"],
        };
        const reply: TestMessage = {
            $createdAt: "2026-03-10T12:05:00.000Z",
            $id: "reply-1",
            text: "Reply",
        };
        const listThreadMessages = vi.fn().mockResolvedValue([]);
        const listPins = vi.fn().mockResolvedValue([]);

        let resolveReply: (() => void) | undefined;
        const createThreadReply = vi.fn(
            () =>
                new Promise<TestMessage>((resolve) => {
                    resolveReply = () => {
                        resolve(reply);
                    };
                }),
        );

        const { result } = renderHook(() => {
            const [messages, setMessages] = useState<TestMessage[]>([parent]);

            return {
                messages,
                ...useThreadPinState<TestMessage>({
                    buildOptimisticThreadReply: createOptimisticReply,
                    contextId: "context-1",
                    createThreadReply,
                    currentUserId: "user-1",
                    listPins,
                    listThreadMessages,
                    messages,
                    pinContextType: "channel",
                    pinMessage: vi.fn(),
                    setMessages,
                    unpinMessage: vi.fn(),
                }),
            };
        });

        expect(result.current.isThreadUnread(parent)).toBe(true);

        await act(async () => {
            await result.current.openThread(parent);
        });

        expect(listThreadMessages).toHaveBeenCalledWith("parent-1");
        expect(result.current.isThreadUnread(parent)).toBe(false);

        await act(async () => {
            void result.current.sendThreadReply("Reply");
        });

        expect(result.current.threadReplySending).toBe(true);
        expect(result.current.threadMessages).toHaveLength(1);
        expect(result.current.threadMessages[0].$id).toContain(
            "optimistic-thread-parent-1",
        );
        expect(result.current.messages[0]).toEqual(
            expect.objectContaining({
                threadMessageCount: 2,
                threadParticipants: ["user-2", "user-1"],
            }),
        );

        await act(async () => {
            resolveReply?.();
        });

        expect(createThreadReply).toHaveBeenCalledWith("parent-1", {
            text: "Reply",
        });
        expect(result.current.threadMessages).toEqual([reply]);
        expect(result.current.activeThreadParent).toEqual(
            expect.objectContaining({
                lastThreadReplyAt: "2026-03-10T12:05:00.000Z",
                threadMessageCount: 2,
                threadParticipants: ["user-2", "user-1"],
            }),
        );
        expect(result.current.threadReplySending).toBe(false);
        expect(result.current.isThreadUnread(parent)).toBe(false);
    });

    it("rolls back optimistic thread replies when the mutation fails", async () => {
        const parent: TestMessage = {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "parent-1",
            text: "Parent",
            threadMessageCount: 1,
            threadParticipants: ["user-2"],
        };
        const listPins = vi.fn().mockResolvedValue([]);
        const listThreadMessages = vi.fn().mockResolvedValue([]);
        const createThreadReply = vi
            .fn()
            .mockRejectedValue(new Error("send failed"));
        const { toast } = await import("sonner");

        const { result } = renderHook(() => {
            const [messages, setMessages] = useState<TestMessage[]>([parent]);

            return {
                messages,
                ...useThreadPinState<TestMessage>({
                    buildOptimisticThreadReply: createOptimisticReply,
                    contextId: "context-1",
                    createThreadReply,
                    currentUserId: "user-1",
                    listPins,
                    listThreadMessages,
                    messages,
                    pinContextType: "channel",
                    pinMessage: vi.fn(),
                    setMessages,
                    unpinMessage: vi.fn(),
                }),
            };
        });

        await act(async () => {
            await result.current.openThread(parent);
        });

        await act(async () => {
            await result.current.sendThreadReply("Reply");
        });

        expect(result.current.threadMessages).toEqual([]);
        expect(result.current.activeThreadParent).toEqual(parent);
        expect(result.current.messages).toEqual([parent]);
        expect(result.current.threadReplySending).toBe(false);
        expect(toast.error).toHaveBeenCalledWith("send failed");
    });
});
