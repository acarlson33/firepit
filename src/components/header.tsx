"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ModeToggle } from "./mode-toggle";
import { StatusSelector } from "./status-selector";
import { Button } from "./ui/button";

import { logoutAction } from "@/app/(auth)/login/actions";
import { getUserStatus, setUserStatus } from "@/lib/appwrite-status";
import type { UserStatus } from "@/lib/types";

type UserData = {
  userId: string;
  name: string;
  email: string;
  roles: {
    isAdmin: boolean;
    isModerator: boolean;
  };
};

export default function Header() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [userStatus, setUserStatusState] = useState<UserStatus | null>(null);

  useEffect(() => {
    // Fetch user data from server endpoint (SSR-compatible)
    fetch("/api/me")
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error("Not authenticated");
      })
      .then((data) => {
        setUserData(data);
        // Fetch user status
        if (data.userId) {
          void getUserStatus(data.userId).then((status) => {
            if (status) {
              setUserStatusState(status);
            }
          });
        }
      })
      .catch(() => {
        setUserData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function handleStatusChange(
    status: "online" | "away" | "busy" | "offline",
    customMessage?: string,
    expiresAt?: string,
  ) {
    if (!userData?.userId) {
      return;
    }
    
    try {
      // isManuallySet=true because user explicitly changed status
      await setUserStatus(userData.userId, status, customMessage, expiresAt, true);
      const newStatus = await getUserStatus(userData.userId);
      if (newStatus) {
        setUserStatusState(newStatus);
      }
    } catch (err) {
      console.error("Failed to change status:", err);
      // Error handled silently in UI but logged to console
    }
  }

  const isAuthenticated = Boolean(userData);
  const roles = userData?.roles;

  const baseLinks: Array<{ to: string; label: string }> = [
    { to: "/", label: "Home" },
    { to: "/chat", label: "Chat" },
  ];

  const links: Array<{ to: string; label: string }> = [
    ...baseLinks,
    ...(isAuthenticated ? [{ to: "/settings", label: "Settings" }] : []),
    ...(roles?.isModerator ? [{ to: "/moderation", label: "Moderation" }] : []),
    ...(roles?.isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  async function handleLogout(e: React.FormEvent) {
    e.preventDefault();
    setLoggingOut(true);
    try {
      await logoutAction();
      setUserData(null);
      router.push("/");
      router.refresh();
    } catch {
      // Ignore errors, redirect anyway
      setUserData(null);
      location.href = "/";
    } finally {
      setLoggingOut(false);
    }
  }

  // Show skeleton while loading initial auth state
  if (loading) {
    return (
      <div>
        <div className="flex flex-row items-center justify-between px-2 py-1">
          <nav className="flex gap-4 text-lg">
            {baseLinks.map((link) => (
              <Link href={link.to as `/` | `/chat`} key={link.to}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 animate-pulse rounded bg-muted" />
            <ModeToggle />
          </div>
        </div>
        <hr />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map((link) => (
            <Link href={link.to as `/` | `/chat` | `/moderation` | `/admin`} key={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated && userData ? (
            <>
              {userData.name && (
                <span className="text-muted-foreground text-sm">
                  {userData.name}
                </span>
              )}
              <StatusSelector
                currentMessage={userStatus?.customMessage}
                currentStatus={userStatus?.status || "offline"}
                onStatusChange={handleStatusChange}
              />
              <form onSubmit={handleLogout}>
                <Button disabled={loggingOut} type="submit" variant="outline">
                  {loggingOut ? "Logging out..." : "Logout"}
                </Button>
              </form>
            </>
          ) : (
            <Button asChild variant="outline">
              <Link href="/login">Login</Link>
            </Button>
          )}
          <ModeToggle />
        </div>
      </div>
      <hr />
    </div>
  );
}
