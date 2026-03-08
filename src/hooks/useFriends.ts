"use client";

import { useCallback, useEffect, useState } from "react";

type FriendUserSummary = {
    userId: string;
    displayName?: string;
    pronouns?: string;
    avatarUrl?: string;
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

async function parseResponse(response: Response) {
    return (await response.json().catch(() => ({}))) as FriendsResponse;
}

export function useFriends() {
    const [friends, setFriends] = useState<FriendshipEntry[]>([]);
    const [incoming, setIncoming] = useState<FriendshipEntry[]>([]);
    const [outgoing, setOutgoing] = useState<FriendshipEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/friends");
            const data = await parseResponse(response);

            if (!response.ok) {
                throw new Error(data.error || "Failed to load friends");
            }

            setFriends(data.friends ?? []);
            setIncoming(data.incoming ?? []);
            setOutgoing(data.outgoing ?? []);
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load friends",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch]);

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

                await refetch();
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
        [refetch],
    );

    return {
        friends,
        incoming,
        outgoing,
        loading,
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
