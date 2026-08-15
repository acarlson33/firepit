"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockedUser } from "@/lib/types";

type BlockedUsersEntry = {
    block: BlockedUser;
    user: {
        userId: string;
        displayName?: string;
        pronouns?: string;
        avatarUrl?: string;
    };
};

export function useBlockedUsers() {
    const [items, setItems] = useState<BlockedUsersEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    const refetch = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/users/blocked");
            const data = (await response.json()) as {
                items?: BlockedUsersEntry[];
                error?: string;
            };
            if (!response.ok) {
                throw new Error(data.error || "Failed to load blocked users");
            }
            if (requestIdRef.current !== requestId) {
                return;
            }
            setItems(data.items ?? []);
        } catch (fetchError) {
            if (requestIdRef.current !== requestId) {
                return;
            }
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load blocked users",
            );
        } finally {
            if (requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        refetch();
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
