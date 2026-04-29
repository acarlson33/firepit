/**
 * @vitest-environment happy-dom
 */
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategorySettingsPanel } from "@/components/category-settings-panel";
import { apiCache } from "@/lib/cache-utils";
import { toast } from "sonner";

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock("@/lib/cache-utils", () => ({
    apiCache: {
        clear: vi.fn(),
    },
}));

describe("CategorySettingsPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("renders fetched categories and channels", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    categories: [
                        {
                            $id: "category-1",
                            serverId: "server-1",
                            name: "General",
                            position: 0,
                            $createdAt: "2026-03-09T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    channels: [
                        {
                            $id: "channel-1",
                            serverId: "server-1",
                            name: "welcome",
                            categoryId: "category-1",
                            position: 0,
                            $createdAt: "2026-03-09T00:00:00.000Z",
                        },
                    ],
                    nextCursor: null,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    roles: [],
                }),
            });

        render(<CategorySettingsPanel canManage={true} serverId="server-1" />);

        expect((await screen.findAllByText("General")).length).toBeGreaterThan(
            0,
        );
        expect((await screen.findAllByText("welcome")).length).toBeGreaterThan(
            0,
        );
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringMatching(/^\/api\/roles\?serverId=server-1$/),
            );
        });
    });

    it("creates a category and refreshes sidebar caches", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ channels: [], nextCursor: null }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    category: {
                        $id: "category-2",
                        serverId: "server-1",
                        name: "Announcements",
                        position: 0,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    categories: [
                        {
                            $id: "category-2",
                            serverId: "server-1",
                            name: "Announcements",
                            position: 0,
                            $createdAt: "2026-03-09T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ channels: [], nextCursor: null }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            });

        const categoriesChanged = vi.fn();
        const channelsChanged = vi.fn();
        window.addEventListener(
            "firepit:categories-changed",
            categoriesChanged,
        );
        window.addEventListener("firepit:channels-changed", channelsChanged);

        render(<CategorySettingsPanel canManage={true} serverId="server-1" />);

        await screen.findByText("No categories created yet.");

        fireEvent.change(screen.getByLabelText("New category"), {
            target: { value: "Announcements" },
        });
        const categoryCard = screen
            .getByText("Channel Categories")
            .closest("[data-slot='card']");
        const createCategoryButton = categoryCard
            ? within(categoryCard).getByRole("button", { name: /create/i })
            : screen.getAllByRole("button", { name: /create/i }).at(-1);

        if (!createCategoryButton) {
            throw new Error("Expected category create button to be available");
        }

        fireEvent.click(createCategoryButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/categories",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                }),
            );
        });

        await waitFor(() => {
            expect(apiCache.clear).toHaveBeenCalledWith(
                "categories:server-1:initial",
            );
            expect(apiCache.clear).toHaveBeenCalledWith(
                "channels:server-1:initial",
            );
        });

        expect(toast.success).toHaveBeenCalledWith("Category created");
        expect(categoriesChanged).toHaveBeenCalledTimes(1);
        expect(channelsChanged).toHaveBeenCalledTimes(1);

        window.removeEventListener(
            "firepit:categories-changed",
            categoriesChanged,
        );
        window.removeEventListener("firepit:channels-changed", channelsChanged);
    });

    it("creates channels from channel setup", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ channels: [], nextCursor: null }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    channel: {
                        $id: "channel-2",
                        serverId: "server-1",
                        name: "town-hall",
                        type: "text",
                        position: 0,
                        $createdAt: "2026-03-09T00:00:00.000Z",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    channels: [
                        {
                            $id: "channel-2",
                            serverId: "server-1",
                            name: "town-hall",
                            type: "text",
                            position: 0,
                            $createdAt: "2026-03-09T00:00:00.000Z",
                        },
                    ],
                    nextCursor: null,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            });

        render(<CategorySettingsPanel canManage={true} serverId="server-1" />);

        await screen.findByText("Channel Setup");

        fireEvent.change(screen.getByLabelText("New channel"), {
            target: { value: "town-hall" },
        });

        const channelSetupCard = screen
            .getByText("Channel Setup")
            .closest("[data-slot='card']");
        const createButtons = screen.getAllByRole("button", {
            name: /create/i,
        });
        const fallbackCreateButton = createButtons.at(0);
        const createButton = channelSetupCard
            ? within(channelSetupCard).getByRole("button", { name: /create/i })
            : fallbackCreateButton;

        if (!createButton) {
            throw new Error("Create button was not found");
        }

        fireEvent.click(createButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/channels",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                }),
            );
        });

        expect(toast.success).toHaveBeenCalledWith("Channel created");
    });

    it("updates channel type to announcement from assign channels", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    channels: [
                        {
                            $id: "channel-voice",
                            serverId: "server-1",
                            name: "voice-lounge",
                            type: "voice",
                            position: 0,
                            $createdAt: "2026-03-09T00:00:00.000Z",
                        },
                    ],
                    nextCursor: null,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ channel: { $id: "channel-voice" } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    channels: [
                        {
                            $id: "channel-voice",
                            serverId: "server-1",
                            name: "voice-lounge",
                            type: "announcement",
                            position: 0,
                            $createdAt: "2026-03-09T00:00:00.000Z",
                        },
                    ],
                    nextCursor: null,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            });

        render(<CategorySettingsPanel canManage={true} serverId="server-1" />);

        await screen.findByText("voice-lounge");

        fireEvent.click(screen.getByRole("button", { name: "Announcement" }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/channels/channel-voice",
                expect.objectContaining({
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                }),
            );
        });

        expect(toast.success).toHaveBeenCalledWith("Channel type updated");
    });

    it("shows a restricted message when management is disabled", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ channels: [], nextCursor: null }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ roles: [] }),
            });

        render(<CategorySettingsPanel canManage={false} serverId="server-1" />);

        expect(
            await screen.findByText(/Category management is limited/i),
        ).toBeTruthy();
    });
});
