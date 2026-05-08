"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Clock3, MessageSquarePlus, UserMinus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFriends } from "@/hooks/useFriends";

type FriendEntry = ReturnType<typeof useFriends>["friends"][number];

function emptyLabel(kind: "friends" | "incoming" | "outgoing") {
    if (kind === "friends") {
        return "No friends yet. Send requests from profiles or user search.";
    }

    if (kind === "incoming") {
        return "No incoming requests right now.";
    }

    return "No pending requests sent.";
}

export function FriendsSettings() {
    const {
        friends,
        incoming,
        outgoing,
        loading,
        actionLoading,
        error,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriendship,
    } = useFriends();

    async function handleAction(
        action: () => Promise<boolean>,
        successMessage: string,
    ) {
        const succeeded = await action();
        if (succeeded) {
            toast.success(successMessage);
        }
    }

    function renderEntries(
        entries: FriendEntry[],
        kind: "friends" | "incoming" | "outgoing",
    ) {
        if (loading) {
            return (
                <p className="text-sm text-muted-foreground">
                    Loading connections...
                </p>
            );
        }

        if (entries.length === 0) {
            return (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                    {emptyLabel(kind)}
                </div>
            );
        }

        return entries.map((entry) => {
            const name = entry.user.displayName ?? entry.user.userId;
            const busyKeyPrefix = kind === "incoming" ? "accept" : "remove";
            const statusLabel =
                kind === "friends"
                    ? "Friend"
                    : kind === "incoming"
                      ? "Incoming"
                      : "Sent";

            return (
                <div
                    key={entry.friendship.$id}
                    className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm transition-colors hover:border-border hover:bg-background md:flex-row md:items-center md:justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="relative size-12 overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-sm">
                            {entry.user.avatarUrl ? (
                                <Image
                                    alt={name}
                                    className="object-cover"
                                    fill
                                    sizes="48px"
                                    src={entry.user.avatarUrl}
                                />
                            ) : (
                                <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
                                    {name[0]?.toUpperCase() ?? "?"}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Link
                                className="font-medium text-foreground hover:underline"
                                href={`/profile/${entry.user.userId}`}
                            >
                                {name}
                            </Link>
                            {entry.user.pronouns ? (
                                <p className="text-xs text-muted-foreground">
                                    {entry.user.pronouns}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs text-muted-foreground">
                                    {kind === "friends"
                                        ? `Friends since ${new Date(entry.friendship.respondedAt ?? entry.friendship.createdAt).toLocaleDateString()}`
                                        : kind === "incoming"
                                          ? `Requested ${new Date(entry.friendship.createdAt).toLocaleDateString()}`
                                          : `Sent ${new Date(entry.friendship.createdAt).toLocaleDateString()}`}
                                </p>
                                <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {statusLabel}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {kind === "incoming" ? (
                            <>
                                <Button
                                    disabled={
                                        actionLoading ===
                                        `accept:${entry.user.userId}`
                                    }
                                    onClick={() =>
                                        void handleAction(
                                            () =>
                                                acceptFriendRequest(
                                                    entry.user.userId,
                                                ),
                                            `You are now friends with ${name}`,
                                        )
                                    }
                                    type="button"
                                    className="rounded-full"
                                >
                                    <Check className="mr-2 h-4 w-4" />
                                    Accept
                                </Button>
                                <Button
                                    disabled={
                                        actionLoading ===
                                        `decline:${entry.user.userId}`
                                    }
                                    onClick={() =>
                                        void handleAction(
                                            () =>
                                                declineFriendRequest(
                                                    entry.user.userId,
                                                ),
                                            `Declined request from ${name}`,
                                        )
                                    }
                                    type="button"
                                    className="rounded-full"
                                    variant="outline"
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Decline
                                </Button>
                            </>
                        ) : kind === "friends" ? (
                            <Button
                                disabled={
                                    actionLoading ===
                                    `${busyKeyPrefix}:${entry.user.userId}`
                                }
                                onClick={() =>
                                    void handleAction(
                                        () =>
                                            removeFriendship(entry.user.userId),
                                        `Removed ${name} from friends`,
                                    )
                                }
                                type="button"
                                className="rounded-full"
                                variant="outline"
                            >
                                <UserMinus className="mr-2 h-4 w-4" />
                                Remove
                            </Button>
                        ) : (
                            <Button
                                disabled={
                                    actionLoading ===
                                    `${busyKeyPrefix}:${entry.user.userId}`
                                }
                                onClick={() =>
                                    void handleAction(
                                        () =>
                                            removeFriendship(entry.user.userId),
                                        `Canceled request to ${name}`,
                                    )
                                }
                                type="button"
                                className="rounded-full"
                                variant="outline"
                            >
                                <X className="mr-2 h-4 w-4" />
                                Cancel request
                            </Button>
                        )}
                    </div>
                </div>
            );
        });
    }

    return (
        <Card className="overflow-hidden rounded-4xl border border-border/70 bg-card/75 shadow-2xl backdrop-blur-sm">
            <CardHeader className="space-y-2 pb-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                    Relationship manager
                </div>
                <CardTitle>Friends and requests</CardTitle>
                <CardDescription>
                    Review accepted friends, respond to incoming requests, and
                    keep pending invitations tidy.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                            <span>Friends</span>
                            <Users className="h-4 w-4 text-primary" />
                        </div>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">
                            {friends.length}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Confirmed connections
                        </p>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                            <span>Incoming</span>
                            <Check className="h-4 w-4 text-primary" />
                        </div>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">
                            {incoming.length}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Waiting for your reply
                        </p>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                            <span>Sent</span>
                            <Clock3 className="h-4 w-4 text-primary" />
                        </div>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">
                            {outgoing.length}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Pending invitations
                        </p>
                    </div>
                </div>

                <Tabs className="space-y-4" defaultValue="friends">
                    <TabsList className="grid h-auto w-full grid-cols-3 rounded-3xl border border-border/60 bg-muted/40 p-1">
                        <TabsTrigger className="rounded-2xl data-[state=active]:bg-background data-[state=active]:text-foreground" value="friends">
                            Friends
                        </TabsTrigger>
                        <TabsTrigger className="rounded-2xl data-[state=active]:bg-background data-[state=active]:text-foreground" value="incoming">
                            Incoming
                        </TabsTrigger>
                        <TabsTrigger className="rounded-2xl data-[state=active]:bg-background data-[state=active]:text-foreground" value="outgoing">
                            Sent
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent className="space-y-3" value="friends">
                        {renderEntries(friends, "friends")}
                    </TabsContent>
                    <TabsContent className="space-y-3" value="incoming">
                        {renderEntries(incoming, "incoming")}
                    </TabsContent>
                    <TabsContent className="space-y-3" value="outgoing">
                        {renderEntries(outgoing, "outgoing")}
                    </TabsContent>
                </Tabs>

                {error ? (
                    <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}
