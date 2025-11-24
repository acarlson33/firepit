"use client";

import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import type { Message, DirectMessage } from "@/lib/types";

type ThreadIndicatorProps = {
	message: Message | DirectMessage;
	onClick: () => void;
};

export function ThreadIndicator({ message, onClick }: ThreadIndicatorProps) {
	if (!message.threadCount || message.threadCount === 0) {
		return null;
	}

	const replyText = message.threadCount === 1 ? "reply" : "replies";
	const lastReplyTime = message.lastThreadReplyAt
		? formatDistanceToNow(new Date(message.lastThreadReplyAt), {
				addSuffix: true,
		  })
		: null;

	return (
		<Button
			variant="ghost"
			size="sm"
			className="mt-1 h-auto gap-2 px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
			onClick={onClick}
		>
			<MessageSquare className="h-3 w-3" />
			<span>
				{message.threadCount} {replyText}
			</span>
			{lastReplyTime && message.threadPreview && (
				<>
					<span>·</span>
					<span className="max-w-[200px] truncate">
						Last from{" "}
						{"userName" in message.threadPreview
							? message.threadPreview.displayName ||
							  message.threadPreview.userName ||
							  "Unknown"
							: "senderDisplayName" in message.threadPreview
								? message.threadPreview.senderDisplayName || "Unknown"
								: "Unknown"}{" "}
						{lastReplyTime}
					</span>
				</>
			)}
		</Button>
	);
}
