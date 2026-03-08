"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/auth-context";
import type { RelationshipStatus } from "@/lib/types";

type RelationshipResponse = {
    relationship?: RelationshipStatus;
    error?: string;
};

export function useRelationship(targetUserId: string | null) {
    const { userData } = useAuth();
    const currentUserId = userData?.userId ?? null;
    const isSelf = Boolean(currentUserId && currentUserId === targetUserId);
    const [relationship, setRelationship] = useState<RelationshipStatus | null>(
        null,
    );
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!targetUserId || !currentUserId || isSelf) {
            setRelationship(null);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch(
                `/api/users/${targetUserId}/relationship`,
            );
            const data = (await response.json()) as RelationshipResponse;

            if (!response.ok) {
                throw new Error(data.error || "Failed to load relationship");
            }

            setRelationship(data.relationship ?? null);
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load relationship",
            );
        } finally {
            setLoading(false);
        }
    }, [currentUserId, isSelf, targetUserId]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    const runMutation = useCallback(
        async (input: {
            url: string;
            method: "POST" | "DELETE";
            body?: Record<string, unknown>;
        }) => {
            setActionLoading(true);
            setError(null);
            try {
                const response = await fetch(input.url, {
                    method: input.method,
                    headers: input.body
                        ? { "Content-Type": "application/json" }
                        : undefined,
                    body: input.body ? JSON.stringify(input.body) : undefined,
                });
                const data = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };

                if (!response.ok) {
                    throw new Error(data.error || "Relationship action failed");
                }

                await refetch();
                return true;
            } catch (mutationError) {
                setError(
                    mutationError instanceof Error
                        ? mutationError.message
                        : "Relationship action failed",
                );
                return false;
            } finally {
                setActionLoading(false);
            }
        },
        [refetch],
    );

    return {
        relationship,
        loading,
        actionLoading,
        error,
        isSelf,
        refetch,
        sendFriendRequest: () =>
            targetUserId
                ? runMutation({
                      url: "/api/friends/request",
                      method: "POST",
                      body: { targetUserId },
                  })
                : Promise.resolve(false),
        acceptFriendRequest: () =>
            targetUserId
                ? runMutation({
                      url: `/api/friends/${targetUserId}/accept`,
                      method: "POST",
                  })
                : Promise.resolve(false),
        declineFriendRequest: () =>
            targetUserId
                ? runMutation({
                      url: `/api/friends/${targetUserId}/decline`,
                      method: "POST",
                  })
                : Promise.resolve(false),
        removeFriendship: () =>
            targetUserId
                ? runMutation({
                      url: `/api/friends/${targetUserId}`,
                      method: "DELETE",
                  })
                : Promise.resolve(false),
        blockUser: (reason?: string) =>
            targetUserId
                ? runMutation({
                      url: `/api/users/${targetUserId}/block`,
                      method: "POST",
                      body: reason ? { reason } : undefined,
                  })
                : Promise.resolve(false),
        unblockUser: () =>
            targetUserId
                ? runMutation({
                      url: `/api/users/${targetUserId}/block`,
                      method: "DELETE",
                  })
                : Promise.resolve(false),
    };
}
