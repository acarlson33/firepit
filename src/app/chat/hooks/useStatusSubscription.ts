"use client";

import { Channel, Query } from "appwrite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";
import type { UserStatus } from "@/lib/types";
import { normalizeStatus } from "@/lib/status-normalization";
import type { StatusLike } from "@/lib/status-normalization";
import {
    getSharedRealtime,
    isTransientRealtimeSubscribeError,
    trackSubscription,
} from "@/lib/realtime-pool";

const env = getEnvConfig();
const STATUSES_COLLECTION = env.collections.statuses;

const toError = (value: unknown): Error =>
    value instanceof Error ? value : new Error(String(value));

const toErrorMessage = (value: unknown): string =>
    value instanceof Error ? value.message : String(value);

type StatusMap = Map<string, UserStatus>;
type RealtimeSubscription = {
    close: () => Promise<void>;
};

// Subscription shape that may support an `update` method for changing query filters
type IStatusSubscription = RealtimeSubscription & {
    update?: (args: { queries: ReturnType<typeof Query.equal>[] }) => Promise<void>;
};

/**
 * Hook to subscribe to real-time status updates for multiple users
 */
export function useStatusSubscription(userIds: string[], enabled = true) {
    const [statuses, setStatuses] = useState<StatusMap>(new Map());
    const [loading, setLoading] = useState(true);
    const enabledRef = useRef(enabled);
    const subscriptionRef = useRef<IStatusSubscription | undefined>(undefined);
    const previousUserIdsRef = useRef<string[]>([]);
    const normalizedUserIds = useMemo(
        () =>
            Array.from(new Set(userIds.filter((id) => id.length > 0))).sort(
                (a, b) => a.localeCompare(b),
            ),
        [userIds],
    );

    useEffect(() => {
        enabledRef.current = enabled;
        if (!enabled) {
            setStatuses(new Map());
            setLoading(false);
        }
    }, [enabled]);

    // Fetch initial statuses
    const fetchStatuses = useCallback(async () => {
        if (
            !enabledRef.current ||
            !STATUSES_COLLECTION ||
            normalizedUserIds.length === 0
        ) {
            // Only reset state if we actually had users before
            if (previousUserIdsRef.current.length > 0) {
                setStatuses(new Map());
                setLoading(false);
                previousUserIdsRef.current = [];
            }
            return;
        }

        try {
            setLoading(true);
            const response = await fetch("/api/status/batch", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ userIds: normalizedUserIds }),
            });

            if (response.ok) {
                const data = await response.json();
                const statusMap = new Map<string, UserStatus>();

                // data.statuses is a Record<userId, UserStatus>
                if (data.statuses) {
                    const responseStatuses = data.statuses as Record<
                        string,
                        StatusLike | undefined
                    >;
                    for (const [userId, status] of Object.entries(
                        responseStatuses,
                    )) {
                        if (!status) {
                            continue;
                        }
                        const { normalized } = normalizeStatus(status);
                        statusMap.set(userId, normalized);
                    }
                }

                if (!enabledRef.current) {
                    return;
                }

                previousUserIdsRef.current = normalizedUserIds;
                setStatuses(statusMap);
            }
        } catch (error) {
            logger.error("Failed to fetch statuses", toError(error));
        } finally {
            if (enabledRef.current) {
                setLoading(false);
            }
        }
    }, [normalizedUserIds]);

    // Fetch statuses when normalized user IDs change
    useEffect(() => {
        // Only fetch if the user IDs actually changed
        if (
            previousUserIdsRef.current.length !== normalizedUserIds.length ||
            !previousUserIdsRef.current.every(
                (id, idx) => id === normalizedUserIds[idx],
            )
        ) {
            fetchStatuses().catch((error) => {
                logger.warn("Failed to fetch statuses", {
                    error: toErrorMessage(error),
                });
            });
        }
    }, [normalizedUserIds, fetchStatuses]);

    // Real-time subscription to status updates
    useEffect(() => {
        if (
            !enabledRef.current ||
            !STATUSES_COLLECTION ||
            normalizedUserIds.length === 0
        ) {
            return;
        }

        const trackedUserIds = new Set(normalizedUserIds);

        let cleanup: (() => void) | undefined;
        let cancelled = false;
        const timeoutId = setTimeout(() => {
            (async () => {
                try {
                    if (cancelled) {
                        return;
                    }

                    const realtime = getSharedRealtime();
                    const channel = Channel.database(env.databaseId)
                        .collection(STATUSES_COLLECTION)
                        .document();
                    const channelKey = channel.toString();

                    const handleStatusEvent = (response: {
                        payload?: Record<string, unknown> | null;
                    }) => {
                        try {
                            const payload = response.payload;
                            if (!payload) {
                                return;
                            }
                            const userId = payload.userId as
                                | string
                                | undefined;

                            // Only update if this status is for one of our tracked users
                            if (userId && trackedUserIds.has(userId)) {
                                const { normalized } = normalizeStatus(payload);

                                setStatuses((prev) => {
                                    const next = new Map(prev);
                                    next.set(userId, normalized);
                                    return next;
                                });
                            }
                        } catch (err) {
                            logger.error(
                                "Status subscription handler failed",
                                toError(err),
                                { error: toErrorMessage(err) },
                            );
                        }
                    };

                    // Keep a query filter so status updates are scoped to tracked users.
                    // Try updating existing subscription if supported
                    const existing = subscriptionRef.current;
                    if (typeof existing?.update === "function") {
                        try {
                            await existing.update({
                                queries: [Query.equal("userId", normalizedUserIds)],
                            });
                            return;
                        } catch {
                            // Close the old subscription before recreating to avoid leaks
                            if (existing && typeof existing.close === "function") {
                                try {
                                    await existing.close();
                                } catch {
                                    // Ignore close errors
                                }
                            }
                        }
                    }

                    const subscription: RealtimeSubscription =
                        await realtime.subscribe(channel, handleStatusEvent, [
                            Query.equal("userId", normalizedUserIds),
                        ]);

                    subscriptionRef.current = subscription;

                    if (cancelled) {
                        await closeSubscriptionSafely(subscriptionRef.current);
                        subscriptionRef.current = undefined;
                        return;
                    }

                    const untrack = trackSubscription(channelKey);
                    cleanup = () => {
                        untrack();
                        closeSubscriptionSafely(subscriptionRef.current).catch(
                            (error) => {
                                logger.warn(
                                    "Status subscription cleanup failed",
                                    {
                                        error: toErrorMessage(error),
                                    },
                                );
                            },
                        );
                        subscriptionRef.current = undefined;
                    };
                } catch (err) {
                    if (isTransientRealtimeSubscribeError(err)) {
                        logger.warn(
                            "Status realtime subscription interrupted during connection setup",
                            {
                                error: toErrorMessage(err),
                            },
                        );
                        return;
                    }

                    logger.error("Status subscription failed", toError(err), {
                        error: toErrorMessage(err),
                    });
                }
            })().catch((err: unknown) => {
                logger.error("Status subscription setup failed", toError(err));
            });
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            cleanup?.();
        };
    }, [enabled, normalizedUserIds]);

    return {
        statuses,
        loading,
        refresh: fetchStatuses,
    };
}
