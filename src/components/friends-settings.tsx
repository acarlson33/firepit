"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Clock3, UserMinus, Users, X } from "lucide-react";
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

            return (
                <div
                    key={entry.friendship.$id}
                    className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="relative size-12 overflow-hidden rounded-full border border-border/60 bg-muted">
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
                            <p className="text-xs text-muted-foreground">
                                {kind === "friends"
                                    ? `Friends since ${new Date(entry.friendship.respondedAt ?? entry.friendship.createdAt).toLocaleDateString()}`
                                    : kind === "incoming"
                                      ? `Requested ${new Date(entry.friendship.createdAt).toLocaleDateString()}`
                                      : `Sent ${new Date(entry.friendship.createdAt).toLocaleDateString()}`}
                            </p>
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
        <Card className="rounded-3xl border border-border/60 bg-card/70 shadow-lg">
            <CardHeader className="space-y-1">
                <CardTitle>Friends & requests</CardTitle>
                <CardDescription>
                    Review accepted friends, respond to incoming requests, and
                    keep pending invitations tidy.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Users className="h-4 w-4" />
                            {friends.length} friends
                        </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Check className="h-4 w-4" />
                            {incoming.length} incoming
                        </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Clock3 className="h-4 w-4" />
                            {outgoing.length} sent
                        </div>
                    </div>
                </div>

                <Tabs className="space-y-4" defaultValue="friends">
                    <TabsList className="grid w-full grid-cols-3 rounded-2xl">
                        <TabsTrigger value="friends">Friends</TabsTrigger>
                        <TabsTrigger value="incoming">Incoming</TabsTrigger>
                        <TabsTrigger value="outgoing">Sent</TabsTrigger>
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
                    <p className="text-sm text-destructive">{error}</p>
                ) : null}
            </CardContent>
        </Card>
    );
}
