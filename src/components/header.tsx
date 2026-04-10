"use client";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import { StatusSelector } from "./status-selector";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

import { logoutAction } from "@/app/(auth)/login/actions";
import { useAuth } from "@/contexts/auth-context";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import type { NavigationItemPreferenceId } from "@/lib/types";
import { useFriends } from "@/hooks/useFriends";
import { resetSharedClient } from "@/lib/realtime-pool";

type HeaderProps = {
    onSearchClick?: () => void;
};

export default function Header({ onSearchClick }: HeaderProps) {
    const router = useRouter();
    const { userData, userStatus, loading, setUserData, updateUserStatus } =
        useAuth();
    const { navigationPreferences } = useDeveloperMode(
        userData?.userId ?? null,
    );
    const { incoming, loading: friendsLoading } = useFriends(
        Boolean(userData && navigationPreferences.showFriendsInNavigation),
    );
    const [isMounted, setIsMounted] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const isAuthenticated = Boolean(userData);
    const roles = userData?.roles;
    const incomingRequestCount = friendsLoading ? 0 : incoming.length;
    const optionalLinks: Record<
        NavigationItemPreferenceId,
        { count?: number; label: string; visible: boolean; to: Route }
    > = {
        docs: {
            label: "Docs",
            to: "/docs",
            visible:
                !isAuthenticated || navigationPreferences.showDocsInNavigation,
        },
        friends: {
            label: "Friends",
            to: "/friends",
            count: incomingRequestCount > 0 ? incomingRequestCount : undefined,
            visible:
                isAuthenticated &&
                Boolean(navigationPreferences.showFriendsInNavigation),
        },
        settings: {
            label: "Settings",
            to: "/settings",
            visible:
                isAuthenticated &&
                Boolean(navigationPreferences.showSettingsInNavigation),
        },
    };

    const links: Array<{ to: Route; label: string; count?: number }> = [
        { to: "/" as Route, label: "Home" },
        { to: "/chat" as Route, label: "Chat" },
        ...navigationPreferences.navigationItemOrder.flatMap((item) => {
            const link = optionalLinks[item];
            return link?.visible ? [link] : [];
        }),
        ...(roles?.isModerator
            ? [{ to: "/moderation" as Route, label: "Moderation" }]
            : []),
        ...(roles?.isAdmin ? [{ to: "/admin" as Route, label: "Admin" }] : []),
    ];

    async function handleLogout(e: React.FormEvent) {
        e.preventDefault();
        setLoggingOut(true);
        let resetAttempted = false;
        try {
            posthog.capture(
                "user_logged_out",
                {
                    source: "header",
                },
                {
                    send_instantly: true,
                },
            );
            // Give the SDK a brief window to queue/transmit before identity reset.
            await new Promise((resolve) => {
                setTimeout(resolve, 250);
            });
            posthog.reset();
            await logoutAction();
            await resetSharedClient();
            resetAttempted = true;
            setUserData(null);
            router.push("/");
        } catch {
            // Ignore errors, redirect anyway
            if (!resetAttempted) {
                try {
                    await resetSharedClient();
                } catch {
                    // Ignore cleanup errors during forced logout fallback.
                }
            }
            setUserData(null);
            location.href = "/";
        } finally {
            setLoggingOut(false);
        }
    }

    // Keep the first server and client render in the same branch to avoid hydration drift.
    if (!isMounted || loading) {
        return (
            <header
                role="banner"
                className="min-h-18.25 border-b border-border/60 bg-background/80 backdrop-blur sm:min-h-20.25"
            >
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
                        >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
                                fp
                            </span>
                            <span className="hidden sm:inline">firepit</span>
                        </Link>
                        <nav
                            aria-label="Main navigation"
                            className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground"
                        >
                            {links.map((link) => (
                                <span
                                    className="rounded-full border border-transparent bg-muted/70 px-3 py-1 text-muted-foreground"
                                    key={link.to}
                                >
                                    {link.label}
                                </span>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="h-9 w-42 animate-pulse rounded-md bg-muted" />
                        {onSearchClick && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onSearchClick}
                                aria-label="Search messages"
                                title="Search messages (Ctrl+K)"
                                type="button"
                            >
                                <Search className="h-5 w-5" />
                            </Button>
                        )}
                        <ModeToggle />
                    </div>
                </div>
            </header>
        );
    }

    return (
        <header
            role="banner"
            className="min-h-18.25 border-b border-border/60 bg-background/80 backdrop-blur sm:min-h-20.25"
        >
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-lg font-semibold tracking-tight"
                    >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
                            fp
                        </span>
                        <span className="hidden sm:inline">firepit</span>
                    </Link>
                    <nav
                        aria-label="Main navigation"
                        className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground"
                    >
                        {links.map((link) => (
                            <Link
                                href={link.to}
                                key={link.to}
                                className="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 transition-colors hover:border-border hover:text-foreground"
                            >
                                {link.label}
                                {link.count ? (
                                    <Badge
                                        className="h-5 min-w-5 rounded-full px-1.5 text-[10px] leading-none"
                                        variant="destructive"
                                    >
                                        {link.count}
                                    </Badge>
                                ) : null}
                            </Link>
                        ))}
                    </nav>
                </div>
                <div className="flex min-w-42 items-center gap-3 self-end sm:self-auto">
                    {isAuthenticated && userData ? (
                        <div className="flex items-center gap-3">
                            {navigationPreferences.showAddFriendInHeader ? (
                                <Button asChild size="sm" variant="secondary">
                                    <Link href="/chat?compose=1">
                                        <UserPlus className="h-4 w-4" />
                                        <span className="hidden sm:inline">
                                            Add Friend
                                        </span>
                                        <span className="sr-only sm:hidden">
                                            Add Friend
                                        </span>
                                    </Link>
                                </Button>
                            ) : null}
                            {userData.name && (
                                <span className="hidden text-muted-foreground text-sm sm:inline">
                                    {userData.name}
                                </span>
                            )}
                            <StatusSelector
                                currentMessage={userStatus?.customMessage}
                                currentStatus={userStatus?.status || "offline"}
                                onStatusChange={updateUserStatus}
                            />
                            <form onSubmit={handleLogout}>
                                <Button
                                    aria-label="Logout from your account"
                                    disabled={loggingOut}
                                    type="submit"
                                    variant="outline"
                                >
                                    {loggingOut ? "Logging out..." : "Logout"}
                                </Button>
                            </form>
                        </div>
                    ) : (
                        <Button asChild variant="outline">
                            <Link href="/login">Login</Link>
                        </Button>
                    )}
                    {onSearchClick && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onSearchClick}
                            aria-label="Search messages"
                            title="Search messages (Ctrl+K)"
                            type="button"
                        >
                            <Search className="h-5 w-5" />
                        </Button>
                    )}
                    <ModeToggle />
                </div>
            </div>
        </header>
    );
}
