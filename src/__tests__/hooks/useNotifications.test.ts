/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCloseSubscriptionSafely, mockGetEnvConfig, mockSubscribe, mockTrackSubscription } =
    vi.hoisted(() => ({
        mockCloseSubscriptionSafely: vi.fn(() => Promise.resolve()),
        mockGetEnvConfig: vi.fn(() => ({
            collections: {
                directMessages: "direct-messages",
                messages: "messages",
            },
            databaseId: "database-1",
        })),
        mockSubscribe: vi.fn(async () => ({ close: vi.fn() })),
        mockTrackSubscription: vi.fn(() => vi.fn()),
    }));

vi.mock("../../lib/appwrite-core", () => ({
    getEnvConfig: mockGetEnvConfig,
}));

vi.mock("../../lib/realtime-error-suppression", () => ({
    closeSubscriptionSafely: mockCloseSubscriptionSafely,
}));

vi.mock("../../lib/realtime-pool", () => ({
    getSharedRealtime: vi.fn(() => ({
        subscribe: mockSubscribe,
    })),
    trackSubscription: mockTrackSubscription,
}));

vi.mock("../../lib/notification-triggers", () => ({
    buildNotificationPayload: vi.fn(),
    extractMentionedUserIds: vi.fn(() => []),
    shouldNotifyUser: vi.fn(),
}));

vi.mock("../../lib/client-logger", () => ({
    logger: {
        warn: vi.fn(),
    },
}));

vi.mock("appwrite", () => ({
    Channel: {
        database: vi.fn(() => ({
            collection: vi.fn(() => ({
                document: vi.fn(() => ({
                    toString: () => "channel-key",
                })),
            })),
        })),
    },
    Query: {
        equal: vi.fn((field: string, value: string) => ({ field, value })),
    },
}));

import { useNotifications } from "../../hooks/useNotifications";

describe("useNotifications", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "Notification",
            Object.assign(function NotificationMock() {}, {
                permission: "granted",
                requestPermission: vi.fn().mockResolvedValue("granted"),
            }),
        );
    });

    it("returns denied when notifications are unavailable", async () => {
        vi.unstubAllGlobals();

        const { result } = renderHook(() =>
            useNotifications({ userId: "user-1" }),
        );

        await expect(result.current.requestPermission()).resolves.toBe("denied");
    });

    it("returns granted immediately when permission is already granted", async () => {
        const { result } = renderHook(() =>
            useNotifications({ userId: "user-1" }),
        );

        await expect(result.current.requestPermission()).resolves.toBe(
            "granted",
        );
    });

    it("subscribes to channel messages when the user is away from the app", async () => {
        renderHook(() =>
            useNotifications({
                channelId: "channel-1",
                isWindowFocused: false,
                userId: "user-1",
            }),
        );

        await waitFor(() => {
            expect(mockSubscribe).toHaveBeenCalledTimes(1);
        });

        expect(mockTrackSubscription).toHaveBeenCalledWith("channel-key");
    });

    it("subscribes to DM messages when the conversation is hidden", async () => {
        renderHook(() =>
            useNotifications({
                conversationId: "conversation-1",
                isWindowFocused: false,
                userId: "user-1",
            }),
        );

        await waitFor(() => {
            expect(mockSubscribe).toHaveBeenCalledTimes(1);
        });

        expect(mockSubscribe).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Function),
            [{ field: "conversationId", value: "conversation-1" }],
        );
    });
});