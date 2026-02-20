"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getEnvConfig } from "@/lib/appwrite-core"; 
import type { UserStatus } from "@/lib/types";
import {
    getUserStatus,
    setUserStatus as setUserStatusAPI,
} from "@/lib/appwrite-status";
import { normalizeStatus } from "@/lib/status-normalization";

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
  const [loading, setLoading] = useState(true);


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
        setUserData(null);
        setUserStatusState(null);
        return;
      }

      if (res.ok) {
        const data = await res.json() as UserData;
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
  }, []);

    useEffect(() => {
        void fetchUserData();
    }, [fetchUserData]);

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
                    const { Client } = await import("appwrite");
                    if (cancelled) {
                        return;
                    }

                    const client = new Client()
                        .setEndpoint(env.endpoint)
                        .setProject(env.project);

                    cleanup = client.subscribe(
                        `databases.${env.databaseId}.collections.${statusesCollection}.documents`,
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
                                if (statusUserId === userData.userId) {
                                    const { normalized } =
                                        normalizeStatus(payload);
                                    setUserStatusState(normalized);
                                }
                            } catch (err) {
                                if (process.env.NODE_ENV !== "production") {
                                    // biome-ignore lint: development-only diagnostics
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
                        console.error("Status subscription failed:", err);
                    }
                }
            })();
        }, 5000); // Defer for 5 seconds to prioritize initial page load

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            cleanup?.();
        };
    }, [userData?.userId]);

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
                    // biome-ignore lint: development debugging
                    console.error("Failed to change status:", err);
                }
            }
        },
        [userData?.userId],
    );

    const value: AuthContextType = {
        userData,
        userStatus,
        loading,
        refreshUser: fetchUserData,
        setUserData,
        setUserStatusState,
        updateUserStatus,
    };

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
