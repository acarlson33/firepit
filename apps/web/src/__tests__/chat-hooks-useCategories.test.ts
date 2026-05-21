/**
 * @vitest-environment happy-dom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCategories } from "@/app/chat/hooks/useCategories";
import { apiCache } from "@/lib/cache-utils";
import type { ChannelCategory } from "@/lib/types";

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock("@/lib/cache-utils", () => ({
    apiCache: {
        has: vi.fn(() => false),
        swr: vi.fn((key: string, fn: () => Promise<unknown>) => fn()),
        clear: vi.fn(),
    },
    CACHE_TTL: {
        CATEGORIES: 60000,
    },
}));

describe("useCategories", () => {
    const mockServerId = "server123";
    const mockCategory: ChannelCategory = {
        $id: "category1",
        serverId: mockServerId,
        name: "General",
        position: 0,
        $createdAt: "2024-01-01T00:00:00.000Z",
    };

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("should expose initialLoading during a cold load", async () => {
        let resolveFetch:
            | ((value: { ok: boolean; json: () => Promise<unknown> }) => void)
            | undefined;

        (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFetch = resolve;
                }),
        );

        const { result } = renderHook(() => useCategories(mockServerId));

        await waitFor(() => {
            expect(result.current.initialLoading).toBe(true);
        });

        act(() => {
            resolveFetch?.({
                ok: true,
                json: async () => ({ categories: [mockCategory] }),
            });
        });

        await waitFor(() => {
            expect(result.current.initialLoading).toBe(false);
            expect(result.current.categories).toEqual([mockCategory]);
        });
    });

    it("should skip initialLoading when cached category data exists", async () => {
        (apiCache.has as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ categories: [mockCategory] }),
        });

        const { result } = renderHook(() => useCategories(mockServerId));

        await waitFor(() => {
            expect(result.current.categories).toEqual([mockCategory]);
        });

        expect(result.current.initialLoading).toBe(false);
    });

    it("should clear categories and loading state when no server is selected", () => {
        const { result } = renderHook(() => useCategories(null));

        expect(result.current.categories).toEqual([]);
        expect(result.current.initialLoading).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should refresh categories and clear cache", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ categories: [mockCategory] }),
            });

        const { result } = renderHook(() => useCategories(mockServerId));

        await waitFor(() => {
            expect(result.current.categories).toEqual([]);
        });

        await act(async () => {
            await result.current.refresh();
        });

        expect(apiCache.clear).toHaveBeenCalledWith(
            `categories:${mockServerId}:initial`,
        );
        expect(result.current.categories).toEqual([mockCategory]);
    });
});
