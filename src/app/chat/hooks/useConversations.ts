"use client";

import { Channel, Query } from "appwrite";
import { useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getEnvConfig } from "@/lib/appwrite-core";
import { listConversations } from "@/lib/appwrite-dms-client";
import { getSharedRealtime, trackSubscription } from "@/lib/realtime-pool";

import { useStatusSubscription } from "./useStatusSubscription";

const env = getEnvConfig();
const CONVERSATIONS_COLLECTION = env.collections.conversations;

function getConversationsQueryKey(userId: string | null) {
    return ["conversations", userId] as const;
}

export function useConversations(userId: string | null, enabled = true) {
    const queryClient = useQueryClient();
    const isEnabled =
        enabled && Boolean(userId) && Boolean(CONVERSATIONS_COLLECTION);

    const loadConversations = useCallback(async () => {
        if (!userId || !CONVERSATIONS_COLLECTION) {
            return;
        }

        return listConversations(userId);
    }, [userId]);

    const {
        data: conversations = [],
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: getConversationsQueryKey(userId),
        queryFn: async () => (await loadConversations()) ?? [],
        enabled: isEnabled,
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    // Get all other user IDs from conversations
    const otherUserIds = useMemo(() => {
        if (!isEnabled) {
            return [] as string[];
        }

        return conversations
            .filter((conv) => !conv.isGroup)
            .map((conv) => conv.participants.find((id) => id !== userId))
            .filter((id): id is string => id !== undefined);
    }, [conversations, isEnabled, userId]);

    // Subscribe to status updates for all other users
    const { statuses } = useStatusSubscription(otherUserIds);

    // Merge real-time status updates into conversations
    const conversationsWithStatus = useMemo(() => {
        return conversations.map((conv) => {
            if (conv.isGroup) {
                return conv;
            }

            const otherUserId = conv.participants.find((id) => id !== userId);
            if (!otherUserId) {
                return conv;
            }

            const liveStatus = statuses.get(otherUserId);

            if (liveStatus) {
                const baseOtherUser = conv.otherUser ?? { userId: otherUserId };
                return {
                    ...conv,
                    otherUser: {
                        ...baseOtherUser,
                        status: liveStatus.status,
                    },
                };
            }

            return conv;
        });
    }, [conversations, statuses, userId]);

    // Real-time subscription to conversation changes
    useEffect(() => {
        if (!isEnabled || !userId || !CONVERSATIONS_COLLECTION) {
            return;
        }

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;

        const conversationChannel = Channel.database(env.databaseId)
            .collection(CONVERSATIONS_COLLECTION)
            .document();
        const conversationChannelKey = conversationChannel.toString();

        void Promise.resolve().then(async () => {
            if (cancelled) {
                return;
            }

            const realtime = getSharedRealtime();
            const subscription = await realtime.subscribe(
                conversationChannel,
                (response) => {
                    const payload = response.payload as Record<string, unknown>;
                    const participants = payload.participants as
                        | string[]
                        | undefined;

                    if (!participants?.includes(userId)) {
                        return;
                    }

                    void queryClient.invalidateQueries({
                        queryKey: getConversationsQueryKey(userId),
                        refetchType: "active",
                    });
                },
                [Query.contains("participants", userId)],
            );
            const untrack = trackSubscription(conversationChannelKey);

            cleanupFn = () => {
                untrack();
                void subscription.close();
            };
        });

        return () => {
            cancelled = true;
            cleanupFn?.();
        };
    }, [isEnabled, queryClient, userId]);

    return {
        conversations: conversationsWithStatus,
        loading: isEnabled ? isLoading : false,
        error:
            error instanceof Error
                ? error.message
                : error
                  ? "Failed to load conversations"
                  : null,
        refresh: refetch,
    };
}
