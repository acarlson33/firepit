/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNotificationSettings } from "../../hooks/useNotificationSettings";

describe("useNotificationSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("loads settings on mount", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                $id: "settings-1",
                channelOverrides: {},
                conversationOverrides: {},
                desktopNotifications: true,
                directMessagePrivacy: "everyone",
                globalNotifications: "all",
                notificationSound: true,
                pushNotifications: true,
                quietHoursEnd: null,
                quietHoursStart: null,
                serverOverrides: {},
                userId: "user-1",
            }),
        });

        const { result } = renderHook(() => useNotificationSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.settings?.$id).toBe("settings-1");
        expect(global.fetch).toHaveBeenCalledWith("/api/notifications/settings");
    });

    it("updates settings through PATCH", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    $id: "settings-1",
                    channelOverrides: {},
                    conversationOverrides: {},
                    desktopNotifications: true,
                    directMessagePrivacy: "everyone",
                    globalNotifications: "all",
                    notificationSound: true,
                    pushNotifications: true,
                    quietHoursEnd: null,
                    quietHoursStart: null,
                    serverOverrides: {},
                    userId: "user-1",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    $id: "settings-1",
                    channelOverrides: {},
                    conversationOverrides: {},
                    desktopNotifications: false,
                    directMessagePrivacy: "everyone",
                    globalNotifications: "mentions",
                    notificationSound: true,
                    pushNotifications: true,
                    quietHoursEnd: null,
                    quietHoursStart: null,
                    serverOverrides: {},
                    userId: "user-1",
                }),
            });

        const { result } = renderHook(() => useNotificationSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            expect(
                await result.current.updateSettings({
                    desktopNotifications: false,
                    globalNotifications: "mentions",
                }),
            ).toBe(true);
        });

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            "/api/notifications/settings",
            expect.objectContaining({
                body: JSON.stringify({
                    desktopNotifications: false,
                    globalNotifications: "mentions",
                }),
                headers: { "Content-Type": "application/json" },
                method: "PATCH",
            }),
        );
        expect(result.current.settings?.globalNotifications).toBe("mentions");
    });

    it("mutes a channel and refreshes the settings", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    $id: "settings-1",
                    channelOverrides: {},
                    conversationOverrides: {},
                    desktopNotifications: true,
                    directMessagePrivacy: "everyone",
                    globalNotifications: "all",
                    notificationSound: true,
                    pushNotifications: true,
                    quietHoursEnd: null,
                    quietHoursStart: null,
                    serverOverrides: {},
                    userId: "user-1",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    $id: "settings-1",
                    channelOverrides: {
                        "channel-1": { level: "nothing" },
                    },
                    conversationOverrides: {},
                    desktopNotifications: true,
                    directMessagePrivacy: "everyone",
                    globalNotifications: "all",
                    notificationSound: true,
                    pushNotifications: true,
                    quietHoursEnd: null,
                    quietHoursStart: null,
                    serverOverrides: {},
                    userId: "user-1",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    $id: "settings-1",
                    channelOverrides: {
                        "channel-1": { level: "nothing" },
                    },
                    conversationOverrides: {},
                    desktopNotifications: true,
                    directMessagePrivacy: "everyone",
                    globalNotifications: "all",
                    notificationSound: true,
                    pushNotifications: true,
                    quietHoursEnd: null,
                    quietHoursStart: null,
                    serverOverrides: {},
                    userId: "user-1",
                }),
            });

        const { result } = renderHook(() => useNotificationSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            expect(await result.current.muteChannel("channel-1", "1h")).toBe(
                true,
            );
        });

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            "/api/channels/channel-1/mute",
            expect.objectContaining({
                body: JSON.stringify({
                    muted: true,
                    duration: "1h",
                    level: "nothing",
                }),
                method: "POST",
            }),
        );
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("reports load failures", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: "settings unavailable" }),
        });

        const { result } = renderHook(() => useNotificationSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.error).toBe("settings unavailable");
    });
});