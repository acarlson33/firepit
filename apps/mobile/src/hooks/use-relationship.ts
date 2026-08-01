import { useCallback, useEffect, useState } from "react";
import {
    fetchRelationship,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriendship,
    blockUser,
    unblockUser,
} from "@/lib/firepit/messages";
import type { RelationshipStatus } from "@/lib/firepit/types";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

const RELATIONSHIP_CACHE_TTL = 30_000;
const relationshipCache = new Map<string, { data: RelationshipStatus | null; cachedAt: number }>();

function invalidateRelationshipCache(targetUserId: string) {
    relationshipCache.delete(targetUserId);
}

export function useRelationship(targetUserId: string | null) {
    const { instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;
    const isSelf = Boolean(
        currentUserId && targetUserId && currentUserId === targetUserId,
    );
    const [relationship, setRelationship] = useState<RelationshipStatus | null>(() => {
        if (targetUserId) {
            const cached = relationshipCache.get(targetUserId);
            if (cached && Date.now() - cached.cachedAt < RELATIONSHIP_CACHE_TTL) {
                return cached.data;
            }
        }
        return null;
    });
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (
            !targetUserId ||
            !currentUserId ||
            isSelf ||
            !instanceUrl ||
            !accessToken
        ) {
            setRelationship(null);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetchRelationship(
                instanceUrl,
                accessToken,
                targetUserId,
            );
            const data = res.relationship ?? null;
            relationshipCache.set(targetUserId, { data, cachedAt: Date.now() });
            setRelationship(data);
        } catch (fetchError) {
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Failed to load relationship",
            );
        } finally {
            setLoading(false);
        }
    }, [accessToken, currentUserId, instanceUrl, isSelf, targetUserId]);

    useEffect(() => {
        if (targetUserId) {
            const cached = relationshipCache.get(targetUserId);
            if (cached && Date.now() - cached.cachedAt < RELATIONSHIP_CACHE_TTL) {
                return;
            }
        }
        void refetch();
    }, [refetch, targetUserId]);

    const runMutation = useCallback(
        async (
            fn: () => Promise<{ success?: boolean }>,
        ): Promise<boolean> => {
            if (!instanceUrl || !accessToken) return false;
            setActionLoading(true);
            setError(null);
            try {
                await fn();
                if (targetUserId) invalidateRelationshipCache(targetUserId);
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
        [accessToken, instanceUrl, refetch, targetUserId],
    );

    return {
        relationship,
        loading,
        actionLoading,
        error,
        isSelf,
        refetch,
        sendFriendRequest: () =>
            targetUserId && instanceUrl && accessToken
                ? runMutation(() =>
                      sendFriendRequest(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
        acceptFriendRequest: () =>
            targetUserId && instanceUrl && accessToken
                ? runMutation(() =>
                      acceptFriendRequest(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
        declineFriendRequest: () =>
            targetUserId && instanceUrl && accessToken
                ? runMutation(() =>
                      declineFriendRequest(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
        removeFriendship: () =>
            targetUserId && instanceUrl && accessToken
                ? runMutation(() =>
                      removeFriendship(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
        blockUser: (reason?: string) =>
            targetUserId && instanceUrl && accessToken
                ? runMutation(() =>
                      blockUser(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                          reason,
                      ),
                  )
                : Promise.resolve(false),
        unblockUser: () =>
            targetUserId && instanceUrl && accessToken
                ? runMutation(() =>
                      unblockUser(
                          instanceUrl,
                          accessToken,
                          targetUserId,
                      ),
                  )
                : Promise.resolve(false),
    };
}
