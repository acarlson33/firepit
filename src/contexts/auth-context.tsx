"use client";

import { Channel } from "appwrite";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import posthog from "posthog-js";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";
import type { UserStatus } from "@/lib/types";
import {
    getUserStatus,
    setUserStatus as setUserStatusAPI,
} from "@/lib/appwrite-status";
import { normalizeStatus } from "@/lib/status-normalization";
import {
    getSharedRealtime,
    resetSharedClient,
    trackSubscription,
} from "@/lib/realtime-pool";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";

const env = getEnvConfig();

type UserData = {
    userId: string;
    name: string;
    email: string;
    roles: {
        isAdmin: boolean;
        isModerator: boolean;
    };
};

type AuthContextType = {
    userData: UserData | null;
    userStatus: UserStatus | null;
    loading: boolean;
    refreshUser: () => Promise<void>;
    setUserData: (data: UserData | null) => void;
    setUserStatusState: (status: UserStatus | null) => void;
    updateUserStatus: (
        status: "online" | "away" | "busy" | "offline",
        customMessage?: string,
        expiresAt?: string,
    ) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [userData, setUserData] = useState<UserData | null>(null);
    const [userStatus, setUserStatusState] = useState<UserStatus | null>(null);
    const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(
        null,
    );
    const [loading, setLoading] = useState(true);
    const lastIdentifiedUserId = useRef<string | null>(null);
    const realtimeUserIdRef = useRef<string | null>(null);
    const realtimeResetPromiseRef = useRef<Promise<void> | null>(null);

    const queueRealtimeReset = useCallback(() => {
        const previousReset =
            realtimeResetPromiseRef.current ?? Promise.resolve();
        const nextReset = previousReset
            .catch(() => {
                // Continue with the latest reset attempt even if an earlier one failed.
            })
            .then(async () => {
                await resetSharedClient();
            });

        const trackedReset = nextReset.finally(() => {
            if (realtimeResetPromiseRef.current === trackedReset) {
                realtimeResetPromiseRef.current = null;
            }
        });

        realtimeResetPromiseRef.current = trackedReset;
        return trackedReset;
    }, []);

    const waitForRealtimeReset = useCallback(async () => {
        const pendingReset = realtimeResetPromiseRef.current;
        if (!pendingReset) {
            return;
        }

        try {
            await pendingReset;
        } catch (error) {
            logger.error(
                "Realtime reset failed",
                error instanceof Error ? error : String(error),
            );
        }
    }, []);

    const fetchUserData = useCallback(async () => {
        try {
            const res = await fetch("/api/me");

            // If not authorized, clear state and redirect users to the home page
            // only when they are not currently on an auth page (login/register).
            if (res.status === 401) {
                // Clear user state on 401; navigation should be handled by middleware
                // or by the calling UI to avoid interfering with auth flows (e.g. the
                // user trying to navigate from home -> /login). This avoids races
                // caused by concurrent client-side navigation.
                await queueRealtimeReset();
                setUserData(null);
                setUserStatusState(null);
                setTelemetryEnabled(null);
                return;
            }

            if (res.ok) {
                const data = (await res.json()) as UserData;
                setUserData(data);

                // Fetch user status
                if (data.userId) {
                    const status = await getUserStatus(data.userId);
                    if (status) {
                        setUserStatusState(status);
                    }
                }
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [queueRealtimeReset]);

    useEffect(() => {
        void fetchUserData();
    }, [fetchUserData]);

    // Realtime state should not be shared between different authenticated users.
    useEffect(() => {
        const currentUserId = userData?.userId ?? null;
        const previousUserId = realtimeUserIdRef.current;

        if (previousUserId && previousUserId !== currentUserId) {
            queueRealtimeReset().catch((error) => {
                logger.warn("Failed to reset realtime client after user swap", {
                    previousUserId,
                    currentUserId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            });
        }

        realtimeUserIdRef.current = currentUserId;
    }, [queueRealtimeReset, userData?.userId]);

    useEffect(() => {
        if (!userData?.userId) {
            setTelemetryEnabled(null);
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch("/api/me/preferences", {
                    credentials: "include",
                });

                if (!response.ok) {
                    if (!cancelled) {
                        setTelemetryEnabled(true);
                    }
                    return;
                }

                const data = (await response.json()) as {
                    telemetryEnabled?: boolean;
                };

                if (!cancelled) {
                    setTelemetryEnabled(data.telemetryEnabled ?? true);
                }
            } catch {
                if (!cancelled) {
                    setTelemetryEnabled(true);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [userData?.userId]);

    useEffect(() => {
        if (telemetryEnabled === null) {
            return;
        }

        if (telemetryEnabled) {
            posthog.opt_in_capturing();
            return;
        }

        posthog.opt_out_capturing();
    }, [telemetryEnabled]);

    useEffect(() => {
        if (!userData?.userId) {
            lastIdentifiedUserId.current = null;
            return;
        }

        if (telemetryEnabled !== true) {
            return;
        }

        // Use Appwrite user ID as the PostHog distinct ID for cross-client/server consistency.
        const shouldReidentify =
            lastIdentifiedUserId.current !== userData.userId;
        if (!shouldReidentify) {
            return;
        }

        posthog.identify(userData.userId, {
            appwriteUserId: userData.userId,
            email: userData.email,
            username: userData.name,
        });

        lastIdentifiedUserId.current = userData.userId;
    }, [telemetryEnabled, userData]);

    // Subscribe to real-time status updates for this user
    // Defer subscription to avoid blocking initial render
    useEffect(() => {
        if (!userData?.userId) {
            return;
        }

        const statusesCollection = env.collections.statuses;
        if (!statusesCollection) {
            return;
        }

        let cleanup: (() => void) | undefined;
        let cancelled = false;

        // Defer subscription setup to after initial render (5 second delay)
        // This prevents real-time connections from blocking the critical render path
        const timeoutId = setTimeout(() => {
            void (async () => {
                try {
                    if (cancelled) {
                        return;
                    }

                    await waitForRealtimeReset();
                    if (cancelled) {
                        return;
                    }

                    const realtime = getSharedRealtime();
                    const activeUserId = realtimeUserIdRef.current;
                    if (!activeUserId) {
                        return;
                    }

                    const channel = Channel.database(env.databaseId)
                        .collection(statusesCollection)
                        .document(activeUserId);
                    const channelKey = channel.toString();

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
                                const statusUserId = payload.userId as
                                    | string
                                    | undefined;

                                // Only update if this is our user's status
                                if (
                                    statusUserId &&
                                    statusUserId === realtimeUserIdRef.current
                                ) {
                                    const { normalized } =
                                        normalizeStatus(payload);
                                    setUserStatusState(normalized);
                                }
                            } catch (err) {
                                logger.error(
                                    "Status subscription handler failed:",
                                    err instanceof Error ? err : String(err),
                                );
                            }
                        },
                    );

                    const untrack = trackSubscription(channelKey);

                    if (cancelled) {
                        untrack();
                        void closeSubscriptionSafely(subscription);
                        return;
                    }

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
        }, 5000); // Defer for 5 seconds to prioritize initial page load

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            cleanup?.();
        };
    }, [userData?.userId, waitForRealtimeReset]);

    const updateUserStatus = useCallback(
        async (
            status: "online" | "away" | "busy" | "offline",
            customMessage?: string,
            expiresAt?: string,
        ) => {
            if (!userData?.userId) {
                return;
            }

            try {
                // isManuallySet=true because user explicitly changed status
                await setUserStatusAPI(
                    userData.userId,
                    status,
                    customMessage,
                    expiresAt,
                    true,
                );
                const newStatus = await getUserStatus(userData.userId);
                if (newStatus) {
                    setUserStatusState(newStatus);
                }
            } catch (err) {
                if (process.env.NODE_ENV === "development") {
                    logger.error(
                        "Failed to change status:",
                        err instanceof Error ? err : String(err),
                    );
                } else {
                    logger.warn("Failed to change status", {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        },
        [userData?.userId],
    );

    const value = useMemo<AuthContextType>(
        () => ({
            userData,
            userStatus,
            loading,
            refreshUser: fetchUserData,
            setUserData,
            setUserStatusState,
            updateUserStatus,
        }),
        [userData, userStatus, loading, fetchUserData, updateUserStatus],
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
