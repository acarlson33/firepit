"use client";

import { useCallback, useEffect, useState } from "react";

type BlockedUsersResponse = {
    items?: Array<{
        block: {
            $id: string;
            userId: string;
            blockedUserId: string;
            blockedAt: string;
            reason?: string;
        };
        user: {
            userId: string;
            displayName?: string;
            pronouns?: string;
            avatarUrl?: string;
        };
    }>;
    error?: string;
};

export function useBlockedUsers() {
    const [items, setItems] = useState<BlockedUsersResponse["items"]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/users/blocked");
            const data = (await response.json()) as BlockedUsersResponse;
            if (!response.ok) {
                throw new Error(data.error || "Failed to load blocked users");
            }
            setItems(data.items ?? []);
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load blocked users",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    const unblock = useCallback(
        async (userId: string) => {
            setActionLoading(userId);
            setError(null);
            try {
                const response = await fetch(`/api/users/${userId}/block`, {
                    method: "DELETE",
                });
                const data = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };

                if (!response.ok) {
                    throw new Error(data.error || "Failed to unblock user");
                }

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
        [refetch],
    );

    return {
        items: items ?? [],
        loading,
        actionLoading,
        error,
        refetch,
        unblock,
    };
}
