"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, RefreshCw, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement, AnnouncementStatus } from "@/lib/types";
import { logger } from "@/lib/client-logger";

import {
    createAnnouncementAction,
    dispatchAnnouncementsAction,
    getAnnouncementsAction,
} from "./actions";

type AnnouncementPanelProps = {
    userId: string;
};

type Mode = "draft" | "schedule" | "send_now";
type Priority = "normal" | "urgent";

type AnnouncementFilter = "all" | AnnouncementStatus;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
});

function formatDate(value?: string): string {
    if (!value) {
        return "-";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "-";
    }

    return `${dateTimeFormatter.format(parsed)} UTC`;
}

function getStatusBadgeClass(status: AnnouncementStatus): string {
    switch (status) {
        case "sent":
            return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
        case "failed":
            return "bg-destructive/15 text-destructive";
        case "dispatching":
            return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
        case "scheduled":
            return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
        case "archived":
            return "bg-muted text-muted-foreground";
        default:
            return "bg-secondary/70 text-secondary-foreground";
    }
}

function toIsoDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid scheduled time");
    }

    return parsed.toISOString();
}

function getAnnouncementPreview(body: string): string {
    const trimmed = body.trim();
    if (trimmed.length <= 220) {
        return trimmed;
    }

    return `${trimmed.slice(0, 220)}...`;
}

