import { useCallback, useEffect, useState } from "react";
import {
    fetchBlockedUsers,
    unblockUser,
} from "@/lib/firepit/messages";
import type { BlockedUserEntry } from "@/lib/firepit/types";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

const BLOCKED_CACHE_TTL = 30_000;
let blockedCache: { data: BlockedUserEntry[]; cachedAt: number } | null = null;

export function useBlockedUsers() {
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const [items, setItems] = useState<BlockedUserEntry[]>(() => {
        if (blockedCache && Date.now() - blockedCache.cachedAt < BLOCKED_CACHE_TTL) {
            return blockedCache.data;
        }
        return [];
    });
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!instanceUrl || !accessToken) {
            setItems([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetchBlockedUsers(instanceUrl, accessToken);
            const data = res.items ?? [];
            blockedCache = { data, cachedAt: Date.now() };
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
    }, [accessToken, instanceUrl]);

    useEffect(() => {
        if (blockedCache && Date.now() - blockedCache.cachedAt < BLOCKED_CACHE_TTL) {
            return;
        }
        void refetch();
    }, [refetch]);

    const unblock = useCallback(
        async (userId: string) => {
            if (!instanceUrl || !accessToken) return false;
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
        [accessToken, instanceUrl, refetch],
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
