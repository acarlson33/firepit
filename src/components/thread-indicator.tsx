"use client";

import { MessageSquareMore } from "lucide-react";

type ThreadIndicatorProps = {
	replyCount: number;
	lastReplyAt?: string;
	participantCount?: number;
	onClick?: () => void;
};

/**
 * Badge component that shows thread reply count on messages with replies.
 * Clicking opens the thread panel.
 */
export function ThreadIndicator({
	replyCount,
	onClick,
}: ThreadIndicatorProps) {
	if (replyCount === 0) {
		return null;
	}

	return (
		<button
			className="mt-2 flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary transition hover:border-primary/40 hover:bg-primary/10"
			onClick={onClick}
			type="button"
		>
			<MessageSquareMore className="h-3.5 w-3.5" />
			<span className="font-medium">
				{replyCount} {replyCount === 1 ? "reply" : "replies"}
			</span>
		</button>
	);
}
