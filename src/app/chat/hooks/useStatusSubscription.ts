"use client";

import { useEffect, useState, useCallback } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { UserStatus } from "@/lib/types";
import { normalizeStatus, type StatusLike } from "@/lib/status-normalization";

const env = getEnvConfig();
const STATUSES_COLLECTION = env.collections.statuses;

type StatusMap = Map<string, UserStatus>;

/**
 * Hook to subscribe to real-time status updates for multiple users
 */
export function useStatusSubscription(userIds: string[]) {
    const [statuses, setStatuses] = useState<StatusMap>(new Map());
    const [loading, setLoading] = useState(true);

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
            console.error("Failed to fetch statuses:", error);
        } finally {
            setLoading(false);
        }
    }, [userIds.join(",")]); // Only re-fetch when user IDs change

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
                const { Client } = await import("appwrite");
                if (cancelled) {
                    return;
                }

                const client = new Client()
                    .setEndpoint(env.endpoint)
                    .setProject(env.project);

                // Guard against Appwrite realtime throwing raw error payloads (code 1003) to the console.
                const rt = (
                    client as unknown as {
                        realtime?: {
                            onMessage?: (event: unknown) => void;
                            __wrapped?: boolean;
                        };
                    }
                ).realtime;
                if (rt?.onMessage && !rt.__wrapped) {
                    const original = rt.onMessage.bind(rt);
                    rt.onMessage = (event: unknown) => {
                        try {
                            original(event);
                        } catch (err) {
                            if (process.env.NODE_ENV !== "production") {
                                // biome-ignore lint: dev logging
                                console.warn(
                                    "Realtime status channel error (ignored):",
                                    err,
                                );
                            }
                        }
                    };
                    rt.__wrapped = true;
                }

                cleanup = client.subscribe(
                    `databases.${env.databaseId}.collections.${STATUSES_COLLECTION}.documents`,
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
                            if (userId && userIds.includes(userId)) {
                                const { normalized } = normalizeStatus(payload);

                                setStatuses((prev) => {
                                    const next = new Map(prev);
                                    next.set(userId, normalized);
                                    return next;
                                });
                            }
                        } catch (err) {
                            if (process.env.NODE_ENV !== "production") {
                                // biome-ignore lint: dev logging
                                console.error(
                                    "Status subscription handler failed:",
                                    err,
                                );
                            }
                        }
                    },
                );
            } catch (err) {
                if (process.env.NODE_ENV !== "production") {
                    // biome-ignore lint: dev logging
                    console.error("Status subscription failed:", err);
                }
            }
        })();

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [userIds.join(",")]); // Re-subscribe when user IDs change

    return {
        statuses,
        loading,
        refresh: fetchStatuses,
    };
}
