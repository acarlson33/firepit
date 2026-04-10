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
import { logger } from "@/lib/client-logger";
import { toast } from "sonner";

const scopeMessages: Record<InboxScope, string> = {
    all: "Marked all conversations as read",
    direct: "Marked all direct messages as read",
    server: "Marked all servers as read",
};

const loadingLabels: Record<InboxScope, string> = {
    all: "Marking all as read...",
    direct: "Marking DMs as read...",
    server: "Marking servers as read...",
};

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

    const handleMarkRead = (scope: InboxScope) => {
        onMarkScopeRead(scope)
            .then(() => {
                toast.success(scopeMessages[scope]);
            })
            .catch((error) => {
                logger.warn("Failed to mark inbox scope as read", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    scope,
                });
                toast.error("Failed to mark as read");
            })
            .finally(() => {
                setOpen(false);
            });
    };

    const isLoading = bulkLoading !== null;
    const loadingLabel = bulkLoading ? loadingLabels[bulkLoading] : "";

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
                        type="button"
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
                        onClick={() => {
                            handleMarkRead("all");
                        }}
                    >
                        Mark all as read
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isLoading}
                        onClick={() => {
                            handleMarkRead("direct");
                        }}
                    >
                        Mark all DMs as read
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isLoading}
                        onClick={() => {
                            handleMarkRead("server");
                        }}
                    >
                        Mark all servers as read
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
