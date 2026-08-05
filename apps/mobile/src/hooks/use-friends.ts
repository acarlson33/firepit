import { useCallback, useEffect, useState } from "react";
import {
    fetchFriendsList,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriendship,
} from "@/lib/firepit/messages";
import type { FriendshipEntry } from "@/lib/firepit/types";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type FriendsData = {
    friends: FriendshipEntry[];
    incoming: FriendshipEntry[];
    outgoing: FriendshipEntry[];
};

const FRIENDS_CACHE_TTL = 30_000;
const friendsCache = new Map<string, { data: FriendsData; cachedAt: number }>();

function friendsCacheKey(instanceUrl: string | null, currentUserId: string | null) {
    return `${instanceUrl ?? "anon"}:${currentUserId ?? "anon"}`;
}

export function useFriends() {
    const { instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;
    const cacheKey = friendsCacheKey(instanceUrl, currentUserId);
    const [data, setData] = useState<FriendsData>(() => {
        const cached = friendsCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < FRIENDS_CACHE_TTL) {
            return cached.data;
        }
        return { friends: [], incoming: [], outgoing: [] };
    });
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!instanceUrl || !accessToken) {
            setData({ friends: [], incoming: [], outgoing: [] });
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetchFriendsList(instanceUrl, accessToken);
            const next = {
                friends: res.friends ?? [],
                incoming: res.incoming ?? [],
                outgoing: res.outgoing ?? [],
            };
            friendsCache.set(cacheKey, { data: next, cachedAt: Date.now() });
            setData(next);
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load friends",
            );
        } finally {
            setLoading(false);
        }
    }, [accessToken, cacheKey, instanceUrl]);

    useEffect(() => {
        const cached = friendsCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < FRIENDS_CACHE_TTL) {
            return;
        }
        void refetch();
    }, [refetch, cacheKey]);

    const runMutation = useCallback(
        async (
            fn: () => Promise<{ success?: boolean }>,
        ): Promise<boolean> => {
            if (!instanceUrl || !accessToken) return false;
            setActionLoading(true);
            setError(null);
            try {
                await fn();
                await refetch();
                return true;
            } catch (mutationError) {
                setError(
                    mutationError instanceof Error
                        ? mutationError.message
                        : "Action failed",
                );
                return false;
            } finally {
                setActionLoading(false);
            }
        },
        [accessToken, instanceUrl, refetch],
    );

    return {
        ...data,
        currentUserId,
        loading,
        actionLoading,
        error,
        refetch,
        acceptRequest: (targetUserId: string) =>
            instanceUrl && accessToken
                ? runMutation(() =>
                      acceptFriendRequest(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
        declineRequest: (targetUserId: string) =>
            instanceUrl && accessToken
                ? runMutation(() =>
                      declineFriendRequest(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
        removeFriend: (targetUserId: string) =>
            instanceUrl && accessToken
                ? runMutation(() =>
                      removeFriendship(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
    };
}
