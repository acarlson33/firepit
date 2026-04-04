"use client";

import { Channel, Query } from "appwrite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";
import { withSuppressedRealtimeCloseErrors } from "@/lib/realtime-error-suppression";
import type { UserStatus } from "@/lib/types";
import { normalizeStatus, type StatusLike } from "@/lib/status-normalization";
import { getSharedRealtime, trackSubscription } from "@/lib/realtime-pool";

const env = getEnvConfig();
const STATUSES_COLLECTION = env.collections.statuses;

type StatusMap = Map<string, UserStatus>;
type RealtimeSubscription = {
    close: () => Promise<void>;
};

function isUnsupportedQueryRealtimeError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as {
        code?: number;
        message?: string;
        name?: string;
        type?: string;
    };

    const name = (candidate.name ?? "").toLowerCase();
    const type = (candidate.type ?? "").toLowerCase();
    const message = (candidate.message ?? "").toLowerCase();

    if (name.includes("unsupportedquery") || type.includes("unsupported")) {
        return true;
    }

    if (candidate.code === 400 || candidate.code === 422) {
        return message.includes("query") && message.includes("unsupported");
    }

    return false;
}

async function closeSubscriptionSafely(
    subscription?: RealtimeSubscription,
): Promise<void> {
    if (!subscription) {
        return;
    }

    try {
        await withSuppressedRealtimeCloseErrors(async () =>
            subscription.close(),
        );
    } catch {
        // Ignore teardown errors when websocket is already disconnected.
    }
}

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

                const trackedIds = [...trackedUserIds].filter(
                    (id) => typeof id === "string" && id.length > 0,
                );
                if (trackedIds.length === 0) {
                    return;
                }

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
                        if (process.env.NODE_ENV !== "production") {
                            logger.error(
                                "Status subscription handler failed:",
                                err instanceof Error ? err : String(err),
                            );
                        }
                    }
                };

                let subscription: RealtimeSubscription;
                try {
                    subscription = await realtime.subscribe(
                        channel,
                        handleStatusEvent,
                        [Query.equal("userId", trackedIds)],
                    );
                } catch (queryError) {
                    if (cancelled) {
                        return;
                    }

                    if (!isUnsupportedQueryRealtimeError(queryError)) {
                        throw queryError;
                    }

                    const fallbackError =
                        queryError instanceof Error
                            ? queryError
                            : String(queryError);

                    if (process.env.NODE_ENV !== "production") {
                        logger.warn(
                            "Status subscription query failed; retrying without query filter",
                            {
                                trackedCount: trackedIds.length,
                            },
                        );
                    }

                    logger.error(
                        "Status subscription degraded to unfiltered fallback",
                        fallbackError,
                        {
                            trackedCount: trackedIds.length,
                        },
                    );

                    subscription = await realtime.subscribe(
                        channel,
                        handleStatusEvent,
                    );
                }

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
