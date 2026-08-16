/**
 * @vitest-environment happy-dom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInboxDigest } from "@/app/chat/hooks/useInboxDigest";
import * as inboxClient from "@/lib/inbox-client";

vi.mock("@/lib/inbox-client", () => ({
    listInboxDigest: vi.fn(),
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
        return createElement(
            QueryClientProvider,
            { client: queryClient },
            children,
        );
    };
}

describe("useInboxDigest", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stays idle when userId is missing", () => {
        const { result } = renderHook(
            () =>
                useInboxDigest({
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    userId: null,
                }),
            { wrapper: createWrapper() },
        );

        expect(result.current.loading).toBe(false);
        expect(result.current.items).toEqual([]);
        expect(inboxClient.listInboxDigest).not.toHaveBeenCalled();
    });

    it("loads digest data and computes unreadByKind", async () => {
        (
            inboxClient.listInboxDigest as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
            contractVersion: "message_v2",
            contextId: "conversation-1",
            contextKind: "conversation",
            items: [
                {
                    activityAt: "2026-03-12T10:00:00.000Z",
                    authorLabel: "User Two",
                    authorUserId: "user-2",
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    id: "thread:conversation:conversation-1:message-1",
                    kind: "thread",
                    messageId: "message-1",
                    muted: false,
                    previewText: "Unread thread",
                    unreadCount: 2,
                },
                {
                    activityAt: "2026-03-12T10:01:00.000Z",
                    authorLabel: "User Three",
                    authorUserId: "user-3",
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    id: "mention:conversation:conversation-1:message-2",
                    kind: "mention",
                    messageId: "message-2",
                    muted: false,
                    previewText: "@you",
                    unreadCount: 1,
                },
            ],
            totalUnreadCount: 3,
        });

        const { result } = renderHook(
            () =>
                useInboxDigest({
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    userId: "user-1",
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(inboxClient.listInboxDigest).toHaveBeenCalledWith({
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: undefined,
        });
        expect(result.current.totalUnreadCount).toBe(3);
        expect(result.current.unreadByKind).toEqual({ mention: 1, thread: 2 });
        expect(result.current.contractVersion).toBe("message_v2");
    });

    it("refetches when limit changes", async () => {
        (
            inboxClient.listInboxDigest as ReturnType<typeof vi.fn>
        ).mockResolvedValue({
            contractVersion: "thread_v1",
            items: [],
            totalUnreadCount: 0,
        });

        const { rerender } = renderHook(
            ({ limit }) =>
                useInboxDigest({
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    limit,
                    userId: "user-1",
                }),
            {
                initialProps: { limit: 10 },
                wrapper: createWrapper(),
            },
        );

        await waitFor(() => {
            expect(inboxClient.listInboxDigest).toHaveBeenCalledTimes(1);
        });

        rerender({ limit: 25 });

        await waitFor(() => {
            expect(inboxClient.listInboxDigest).toHaveBeenCalledTimes(2);
        });

        expect(inboxClient.listInboxDigest).toHaveBeenNthCalledWith(1, {
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: 10,
        });
        expect(inboxClient.listInboxDigest).toHaveBeenNthCalledWith(2, {
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: 25,
        });
    });
});
