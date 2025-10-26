"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { UserStatus } from "@/lib/types";
import { getUserStatus, setUserStatus as setUserStatusAPI } from "@/lib/appwrite-status";

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
    expiresAt?: string
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
      } else {
        setUserData(null);
        setUserStatusState(null);
      }
    } catch {
      setUserData(null);
      setUserStatusState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUserData();
  }, [fetchUserData]);

  // Subscribe to real-time status updates for this user
  useEffect(() => {
    if (!userData?.userId) {
      return;
    }

    const statusesCollection = env.collections.statuses;
    if (!statusesCollection) {
      return;
    }

    // Import dynamically to avoid SSR issues
    import("appwrite").then(({ Client }) => {
      const client = new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.project);

      const unsubscribe = client.subscribe(
        `databases.${env.databaseId}.collections.${statusesCollection}.documents`,
        (response) => {
          const payload = response.payload as Record<string, unknown>;
          const statusUserId = payload.userId as string | undefined;

          // Only update if this is our user's status
          if (statusUserId === userData.userId) {
            const updatedStatus: UserStatus = {
              $id: String(payload.$id),
              userId: String(payload.userId),
              status: String(payload.status) as "online" | "away" | "busy" | "offline",
              customMessage: payload.customMessage ? String(payload.customMessage) : undefined,
              lastSeenAt: String(payload.lastSeenAt),
              expiresAt: payload.expiresAt ? String(payload.expiresAt) : undefined,
              isManuallySet: payload.isManuallySet ? Boolean(payload.isManuallySet) : undefined,
              $updatedAt: payload.$updatedAt ? String(payload.$updatedAt) : undefined,
            };
            setUserStatusState(updatedStatus);
          }
        },
      );

      return () => {
        unsubscribe();
      };
    }).catch(() => {
      // Ignore subscription errors
    });
  }, [userData?.userId]);

  const updateUserStatus = useCallback(
    async (
      status: "online" | "away" | "busy" | "offline",
      customMessage?: string,
      expiresAt?: string
    ) => {
      if (!userData?.userId) {
        return;
      }

      try {
        // isManuallySet=true because user explicitly changed status
        await setUserStatusAPI(userData.userId, status, customMessage, expiresAt, true);
        const newStatus = await getUserStatus(userData.userId);
        if (newStatus) {
          setUserStatusState(newStatus);
        }
      } catch (err) {
        console.error("Failed to change status:", err);
      }
    },
    [userData?.userId]
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
