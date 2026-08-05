import { useCallback, useEffect, useState } from "react";
import {
    fetchBlockedUsers,
    unblockUser,
} from "@/lib/firepit/messages";
import type { BlockedUserEntry } from "@/lib/firepit/types";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

const BLOCKED_CACHE_TTL = 30_000;
const blockedCache = new Map<string, { data: BlockedUserEntry[]; cachedAt: number }>();

function blockedCacheKey(instanceUrl: string, accountId: string): string {
    return `${instanceUrl}|${accountId}`;
}

export function useBlockedUsers() {
    const { instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const accountId = currentUser?.$id;
    const key = instanceUrl && accountId ? blockedCacheKey(instanceUrl, accountId) : null;
    const [items, setItems] = useState<BlockedUserEntry[]>(() => {
        if (key) {
            const cached = blockedCache.get(key);
            if (cached && Date.now() - cached.cachedAt < BLOCKED_CACHE_TTL) {
                return cached.data;
            }
        }
        return [];
    });
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!instanceUrl || !accessToken || !accountId) {
            setItems([]);
            return;
        }

        const cacheKey = blockedCacheKey(instanceUrl, accountId);
        setLoading(true);
        setError(null);
        try {
            const res = await fetchBlockedUsers(instanceUrl, accessToken);
            const data = res.items ?? [];
            blockedCache.set(cacheKey, { data, cachedAt: Date.now() });
            setItems(data);
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load blocked users",
            );
        } finally {
            setLoading(false);
        }
    }, [accessToken, accountId, instanceUrl]);

    useEffect(() => {
        if (key) {
            const cached = blockedCache.get(key);
            if (cached && Date.now() - cached.cachedAt < BLOCKED_CACHE_TTL) {
                return;
            }
        }
        void refetch();
    }, [key, refetch]);

    const unblock = useCallback(
        async (userId: string) => {
            if (!instanceUrl || !accessToken || !accountId) return false;
            setActionLoading(userId);
            setError(null);
            try {
                await unblockUser(instanceUrl, accessToken, userId);
                await refetch();
                return true;
            } catch (unblockError) {
                setError(
                    unblockError instanceof Error
                        ? unblockError.message
                        : "Failed to unblock user",
                );
                return false;
            } finally {
                setActionLoading(null);
            }
        },
        [accessToken, accountId, instanceUrl, refetch],
    );

    return {
        items,
        loading,
        actionLoading,
        error,
        refetch,
        unblock,
    };
}
