/**
 * @vitest-environment happy-dom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeveloperMode } from "../../hooks/useDeveloperMode";

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return createElement(QueryClientProvider, { client: queryClient }, children);
    };
}

describe("useDeveloperMode", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("uses default navigation preferences when no user is present", () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useDeveloperMode(null), {
            wrapper: createWrapper(queryClient),
        });

        expect(result.current.developerMode).toBe(true);
        expect(result.current.isLoaded).toBe(true);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("loads preferences from the server", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                navigationItemOrder: ["friends", "docs"],
                showAddFriendInHeader: false,
                showDocsInNavigation: false,
                showFriendsInNavigation: true,
                showSettingsInNavigation: false,
                telemetryEnabled: false,
            }),
        });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useDeveloperMode("user-1"), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => {
            expect(result.current.isLoaded).toBe(true);
        });

        expect(result.current.developerMode).toBe(false);
        expect(result.current.navigationPreferences.navigationItemOrder).toEqual([
            "friends",
            "docs",
        ]);
        expect(global.fetch).toHaveBeenCalledWith("/api/me/preferences", {
            credentials: "include",
        });
    });

    it("saves developer mode changes", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    navigationItemOrder: ["docs", "friends", "settings"],
                    showAddFriendInHeader: true,
                    showDocsInNavigation: true,
                    showFriendsInNavigation: true,
                    showSettingsInNavigation: true,
                    telemetryEnabled: true,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    navigationItemOrder: ["docs", "friends", "settings"],
                    showAddFriendInHeader: true,
                    showDocsInNavigation: false,
                    showFriendsInNavigation: true,
                    showSettingsInNavigation: true,
                    telemetryEnabled: true,
                }),
            });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useDeveloperMode("user-1"), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => {
            expect(result.current.isLoaded).toBe(true);
        });

        await act(async () => {
            result.current.setDeveloperMode(false);
        });

        await waitFor(() => {
            expect(result.current.developerMode).toBe(false);
        });

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            "/api/me/preferences",
            expect.objectContaining({
                body: JSON.stringify({ showDocsInNavigation: false }),
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                method: "PATCH",
            }),
        );
    });

    it("does not mutate when userId is missing", async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useDeveloperMode(null), {
            wrapper: createWrapper(queryClient),
        });

        await act(async () => {
            result.current.setDeveloperMode(false);
            result.current.updateNavigationPreferences({
                showFriendsInNavigation: false,
            });
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });
});