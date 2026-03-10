/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { useThreadPinState } from "@/app/chat/hooks/useThreadPinState";

type TestMessage = {
    $createdAt: string;
    $id: string;
    text: string;
    threadMessageCount?: number;
    threadParticipants?: string[];
    lastThreadReplyAt?: string;
};

describe("useThreadPinState", () => {
    it("loads pins for the current context and toggles pin state", async () => {
        const listPins = vi.fn().mockResolvedValue([
            {
                message: {
                    $createdAt: "2026-03-10T12:00:00.000Z",
                    $id: "message-1",
                    text: "Pinned",
                },
                pin: { $id: "pin-1" },
            },
        ]);
        const pinMessage = vi.fn().mockResolvedValue({ $id: "pin-2" });
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
                    contextId: "context-1",
                    createThreadReply: vi.fn(),
                    currentUserId: "user-1",
                    listPins,
                    listThreadMessages: vi.fn(),
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
            await result.current.togglePin({
                $createdAt: "2026-03-10T12:01:00.000Z",
                $id: "message-2",
                text: "Regular",
            });
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

    it("opens threads and updates parent metadata after sending a reply", async () => {
        const parent: TestMessage = {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "parent-1",
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
        const createThreadReply = vi.fn().mockResolvedValue(reply);

        const { result } = renderHook(() => {
            const [messages, setMessages] = useState<TestMessage[]>([parent]);

            return {
                messages,
                ...useThreadPinState<TestMessage>({
                    contextId: "context-1",
                    createThreadReply,
                    currentUserId: "user-1",
                    listPins,
                    listThreadMessages,
                    pinMessage: vi.fn(),
                    setMessages,
                    unpinMessage: vi.fn(),
                }),
            };
        });

        await act(async () => {
            await result.current.openThread(parent);
        });

        expect(listThreadMessages).toHaveBeenCalledWith("parent-1");
        expect(result.current.activeThreadParent?.$id).toBe("parent-1");

        await act(async () => {
            await result.current.sendThreadReply("Reply");
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
        expect(result.current.messages[0]).toEqual(
            expect.objectContaining({
                lastThreadReplyAt: "2026-03-10T12:05:00.000Z",
                threadMessageCount: 2,
                threadParticipants: ["user-2", "user-1"],
            }),
        );
    });
});
