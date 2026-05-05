/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBlockedUsers } from "../../hooks/useBlockedUsers";

describe("useBlockedUsers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("loads blocked users on mount", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: [
                    {
                        block: {
                            $id: "block-1",
                            blockedAt: "2026-04-30T12:00:00.000Z",
                            blockedUserId: "user-2",
                            reason: "spam",
                            userId: "user-1",
                        },
                        user: { userId: "user-2", displayName: "Blocked User" },
                    },
                ],
            }),
        });

        const { result } = renderHook(() => useBlockedUsers());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.items).toHaveLength(1);
        expect(global.fetch).toHaveBeenCalledWith("/api/users/blocked");
    });

    it("unblocks a user and refreshes the list", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            block: {
                                $id: "block-1",
                                blockedAt: "2026-04-30T12:00:00.000Z",
                                blockedUserId: "user-2",
                                userId: "user-1",
                            },
                            user: { userId: "user-2" },
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ items: [] }),
            });

        const { result } = renderHook(() => useBlockedUsers());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let unblocked = false;
        await act(async () => {
            unblocked = await result.current.unblock("user-2");
        });

        expect(unblocked).toBe(true);

        expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/users/user-2/block", {
            method: "DELETE",
        });
        expect(global.fetch).toHaveBeenNthCalledWith(3, "/api/users/blocked");
    });

    it("reports blocked-user load failures", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: "blocked users failed" }),
        });

        const { result } = renderHook(() => useBlockedUsers());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.error).toBe("blocked users failed");
    });
});