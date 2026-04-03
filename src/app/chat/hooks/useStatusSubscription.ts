"use client";

import { Channel, Query } from "appwrite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";
import type { UserStatus } from "@/lib/types";
import { normalizeStatus, type StatusLike } from "@/lib/status-normalization";
import { getSharedRealtime, trackSubscription } from "@/lib/realtime-pool";

const env = getEnvConfig();
const STATUSES_COLLECTION = env.collections.statuses;

type StatusMap = Map<string, UserStatus>;

/**
 * Hook to subscribe to real-time status updates for multiple users
 */
export function useStatusSubscription(userIds: string[]) {
    const [statuses, setStatuses] = useState<StatusMap>(new Map());
    const [loading, setLoading] = useState(true);
    const trackedUserIds = useMemo(() => new Set(userIds), [userIds]);
    const userIdsKey = userIds.join(",");

    // Fetch initial statuses
    const fetchStatuses = useCallback(async () => {
        if (!STATUSES_COLLECTION || userIds.length === 0) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await fetch("/api/status/batch", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ userIds }),
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
    }, [userIdsKey]); // Only re-fetch when user IDs change

    useEffect(() => {
        void fetchStatuses();
    }, [fetchStatuses]);

    // Real-time subscription to status updates
    useEffect(() => {
        if (!STATUSES_COLLECTION || userIds.length === 0) {
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

                const trackedIds = [...trackedUserIds];
                const subscription = await realtime.subscribe(
                    channel,
                    (response) => {
                        try {
                            const payload = response.payload as
                                | Record<string, unknown>
                                | null
                                | undefined;
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
                            if (process.env.NODE_ENV !== "production") {
                                logger.error(
                                    "Status subscription handler failed:",
                                    err instanceof Error ? err : String(err),
                                );
                            }
                        }
                    },
                    [Query.equal("userId", trackedIds)],
                );
                if (cancelled) {
                    void subscription.close();
                    return;
                }
                const untrack = trackSubscription(channelKey);
                cleanup = () => {
                    untrack();
                    void subscription.close();
                };
            } catch (err) {
                if (process.env.NODE_ENV !== "production") {
                    logger.error(
                        "Status subscription failed:",
                        err instanceof Error ? err : String(err),
                    );
                }
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [trackedUserIds, userIdsKey]); // Re-subscribe when user IDs change

    return {
        statuses,
        loading,
        refresh: fetchStatuses,
    };
}
