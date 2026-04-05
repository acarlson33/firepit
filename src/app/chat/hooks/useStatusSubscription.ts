"use client";

import { Channel, Query } from "appwrite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";
import type { UserStatus } from "@/lib/types";
import { normalizeStatus, type StatusLike } from "@/lib/status-normalization";
import { getSharedRealtime, trackSubscription } from "@/lib/realtime-pool";

const env = getEnvConfig();
const STATUSES_COLLECTION = env.collections.statuses;

type StatusMap = Map<string, UserStatus>;
type RealtimeSubscription = {
    close: () => Promise<void>;
};

/**
 * Hook to subscribe to real-time status updates for multiple users
 */
export function useStatusSubscription(userIds: string[]) {
    const [statuses, setStatuses] = useState<StatusMap>(new Map());
    const [loading, setLoading] = useState(true);
    const stableUserIds = useMemo(() => {
        return Array.from(
            new Set(
                userIds.filter(
                    (id): id is string =>
                        typeof id === "string" && id.length > 0,
                ),
            ),
        ).sort((a, b) => a.localeCompare(b));
    }, [userIds]);

    const trackedUserIds = useMemo(
        () => new Set(stableUserIds),
        [stableUserIds],
    );

    // Fetch initial statuses
    const fetchStatuses = useCallback(async () => {
        if (!STATUSES_COLLECTION || trackedUserIds.size === 0) {
            setStatuses(new Map());
            setLoading(false);
            return;
        }

        const requestedUserIds = [...trackedUserIds];

        try {
            setLoading(true);
            const response = await fetch("/api/status/batch", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ userIds: requestedUserIds }),
            });

            if (response.ok) {
                const data = await response.json();
                const statusMap = new Map<string, UserStatus>();

                // data.statuses is a Record<userId, UserStatus>
                if (data.statuses) {
                    const statuses = data.statuses as Record<
                        string,
                        StatusLike | undefined
                    >;
                    for (const [userId, status] of Object.entries(statuses)) {
                        if (!status) {
                            continue;
                        }
                        const { normalized } = normalizeStatus(status);
                        statusMap.set(userId, normalized);
                    }
                }

                setStatuses(statusMap);
            }
        } catch (error) {
            logger.error(
                "Failed to fetch statuses:",
                error instanceof Error ? error : String(error),
            );
        } finally {
            setLoading(false);
        }
    }, [trackedUserIds]); // Only re-fetch when user IDs change

    useEffect(() => {
        void fetchStatuses();
    }, [fetchStatuses]);

    // Real-time subscription to status updates
    useEffect(() => {
        if (!STATUSES_COLLECTION || trackedUserIds.size === 0) {
            setStatuses(new Map());
            setLoading(false);
            return;
        }

        let cleanup: (() => void) | undefined;
        let cancelled = false;

        void (async () => {
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
                        const userId = payload.userId as string | undefined;

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
                            "Status subscription handler failed:",
                            err instanceof Error ? err : String(err),
                        );
                    }
                };

                // Query-filtered status subscriptions can trigger reconnect churn in
                // Use a filtered subscription to avoid receiving unrelated status events.
                const trackedIds = [...trackedUserIds];
                const subscription: RealtimeSubscription =
                    await realtime.subscribe(channel, handleStatusEvent, [
                        Query.equal("userId", trackedIds),
                    ]);

                if (cancelled) {
                    await closeSubscriptionSafely(subscription);
                    return;
                }

                const untrack = trackSubscription(channelKey);
                cleanup = () => {
                    untrack();
                    void closeSubscriptionSafely(subscription);
                };
            } catch (err) {
                logger.error(
                    "Status subscription failed:",
                    err instanceof Error ? err : String(err),
                );
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [trackedUserIds]); // Re-subscribe when user IDs change

    return {
        statuses,
        loading,
        refresh: fetchStatuses,
    };
}
