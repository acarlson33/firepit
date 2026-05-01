/**
 * @vitest-environment happy-dom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthState, mockUseAuth } = vi.hoisted(() => ({
    mockAuthState: {
        userData: null as
            | {
                  userId: string;
                  name: string;
                  email: string;
                  roles: { isAdmin: boolean; isModerator: boolean };
              }
            | null,
    },
    mockUseAuth: vi.fn(),
}));

vi.mock("../../contexts/auth-context", () => ({
    useAuth: () => mockUseAuth(),
}));

import { useFriends } from "../../hooks/useFriends";

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return createElement(QueryClientProvider, { client: queryClient }, children);
    };
}

describe("useFriends", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthState.userData = {
            email: "test@example.com",
            name: "Test User",
            roles: { isAdmin: false, isModerator: false },
            userId: "user-1",
        };
        mockUseAuth.mockReturnValue(mockAuthState);
        global.fetch = vi.fn();
    });

    it("loads friend lists for the current user", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                friends: [
                    {
                        friendship: {
                            $id: "friendship-1",
                            addresseeId: "user-1",
                            createdAt: "2026-04-30T12:00:00.000Z",
                            requesterId: "user-2",
                            status: "accepted",
                        },
                        user: { userId: "user-2", displayName: "User Two" },
                    },
                ],
                incoming: [],
                outgoing: [],
            }),
        });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useFriends(), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.friends).toHaveLength(1);
        expect(result.current.friends[0]?.user.userId).toBe("user-2");
    });

    it("does not load when disabled", () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useFriends(false), {
            wrapper: createWrapper(queryClient),
        });

        expect(result.current.loading).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("invalidates the cached list after accepting a request", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ friends: [], incoming: [], outgoing: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

        const { result } = renderHook(() => useFriends(), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            expect(await result.current.acceptFriendRequest("user-2")).toBe(true);
        });

        expect(global.fetch).toHaveBeenCalledWith("/api/friends/user-2/accept", {
            method: "POST",
        });
        expect(invalidateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ queryKey: ["friends", "user-1"] }),
        );
    });

    it("surfaces friend action failures", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ friends: [], incoming: [], outgoing: [] }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: "friend action failed" }),
            });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        const { result } = renderHook(() => useFriends(), {
            wrapper: createWrapper(queryClient),
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            expect(await result.current.acceptFriendRequest("user-2")).toBe(
                false,
            );
        });

        expect(result.current.error).toBe("friend action failed");
    });
});