"use client";

import { MessageSquareMore } from "lucide-react";

type ThreadIndicatorProps = {
    replyCount: number;
    hasUnread?: boolean;
    lastReplyAt?: string;
    participantCount?: number;
    onClick?: () => void;
};

/**
 * Badge component that shows thread reply count on messages with replies.
 * Clicking opens the thread panel.
 */
export function ThreadIndicator({
    hasUnread = false,
    replyCount,
    onClick,
}: ThreadIndicatorProps) {
    if (replyCount === 0) {
        return null;
    }

    return (
        <button
            aria-label={
                hasUnread
                    ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}, unread updates`
                    : `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
            }
            className={`mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition hover:border-primary/40 hover:bg-primary/10 ${
                hasUnread
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-primary/20 bg-primary/5 text-primary"
            }`}
            onClick={onClick}
            type="button"
        >
            <MessageSquareMore className="h-3.5 w-3.5" />
            <span className="font-medium">
                {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
            {hasUnread ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    New
                </span>
            ) : null}
        </button>
    );
}
