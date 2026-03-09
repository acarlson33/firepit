"use client";

import Image from "next/image";
import Link from "next/link";
import { ShieldBan } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";

export function BlockedUsersSettings() {
    const { items, loading, actionLoading, error, unblock } = useBlockedUsers();

    async function handleUnblock(userId: string, displayName: string) {
        const succeeded = await unblock(userId);
        if (succeeded) {
            toast.success(`Unblocked ${displayName}`);
            return;
        }

        if (error) {
            toast.error(error);
        }
    }

    return (
        <Card className="rounded-3xl border border-border/60 bg-card/70 shadow-lg">
            <CardHeader className="space-y-1">
                <CardTitle>Blocked users</CardTitle>
                <CardDescription>
                    Manage people who cannot direct message you or appear in new
                    user search results.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <p className="text-sm text-muted-foreground">
                        Loading blocked users...
                    </p>
                ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                        You have not blocked anyone.
                    </div>
                ) : (
                    items.map((item) => {
                        const name = item.user.displayName ?? item.user.userId;

                        return (
                            <div
                                key={item.block.$id}
                                className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative size-12 overflow-hidden rounded-full border border-border/60 bg-muted">
                                        {item.user.avatarUrl ? (
                                            <Image
                                                alt={name}
                                                className="object-cover"
                                                fill
                                                sizes="48px"
                                                src={item.user.avatarUrl}
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
                                            href={`/profile/${item.user.userId}`}
                                        >
                                            {name}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">
                                            Blocked on{" "}
                                            {new Date(
                                                item.block.blockedAt,
                                            ).toLocaleDateString()}
                                        </p>
                                        {item.block.reason ? (
                                            <p className="text-xs text-muted-foreground">
                                                Reason: {item.block.reason}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                                <Button
                                    disabled={
                                        actionLoading === item.user.userId
                                    }
                                    onClick={() =>
                                        void handleUnblock(
                                            item.user.userId,
                                            name,
                                        )
                                    }
                                    type="button"
                                    variant="outline"
                                >
                                    <ShieldBan className="mr-2 h-4 w-4" />
                                    {actionLoading === item.user.userId
                                        ? "Updating..."
                                        : "Unblock"}
                                </Button>
                            </div>
                        );
                    })
                )}

                {error ? (
                    <p className="text-sm text-destructive">{error}</p>
                ) : null}
            </CardContent>
        </Card>
    );
}