export function AnnouncementPanel({ userId }: AnnouncementPanelProps) {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<AnnouncementFilter>("all");
    const [idempotencyKey, setIdempotencyKey] = useState("");
    const [isDispatching, setIsDispatching] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mode, setMode] = useState<Mode>("draft");
    const [nextCursor, setNextCursor] = useState<string | undefined>();
    const [priority, setPriority] = useState<Priority>("normal");
    const [scheduledForLocal, setScheduledForLocal] = useState("");
    const [title, setTitle] = useState("");

    const activeStatuses = useMemo(() => {
        if (filter === "all") {
            return undefined;
        }

        return [filter];
    }, [filter]);

    const loadAnnouncements = useCallback(
        async (cursorAfter?: string) => {
            if (cursorAfter) {
                setIsLoadingMore(true);
            } else {
                setIsLoading(true);
            }
            setError(null);

            try {
                const result = await getAnnouncementsAction(userId, {
                    cursorAfter,
                    limit: 12,
                    statuses: activeStatuses,
                });

                if (cursorAfter) {
                    setAnnouncements((current) => [
                        ...current,
                        ...result.items.filter(
                            (item) =>
                                !current.some(
                                    (existing) => existing.$id === item.$id,
                                ),
                        ),
                    ]);
                } else {
                    setAnnouncements(result.items);
                }

                setNextCursor(result.nextCursor);
            } catch (caughtError) {
                const message =
                    caughtError instanceof Error
                        ? caughtError.message
                        : "Failed to load announcements";
                logger.error("Failed to load announcements", message);
                setError(message);
            } finally {
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        },
        [activeStatuses, userId],
    );

    useEffect(() => {
        void loadAnnouncements();
    }, [loadAnnouncements]);

    const handleSubmit = async () => {
        if (!body.trim()) {
            toast.error("Message body is required");
            return;
        }

        if (mode === "schedule" && !scheduledForLocal) {
            toast.error("Choose a scheduled time");
            return;
        }

        setIsSubmitting(true);

        try {
            const scheduledForIso =
                mode === "schedule" ? toIsoDate(scheduledForLocal) : undefined;

            const result = await createAnnouncementAction(userId, {
                body,
                idempotencyKey: idempotencyKey.trim() || undefined,
                mode,
                priority,
                scheduledFor: scheduledForIso,
                title: title.trim() || undefined,
            });

            setBody("");
            setIdempotencyKey("");
            setScheduledForLocal("");
            setTitle("");
            setMode("draft");
            setPriority("normal");

            if (result.dispatched) {
                toast.success(
                    `Announcement queued and dispatched to ${result.dispatched.dueCount} scheduled job(s)`,
                );
            } else if (result.dispatchError) {
                toast.error(
                    `Announcement created, but dispatcher failed: ${result.dispatchError}`,
                );
            } else {
                toast.success("Announcement created");
            }

            await loadAnnouncements();
        } catch (caughtError) {
            const message =
                caughtError instanceof Error
                    ? caughtError.message
                    : "Failed to create announcement";
            logger.error("Failed to create announcement", message);
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDispatchNow = async () => {
        setIsDispatching(true);
        try {
            const result = await dispatchAnnouncementsAction(userId, 100);
            toast.success(
                `Dispatcher processed ${result.dueCount} announcement job(s)`,
            );
            await loadAnnouncements();
        } catch (caughtError) {
            const message =
                caughtError instanceof Error
                    ? caughtError.message
                    : "Failed to run dispatcher";
            logger.error("Failed to dispatch announcements", message);
            toast.error(message);
        } finally {
            setIsDispatching(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <Megaphone
                            aria-hidden="true"
                            className="h-5 w-5 text-muted-foreground"
                        />
                        <h2 className="text-lg font-semibold">
                            Instance Announcements
                        </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Compose, schedule, and send system announcements to every
                        profiled user through read-only DM threads.
                    </p>
                </div>
                <Button
                    disabled={isDispatching || isLoading}
                    onClick={() => {
                        void handleDispatchNow();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                >
                    <SendHorizontal aria-hidden="true" className="mr-2 h-4 w-4" />
                    {isDispatching ? "Dispatching..." : "Run Dispatcher"}
                </Button>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/80 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="announcement-title">Title</Label>
                        <Input
                            id="announcement-title"
                            placeholder="Optional title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="announcement-idempotency">
                            Idempotency key
                        </Label>
                        <Input
                            id="announcement-idempotency"
                            placeholder="Optional unique key"
                            value={idempotencyKey}
                            onChange={(event) =>
                                setIdempotencyKey(event.target.value)
                            }
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="announcement-body">Message</Label>
                    <Textarea
                        className="min-h-28"
                        id="announcement-body"
                        placeholder="Write announcement body (Markdown supported)."
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="announcement-mode">Mode</Label>
                        <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            id="announcement-mode"
                            value={mode}
                            onChange={(event) =>
                                setMode(event.target.value as Mode)
                            }
                        >
                            <option value="draft">Draft</option>
                            <option value="schedule">Scheduled</option>
                            <option value="send_now">Send now</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="announcement-priority">Priority</Label>
                        <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            id="announcement-priority"
                            value={priority}
                            onChange={(event) =>
                                setPriority(event.target.value as Priority)
                            }
                        >
                            <option value="normal">Normal</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="announcement-scheduled-for">
                            Scheduled for
                        </Label>
                        <Input
                            disabled={mode !== "schedule"}
                            id="announcement-scheduled-for"
                            type="datetime-local"
                            value={scheduledForLocal}
                            onChange={(event) =>
                                setScheduledForLocal(event.target.value)
                            }
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end">
                    <Button
                        disabled={isSubmitting}
                        onClick={() => {
                            void handleSubmit();
                        }}
                        type="button"
                    >
                        {isSubmitting ? "Saving..." : "Create Announcement"}
                    </Button>
                </div>
            </div>

            <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Recent announcements
                    </h3>

                    <div className="flex items-center gap-2">
                        <Label className="sr-only" htmlFor="announcement-status-filter">
                            Announcement status filter
                        </Label>
                        <select
                            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            id="announcement-status-filter"
                            value={filter}
                            onChange={(event) =>
                                setFilter(event.target.value as AnnouncementFilter)
                            }
                        >
                            <option value="all">All statuses</option>
                            <option value="draft">Draft</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="dispatching">Dispatching</option>
                            <option value="sent">Sent</option>
                            <option value="failed">Failed</option>
                            <option value="archived">Archived</option>
                        </select>
                        <Button
                            onClick={() => {
                                void loadAnnouncements();
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                    </div>
                </div>

                {error && (
                    <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                    </p>
                )}

                {!error && isLoading && (
                    <p className="text-sm text-muted-foreground">
                        Loading announcements...
                    </p>
                )}

                {!error && !isLoading && announcements.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No announcements yet for the selected filter.
                    </p>
                )}

                {!error && !isLoading && announcements.length > 0 && (
                    <div className="space-y-3">
                        {announcements.map((announcement) => (
                            <article
                                className="rounded-2xl border border-border/60 bg-background/80 p-4"
                                key={announcement.$id}
                            >
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        {announcement.title || "Untitled announcement"}
                                    </h4>
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${getStatusBadgeClass(
                                            announcement.status,
                                        )}`}
                                    >
                                        {announcement.status}
                                    </span>
                                </div>

                                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                    {getAnnouncementPreview(announcement.body)}
                                </p>

                                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                                    <p>Priority: {announcement.priority}</p>
                                    <p>
                                        Scheduled: {formatDate(announcement.scheduledFor)}
                                    </p>
                                    <p>
                                        Published: {formatDate(announcement.publishedAt)}
                                    </p>
                                    <p>
                                        Last dispatch: {formatDate(
                                            announcement.lastDispatchAt,
                                        )}
                                    </p>
                                </div>
                            </article>
                        ))}

                        {nextCursor && (
                            <div className="flex justify-center">
                                <Button
                                    disabled={isLoadingMore}
                                    onClick={() => {
                                        void loadAnnouncements(nextCursor);
                                    }}
                                    type="button"
                                    variant="outline"
                                >
                                    {isLoadingMore ? "Loading..." : "Load more"}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
