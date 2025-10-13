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
      <header role="banner" className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              firepit
            </Link>
            <nav aria-label="Main navigation" className="hidden items-center gap-3 text-sm font-medium sm:flex">
              {baseLinks.map((link) => (
                <span className="rounded-full bg-muted/70 px-3 py-1 text-muted-foreground" key={link.to}>
                  {link.label}
                </span>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
            <ModeToggle />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header role="banner" className="border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
              fp
            </span>
            <span className="hidden sm:inline">firepit</span>
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
            {links.map((link) => (
              <Link
                href={link.to as `/` | `/chat` | `/moderation` | `/admin`}
                key={link.to}
                className="rounded-full border border-transparent px-3 py-1 transition-colors hover:border-border hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {isAuthenticated && userData ? (
            <div className="flex items-center gap-3">
              {userData.name && (
                <span className="hidden text-muted-foreground text-sm sm:inline">
                  {userData.name}
                </span>
              )}
              <StatusSelector
                currentMessage={userStatus?.customMessage}
                currentStatus={userStatus?.status || "offline"}
                onStatusChange={handleStatusChange}
              />
              <form onSubmit={handleLogout}>
                <Button aria-label="Logout from your account" disabled={loggingOut} type="submit" variant="outline">
                  {loggingOut ? "Logging out..." : "Logout"}
                </Button>
              </form>
            </div>
          ) : (
            <Button asChild variant="outline">
              <Link href="/login">Login</Link>
            </Button>
          )}
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
