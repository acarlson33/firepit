"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/auth-context";

type FriendUserSummary = {
    userId: string;
    displayName?: string;
    pronouns?: string;
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
};

type FriendshipRecord = {
    $id: string;
    requesterId: string;
    addresseeId: string;
    status: "pending" | "accepted";
    createdAt: string;
    respondedAt?: string;
};

type FriendshipEntry = {
    friendship: FriendshipRecord;
    user: FriendUserSummary;
};

type FriendsResponse = {
    friends?: FriendshipEntry[];
    incoming?: FriendshipEntry[];
    outgoing?: FriendshipEntry[];
    error?: string;
};

type FriendsData = {
    friends: FriendshipEntry[];
    incoming: FriendshipEntry[];
    outgoing: FriendshipEntry[];
};

const EMPTY_FRIENDS_DATA: FriendsData = {
    friends: [],
    incoming: [],
    outgoing: [],
};

function getFriendsQueryKey(userId: string | null) {
    return ["friends", userId] as const;
}

async function parseResponse(response: Response) {
    return (await response.json().catch(() => ({}))) as FriendsResponse;
}

async function fetchFriends(): Promise<FriendsData> {
    const response = await fetch("/api/friends");
    const data = await parseResponse(response);

    if (!response.ok) {
        throw new Error(data.error || "Failed to load friends");
    }

    return {
        friends: data.friends ?? [],
        incoming: data.incoming ?? [],
        outgoing: data.outgoing ?? [],
    };
}

export function useFriends(enabled = true) {
    const { userData } = useAuth();
    const queryClient = useQueryClient();
    const currentUserId = userData?.userId ?? null;
    const isEnabled = enabled && Boolean(currentUserId);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const {
        data,
        isLoading,
        refetch: queryRefetch,
    } = useQuery({
        queryKey: getFriendsQueryKey(currentUserId),
        queryFn: fetchFriends,
        enabled: isEnabled,
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    const friendsData = isEnabled
        ? (data ?? EMPTY_FRIENDS_DATA)
        : EMPTY_FRIENDS_DATA;

    const refetch = useCallback(async () => {
        if (!isEnabled) {
            setError(null);
            return EMPTY_FRIENDS_DATA;
        }

        setError(null);

        try {
            const result = await queryRefetch();
            if (result.error) {
                throw result.error;
            }

            return result.data ?? EMPTY_FRIENDS_DATA;
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load friends",
            );
            return EMPTY_FRIENDS_DATA;
        }
    }, [isEnabled, queryRefetch]);

    const runAction = useCallback(
        async (
            key: string,
            input: {
                url: string;
                method: "POST" | "DELETE";
            },
        ) => {
            setActionLoading(key);
            setError(null);
            try {
                const response = await fetch(input.url, {
                    method: input.method,
                });
                const data = await parseResponse(response);

                if (!response.ok) {
                    throw new Error(data.error || "Friend action failed");
                }

                if (currentUserId) {
                    await queryClient.invalidateQueries({
                        queryKey: getFriendsQueryKey(currentUserId),
                        refetchType: "active",
                    });
                }
                return true;
            } catch (actionError) {
                setError(
                    actionError instanceof Error
                        ? actionError.message
                        : "Friend action failed",
                );
                return false;
            } finally {
                setActionLoading(null);
            }
        },
        [currentUserId, queryClient, refetch],
    );

    return {
        friends: friendsData.friends,
        incoming: friendsData.incoming,
        outgoing: friendsData.outgoing,
        loading: isEnabled ? isLoading : false,
        actionLoading,
        error,
        refetch,
        acceptFriendRequest: (userId: string) =>
            runAction(`accept:${userId}`, {
                url: `/api/friends/${userId}/accept`,
                method: "POST",
            }),
        declineFriendRequest: (userId: string) =>
            runAction(`decline:${userId}`, {
                url: `/api/friends/${userId}/decline`,
                method: "POST",
            }),
        removeFriendship: (userId: string) =>
            runAction(`remove:${userId}`, {
                url: `/api/friends/${userId}`,
                method: "DELETE",
            }),
    };
}
