"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInbox } from "@/app/chat/hooks/useInbox";
import { InboxToolbar } from "@/app/chat/components/InboxToolbar";
import { NotificationSettings } from "@/components/notification-settings";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildChatMessageHref } from "@/lib/message-navigation";
import type { InboxScope } from "@/lib/inbox-client";
import type { InboxItem } from "@/lib/types";
import { Bell, Hash, MessageSquare, Sparkles } from "lucide-react";

const FILTERS = [
    { label: "All", value: "all" as const, icon: Sparkles },
    { label: "Mentions", value: "mentions" as const, icon: Bell },
    { label: "Direct messages", value: "direct" as const, icon: MessageSquare },
    { label: "Servers", value: "server" as const, icon: Hash },
] as const;

type NotificationsCenterProps = {
    userId: string;
};

function getItemFilterLabel(item: InboxItem) {
    if (item.kind === "mention") {
        return "Mention";
    }

    return "Thread";
}

export function NotificationsCenter({ userId }: NotificationsCenterProps) {
    const router = useRouter();
    const inboxApi = useInbox(userId);
    const [selectedFilter, setSelectedFilter] = useState<InboxScope | "all">(
        "all",
    );

    const filteredItems = useMemo(() => {
        if (selectedFilter === "direct") {
            return inboxApi.items.filter(
                (item) => item.contextKind === "conversation",
            );
        }

        if (selectedFilter === "server") {
            return inboxApi.items.filter((item) => item.contextKind === "channel");
        }

        if (selectedFilter === "mentions") {
            return inboxApi.items.filter((item) => item.kind === "mention");
        }

        return inboxApi.items;
    }, [inboxApi.items, selectedFilter]);

    const unreadByFilter = useMemo(() => {
        return {
            all: inboxApi.unreadCount,
            mentions: inboxApi.items
                .filter((item) => item.kind === "mention")
                .reduce((total, item) => total + item.unreadCount, 0),
            direct: inboxApi.items
                .filter((item) => item.contextKind === "conversation")
                .reduce((total, item) => total + item.unreadCount, 0),
            server: inboxApi.items
                .filter((item) => item.contextKind === "channel")
                .reduce((total, item) => total + item.unreadCount, 0),
        };
    }, [inboxApi.items, inboxApi.unreadCount]);

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-8">
                <section className="grid gap-6 overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            <Bell className="h-3.5 w-3.5 text-primary" />
                            Notifications
                        </div>
                        <div className="space-y-4">
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                                Notifications, mentions, and DM alerts in one place.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Review recent activity, clear unread items by scope, and tune how Firepit notifies you when people mention you or reply in DMs.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button asChild className="rounded-full shadow-lg shadow-primary/15">
                                <Link href={"/chat" as Route}>Back to chat</Link>
                            </Button>
                            <Button
                                asChild
                                className="rounded-full border-border/70 bg-background/70 backdrop-blur"
                                variant="outline"
                            >
                                <Link href={"/settings#notification-preferences" as Route}>
                                    Notification settings
                                </Link>
                            </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Unread
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                                    {inboxApi.unreadCount}
                                </p>
                            </div>
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Mentions
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                                    {unreadByFilter.mentions}
                                </p>
                            </div>
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    DMs
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                                    {unreadByFilter.direct}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-5 shadow-lg">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Quick actions
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                            Mark items read in bulk, then jump into a notification source with one click.
                        </p>
                        <InboxToolbar
                            bulkLoading={inboxApi.bulkLoading}
                            onMarkScopeRead={inboxApi.markScopeRead}
                            unreadCount={inboxApi.unreadCount}
                        />
                    </div>
                </section>

                <section className="rounded-4xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map((filter) => {
                            const Icon = filter.icon;
                            const active = selectedFilter === filter.value;
                            const count = unreadByFilter[filter.value];

                            return (
                                <Button
                                    aria-pressed={active}
                                    className="rounded-full"
                                    key={filter.value}
                                    onClick={() => setSelectedFilter(filter.value)}
                                    size="sm"
                                    type="button"
                                    variant={active ? "default" : "outline"}
                                >
                                    <Icon className="mr-2 h-4 w-4" />
                                    {filter.label}
                                    <Badge
                                        className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-[10px] leading-none"
                                        variant={active ? "secondary" : "outline"}
                                    >
                                        {count}
                                    </Badge>
                                </Button>
                            );
                        })}
                    </div>

                    <div className="mt-6 space-y-3">
                        {inboxApi.loading ? (
                            <div className="space-y-3">
                                {["s1", "s2", "s3", "s4"].map((id) => (
                                    <div
                                        className="rounded-3xl border border-border/60 bg-background/70 p-4"
                                        key={id}
                                    >
                                        <Skeleton className="h-4 w-36" />
                                        <Skeleton className="mt-2 h-3 w-full" />
                                        <Skeleton className="mt-2 h-3 w-3/4" />
                                    </div>
                                ))}
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-background/60 p-10 text-center">
                                <Bell className="mb-3 h-8 w-8 text-muted-foreground" />
                                <p className="text-sm font-medium text-foreground">
                                    No notifications for this filter
                                </p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                    Try a different filter or adjust your notification settings.
                                </p>
                            </div>
                        ) : (
                            filteredItems.map((item) => (
                                <button
                                    className="flex w-full items-start gap-3 rounded-3xl border border-border/60 bg-background/70 p-4 text-left transition hover:border-border hover:bg-background"
                                    key={item.id}
                                    onClick={() => {
                                        router.push(buildChatMessageHref(
                                            item.destination,
                                            { entry: "unread" },
                                        ));
                                    }}
                                    type="button"
                                >
                                    <Avatar
                                        alt={item.authorLabel}
                                        fallback={item.authorLabel}
                                        size="sm"
                                        src={item.authorAvatarUrl}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.authorLabel}
                                            </p>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(item.createdAt).toLocaleDateString([], {
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                            <span>{getItemFilterLabel(item)}</span>
                                            <span>
                                                {item.contextKind === "channel"
                                                    ? "Channel"
                                                    : "Direct message"}
                                            </span>
                                            {item.muted ? <span>Muted</span> : null}
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                            {item.text}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </section>

                <section className="rounded-4xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
                    <div className="mb-6 space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <MessageSquare className="h-3.5 w-3.5 text-primary" />
                            Fine-grained controls
                        </div>
                        <h2 className="text-2xl font-semibold tracking-tight">
                            Notification preferences
                        </h2>
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                            Control global notification levels, per-context overrides, quiet hours, and browser delivery.
                        </p>
                    </div>
                    <NotificationSettings />
                </section>
            </div>
        </div>
    );
}