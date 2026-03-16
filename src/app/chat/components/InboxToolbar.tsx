"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InboxScope } from "@/lib/inbox-client";
import { toast } from "sonner";

interface InboxToolbarProps {
    bulkLoading: InboxScope | null;
    onMarkScopeRead: (scope: InboxScope) => Promise<void>;
    unreadCount: number;
}

export function InboxToolbar({
    bulkLoading,
    onMarkScopeRead,
    unreadCount,
}: InboxToolbarProps) {
    const [open, setOpen] = useState(false);

    const handleMarkRead = async (scope: InboxScope) => {
        try {
            await onMarkScopeRead(scope);
            const message =
                scope === "all"
                    ? "Marked all conversations as read"
                    : scope === "direct"
                      ? "Marked all direct messages as read"
                      : "Marked all servers as read";
            toast.success(message);
        } catch {
            toast.error("Failed to mark as read");
        }
        setOpen(false);
    };

    const isLoading = bulkLoading !== null;
    const loadingLabel =
        bulkLoading === "all"
            ? "Marking all as read..."
            : bulkLoading === "direct"
              ? "Marking DMs as read..."
              : bulkLoading === "server"
                ? "Marking servers as read..."
                : "";

    return (
        <div className="flex items-center justify-between border-b border-border/60 p-2">
            <span className="text-xs text-muted-foreground">
                {unreadCount > 0
                    ? `${unreadCount} unread item${unreadCount === 1 ? "" : "s"}`
                    : "All caught up"}
            </span>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        disabled={isLoading || unreadCount === 0}
                        size="sm"
                        variant="outline"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 size-3.5 animate-spin" />
                                {loadingLabel}
                            </>
                        ) : (
                            <>
                                <Check className="mr-2 size-3.5" />
                                Mark as read
                            </>
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        disabled={isLoading}
                        onClick={() => void handleMarkRead("all")}
                    >
                        Mark all as read
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isLoading}
                        onClick={() => void handleMarkRead("direct")}
                    >
                        Mark all DMs as read
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isLoading}
                        onClick={() => void handleMarkRead("server")}
                    >
                        Mark all servers as read
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
