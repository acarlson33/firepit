"use client";

import { Channel, Query } from "appwrite";
import { useEffect, useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getEnvConfig } from "@/lib/appwrite-core";
import { listConversations } from "@/lib/appwrite-dms-client";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";
import {
    getSharedRealtime,
    isTransientRealtimeSubscribeError,
    trackSubscription,
} from "@/lib/realtime-pool";

import { useStatusSubscription } from "./useStatusSubscription";

const env = getEnvConfig();
const CONVERSATIONS_COLLECTION = env.collections.conversations;
const MAX_RETRIES = 5;

function toError(value: unknown) {
    return value instanceof Error ? value : new Error(String(value));
}

function toErrorMessage(value: unknown) {
    return value instanceof Error ? value.message : String(value);
}

function formatConversationsError(error: unknown) {
    if (!error) {
        return null;
    }

    return toErrorMessage(error);
}

function getConversationsQueryKey(userId: string | null) {
    return ["conversations", userId] as const;
}

export function useConversations(userId: string | null, enabled = true) {
    const queryClient = useQueryClient();
    const isEnabled =
        enabled && Boolean(userId) && Boolean(CONVERSATIONS_COLLECTION);
    const [realtimeRetryNonce, setRealtimeRetryNonce] = useState(0);

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
        let pendingTimeouts: NodeJS.Timeout[] = [];

        const conversationChannel = Channel.database(env.databaseId)
            .collection(CONVERSATIONS_COLLECTION)
            .document();
        const conversationChannelKey = conversationChannel.toString();

        const subscriptionTask = (async () => {
            if (cancelled) {
                return;
            }

            try {
                const realtime = getSharedRealtime();
                const subscription = await realtime.subscribe(
                    conversationChannel,
                    (response) => {
                        const payload = response.payload as Record<
                            string,
                            unknown
                        >;
                        const participants = payload.participants as
                            | string[]
                            | undefined;

                        if (!participants?.includes(userId)) {
                            return;
                        }

                        queryClient
                            .invalidateQueries({
                                queryKey: getConversationsQueryKey(userId),
                                refetchType: "active",
                            })
                            .catch((invalidateError) => {
                                logger.warn(
                                    "Failed to refresh conversations after realtime event",
                                    {
                                        conversationChannelKey,
                                        error: toErrorMessage(invalidateError),
                                    },
                                );
                            });
                    },
                            [Query.contains("participants", userId)],
                );

                if (cancelled) {
                    await closeSubscriptionSafely(subscription);
                    return;
                }

                const untrack = trackSubscription(conversationChannelKey);
                cleanupFn = () => {
                    untrack();
                    closeSubscriptionSafely(subscription).catch((error) => {
                        logger.warn(
                            "Conversation subscription cleanup failed",
                            {
                                conversationChannelKey,
                                error: toErrorMessage(error),
                            },
                        );
                    });
                };
            } catch (realtimeError) {
                if (cancelled) {
                    return;
                }

                const isTransient = isTransientRealtimeSubscribeError(realtimeError);
                const retryDelayMs = isTransient ? 1200 : 4000;

                if (realtimeRetryNonce >= MAX_RETRIES) {
                    logger.error(
                        "Conversation realtime subscription max retries reached",
                        toError(realtimeError),
                        {
                            collectionId: CONVERSATIONS_COLLECTION,
                            conversationChannelKey,
                            databaseId: env.databaseId,
                            attempts: realtimeRetryNonce,
                        },
                    );
                    return;
                }

                if (isTransient) {
                    logger.warn(
                        "Conversation realtime subscription interrupted during connection setup",
                        {
                            collectionId: CONVERSATIONS_COLLECTION,
                            conversationChannelKey,
                            databaseId: env.databaseId,
                            error: toErrorMessage(realtimeError),
                            retryDelayMs,
                            attempts: realtimeRetryNonce,
                        },
                    );
                } else {
                    logger.error(
                        "Conversation realtime subscription failed",
                        toError(realtimeError),
                        {
                            collectionId: CONVERSATIONS_COLLECTION,
                            conversationChannelKey,
                            databaseId: env.databaseId,
                            retryDelayMs,
                            attempts: realtimeRetryNonce,
                        },
                    );
                }

                const timeoutId = setTimeout(() => {
                    setRealtimeRetryNonce((current) => current + 1);
                }, retryDelayMs);

                pendingTimeouts.push(timeoutId);
            }
        })();
        subscriptionTask.catch((error) => {
            logger.warn("Conversation subscription task failed", {
                error: toErrorMessage(error),
                conversationChannelKey,
            });
        });

        return () => {
            cancelled = true;
            for (const timeout of pendingTimeouts) {
                clearTimeout(timeout);
            }
            cleanupFn?.();
        };
    }, [isEnabled, queryClient, userId, realtimeRetryNonce]);

    return {
        conversations: conversationsWithStatus,
        loading: isEnabled ? isLoading : false,
        error: formatConversationsError(error),
        refresh: refetch,
    };
}
