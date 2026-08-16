/// <reference lib="dom" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NotificationSettings } from "../../components/notification-settings";

const { mockEnsurePublishedDmEncryptionKey, mockLoggerError } = vi.hoisted(
    () => ({
        mockEnsurePublishedDmEncryptionKey: vi.fn(),
        mockLoggerError: vi.fn(),
    }),
);

vi.mock("@/lib/dm-encryption", () => ({
    ensurePublishedDmEncryptionKeyForCurrentUser:
        mockEnsurePublishedDmEncryptionKey,
}));

vi.mock("@/lib/client-logger", () => ({
    logger: {
        error: mockLoggerError,
    },
}));

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const baseSettingsResponse = {
    $id: "settings-1",
    userId: "user-1",
    globalNotifications: "all",
    directMessagePrivacy: "everyone",
    desktopNotifications: true,
    pushNotifications: true,
    notificationSound: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    quietHoursTimezone: null,
    serverOverrides: {
        "server-1": { level: "mentions" },
    },
    channelOverrides: {
        "channel-1": { level: "nothing" },
    },
    conversationOverrides: {
        "conversation-1": { level: "all" },
    },
    overrideLabels: {
        serverOverrides: {
            "server-1": {
                title: "Alpha Server",
                subtitle: "Server notification override",
            },
        },
        channelOverrides: {
            "channel-1": {
                title: "#general",
                subtitle: "Alpha Server",
                meta: "Channel in Alpha Server",
            },
        },
        conversationOverrides: {
            "conversation-1": {
                title: "Project Crew",
                subtitle: "3 participants",
                meta: "Taylor, Morgan, Riley",
            },
        },
    },
};

describe("NotificationSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        mockEnsurePublishedDmEncryptionKey.mockResolvedValue(undefined);

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => baseSettingsResponse,
            }),
        );
    });

    it("renders server-enriched override labels from the settings response", async () => {
        render(<NotificationSettings />);

        await waitFor(() => {
            expect(screen.getAllByText("Alpha Server").length).toBeGreaterThan(
                0,
            );
        });

        expect(screen.getByText("#general")).toBeInTheDocument();
        expect(screen.getByText("Project Crew")).toBeInTheDocument();
        expect(screen.getByText("3 participants")).toBeInTheDocument();
    });

    it("supports bulk clearing expired overrides", async () => {
        const expiredSettingsResponse = {
            ...baseSettingsResponse,
            channelOverrides: {
                "channel-1": {
                    level: "nothing",
                    mutedUntil: "2020-01-01T00:00:00.000Z",
                },
            },
            conversationOverrides: {
                "conversation-1": {
                    level: "mentions",
                    mutedUntil: "2020-01-01T00:00:00.000Z",
                },
            },
        };

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => expiredSettingsResponse,
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...baseSettingsResponse,
                    channelOverrides: {},
                    conversationOverrides: {},
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(<NotificationSettings />);

        await screen.findByRole("button", {
            name: "Clear expired overrides (2)",
        });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Clear expired overrides (2)",
            }),
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                2,
                "/api/notifications/settings",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({
                        serverOverrides:
                            expiredSettingsResponse.serverOverrides,
                        channelOverrides: {},
                        conversationOverrides: {},
                    }),
                }),
            );
        });
    });

    it("supports resetting channel overrides", async () => {
        const channelOnlySettingsResponse = {
            ...baseSettingsResponse,
            channelOverrides: {
                "channel-1": { level: "nothing" },
            },
            conversationOverrides: {},
        };

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => channelOnlySettingsResponse,
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...channelOnlySettingsResponse,
                    channelOverrides: {},
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(<NotificationSettings />);

        await screen.findByRole("button", {
            name: "Reset channel overrides (1)",
        });

        fireEvent.click(
            screen.getByRole("button", {
                name: "Reset channel overrides (1)",
            }),
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenLastCalledWith(
                "/api/notifications/settings",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({ channelOverrides: {} }),
                }),
            );
        });
    });

    it("hydrates DM encryption toggle from local fallback when server field is missing", async () => {
        window.localStorage.setItem("firepit.dmEncryptionEnabled", "true");

        render(<NotificationSettings />);

        const dmEncryptionToggle = await screen.findByRole("switch", {
            name: "Optional DM text encryption",
        });

        expect(dmEncryptionToggle).toHaveAttribute("aria-checked", "true");
    });

    it("sends dmEncryptionEnabled=true to the server when toggle is enabled and saved", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...baseSettingsResponse,
                    dmEncryptionEnabled: false,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...baseSettingsResponse,
                    dmEncryptionEnabled: true,
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(<NotificationSettings />);

        const dmEncryptionToggle = await screen.findByRole("switch", {
            name: "Optional DM text encryption",
        });

        fireEvent.click(dmEncryptionToggle);
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

        await waitFor(() => {
            const patchCall = fetchMock.mock.calls.find(
                ([url, options]) =>
                    url === "/api/notifications/settings" &&
                    options &&
                    typeof options === "object" &&
                    "method" in options &&
                    (options as { method?: string }).method === "PATCH",
            );

            expect(patchCall).toBeDefined();

            const payload = JSON.parse(
                ((patchCall?.[1] as { body?: string }).body as string) ||
                    "{}",
            ) as { dmEncryptionEnabled?: boolean };

            expect(payload.dmEncryptionEnabled).toBe(true);
        });
    });

    it("logs when DM encryption key publish fails after enabling encryption", async () => {
        mockEnsurePublishedDmEncryptionKey.mockRejectedValueOnce(
            new Error("sodium.from_base64 is undefined"),
        );

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...baseSettingsResponse,
                    dmEncryptionEnabled: false,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...baseSettingsResponse,
                    dmEncryptionEnabled: true,
                }),
            });

        vi.stubGlobal("fetch", fetchMock);

        render(<NotificationSettings />);

        const dmEncryptionToggle = await screen.findByRole("switch", {
            name: "Optional DM text encryption",
        });

        fireEvent.click(dmEncryptionToggle);
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

        await waitFor(() => {
            expect(mockLoggerError).toHaveBeenCalledWith(
                "Failed to publish DM encryption key from notification settings",
                expect.any(Error),
            );
        });
    });
});
