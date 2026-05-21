/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/contexts/auth-context", () => ({
    useAuth: () => mockUseAuth(),
}));

import { useRelationship } from "../../hooks/useRelationship";

describe("useRelationship", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthState.userData = {
            email: "test@example.com",
            name: "Test User",
            roles: { isAdmin: false, isModerator: false },
            userId: "user-1",
        };
        mockUseAuth.mockReturnValue(mockAuthState);
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("skips loading when target user is missing", () => {
        const { result } = renderHook(() => useRelationship(null));

        expect(result.current.relationship).toBeNull();
        expect(result.current.loading).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("loads relationship state for another user", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                relationship: {
                    blockedByMe: false,
                    blockedMe: false,
                    canReceiveFriendRequest: true,
                    canSendDirectMessage: true,
                    directMessagePrivacy: "everyone",
                    incomingRequest: false,
                    friendshipStatus: "none",
                    isFriend: false,
                    outgoingRequest: false,
                    userId: "user-2",
                },
            }),
        });

        const { result } = renderHook(() => useRelationship("user-2"));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.relationship?.userId).toBe("user-2");
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/users/user-2/relationship",
        );
    });

    it("treats the current user as self and skips fetches", () => {
        const { result } = renderHook(() => useRelationship("user-1"));

        expect(result.current.isSelf).toBe(true);
        expect(result.current.relationship).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("sends a friend request and refetches the relationship", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    relationship: {
                        blockedByMe: false,
                        blockedMe: false,
                        canReceiveFriendRequest: true,
                        canSendDirectMessage: true,
                        directMessagePrivacy: "everyone",
                        incomingRequest: false,
                        friendshipStatus: "none",
                        isFriend: false,
                        outgoingRequest: false,
                        userId: "user-2",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    relationship: {
                        blockedByMe: false,
                        blockedMe: false,
                        canReceiveFriendRequest: false,
                        canSendDirectMessage: true,
                        directMessagePrivacy: "friends",
                        incomingRequest: false,
                        friendshipStatus: "pending",
                        isFriend: false,
                        outgoingRequest: true,
                        userId: "user-2",
                    },
                }),
            });

        const { result } = renderHook(() => useRelationship("user-2"));

        await waitFor(() => {
            expect(result.current.relationship?.userId).toBe("user-2");
        });

        await act(async () => {
            expect(await result.current.sendFriendRequest()).toBe(true);
        });

        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            "/api/friends/request",
            expect.objectContaining({
                body: JSON.stringify({ targetUserId: "user-2" }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            3,
            "/api/users/user-2/relationship",
        );
    });

    it("surfaces mutation errors", async () => {
        (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ relationship: null }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: "blocked" }),
            });

        const { result } = renderHook(() => useRelationship("user-2"));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            expect(await result.current.blockUser("spam")).toBe(false);
        });

        expect(result.current.error).toBe("blocked");
    });
});