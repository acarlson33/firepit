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

/**
 * Hook to subscribe to real-time status updates for multiple users
 */
export function useStatusSubscription(userIds: string[], enabled = true) {
    const [statuses, setStatuses] = useState<StatusMap>(new Map());
    const [loading, setLoading] = useState(true);
    const enabledRef = useRef(enabled);
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
            setStatuses(new Map());
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

                setStatuses(statusMap);
            }
        } catch (error) {
            logger.error("Failed to fetch statuses", toError(error));
        } finally {
            setLoading(false);
        }
    }, [normalizedUserIds]);

    useEffect(() => {
        void fetchStatuses();
    }, [fetchStatuses]);

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
                            "Status subscription handler failed",
                            toError(err),
                            { error: toErrorMessage(err) },
                        );
                    }
                };

                // Keep a query filter so status updates are scoped to tracked users.
                const subscription: RealtimeSubscription =
                    await realtime.subscribe(channel, handleStatusEvent, [
                        Query.equal("userId", normalizedUserIds),
                    ]);

                if (cancelled) {
                    await closeSubscriptionSafely(subscription);
                    return;
                }

                const untrack = trackSubscription(channelKey);
                cleanup = () => {
                    untrack();
                    closeSubscriptionSafely(subscription).catch((error) => {
                        logger.warn("Status subscription cleanup failed", {
                            error: toErrorMessage(error),
                        });
                    });
                };
            } catch (err) {
                if (isTransientRealtimeSubscribeError(err)) {
                    logger.warn("Status realtime subscription interrupted during connection setup", {
                        error: toErrorMessage(err),
                    });
                    return;
                }

                logger.error("Status subscription failed", toError(err), {
                    error: toErrorMessage(err),
                });
            }
        })().catch((err: unknown) => {
            logger.error("Status subscription setup failed", toError(err));
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [normalizedUserIds]);

    return {
        statuses,
        loading,
        refresh: fetchStatuses,
    };
}
