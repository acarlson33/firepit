/**
 * @vitest-environment happy-dom
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDirectMessages } from "@/app/chat/hooks/useDirectMessages";
import { useMessages } from "@/app/chat/hooks/useMessages";

const {
    mockGetEnrichedMessages,
    mockListDirectMessages,
    mockUseThreadPinState,
} = vi.hoisted(() => ({
    mockGetEnrichedMessages: vi.fn(),
    mockListDirectMessages: vi.fn(),
    mockUseThreadPinState: vi.fn((options) => {
        mockUseThreadPinState._lastOptions = options;
        return {
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
        };
    }),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        collections: {
            directMessages: "direct-messages",
            messages: "messages",
            typing: "typing",
        },
        databaseId: "database-1",
    })),
}));

vi.mock("@/lib/appwrite-messages", () => ({
    canSend: vi.fn(),
    setTyping: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/appwrite-messages-enriched", () => ({
    getEnrichedMessages: mockGetEnrichedMessages,
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
    deleteDirectMessage: vi.fn(),
    editDirectMessage: vi.fn(),
    listDirectMessages: mockListDirectMessages,
    sendDirectMessage: vi.fn(),
}));

vi.mock("@/lib/thread-pin-client", () => ({
    createChannelThreadReply: vi.fn(),
    createDMThreadReply: vi.fn(),
    listChannelPins: vi.fn(() => Promise.resolve([])),
    listChannelThreadMessages: vi.fn(() => Promise.resolve([])),
    listConversationPins: vi.fn(() => Promise.resolve([])),
    listDMThreadMessages: vi.fn(() => Promise.resolve([])),
    pinChannelMessage: vi.fn(),
    pinDMMessage: vi.fn(),
    unpinChannelMessage: vi.fn(),
    unpinDMMessage: vi.fn(),
}));

vi.mock("@/lib/realtime-pool", () => ({
    getSharedClient: vi.fn(() => ({
        subscribe: vi.fn(() => vi.fn()),
    })),
    trackSubscription: vi.fn(() => vi.fn()),
}));

vi.mock("@/hooks/useDebounce", () => ({
    useDebouncedBatchUpdate: vi.fn((callback) => (update: unknown) => {
        callback([update]);
    }),
}));

vi.mock("@/lib/reactions-utils", () => ({
    parseReactions: vi.fn((reactions) => reactions ?? []),
}));

vi.mock("@/lib/mention-utils", () => ({
    extractMentionedUsernames: vi.fn(() => []),
    extractMentionsWithKnownNames: vi.fn(() => []),
}));

vi.mock("@/app/chat/hooks/useThreadPinState", () => ({
    useThreadPinState: mockUseThreadPinState,
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe("thread-read callback wiring", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetEnrichedMessages.mockResolvedValue([]);
        mockListDirectMessages.mockResolvedValue({
            items: [],
            readOnly: false,
            readOnlyReason: null,
            relationship: null,
        });

        const fetchMock = vi.fn(async () => {
            return {
                json: async () => ({}),
                ok: true,
            } as Response;
        });
        vi.stubGlobal("fetch", fetchMock);
        if (typeof window !== "undefined") {
            window.fetch = fetchMock as typeof fetch;
        }
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("keeps channel thread-read callbacks stable across rerenders", async () => {
        const { rerender } = renderHook(() =>
            useMessages({
                channelId: "channel-1",
                serverId: "server-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(mockGetEnrichedMessages).toHaveBeenCalled();
        });

        const firstOptions = mockUseThreadPinState._lastOptions as {
            listThreadReads: unknown;
            persistThreadReads: unknown;
        };

        rerender();

        const nextOptions = mockUseThreadPinState._lastOptions as {
            listThreadReads: unknown;
            persistThreadReads: unknown;
        };

        expect(nextOptions.listThreadReads).toBe(firstOptions.listThreadReads);
        expect(nextOptions.persistThreadReads).toBe(
            firstOptions.persistThreadReads,
        );
    });

    it("keeps direct-message thread-read callbacks stable across rerenders", async () => {
        const { rerender } = renderHook(() =>
            useDirectMessages({
                conversationId: "conversation-1",
                userId: "user-1",
                userName: "User One",
            }),
        );

        await waitFor(() => {
            expect(mockListDirectMessages).toHaveBeenCalled();
        });

        const firstOptions = mockUseThreadPinState._lastOptions as {
            listThreadReads: unknown;
            persistThreadReads: unknown;
        };

        rerender();

        const nextOptions = mockUseThreadPinState._lastOptions as {
            listThreadReads: unknown;
            persistThreadReads: unknown;
        };

        expect(nextOptions.listThreadReads).toBe(firstOptions.listThreadReads);
        expect(nextOptions.persistThreadReads).toBe(
            firstOptions.persistThreadReads,
        );
    });
});
