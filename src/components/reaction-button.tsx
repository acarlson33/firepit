"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Reaction = {
	emoji: string;
	userIds: string[];
	count: number;
};

type ReactionButtonProps = {
	reaction: Reaction;
	currentUserId: string | null;
	onToggle: (emoji: string, isAdding: boolean) => Promise<void>;
};

export function ReactionButton({
	reaction,
	currentUserId,
	onToggle,
}: ReactionButtonProps) {
	const [loading, setLoading] = useState(false);
	const hasReacted = currentUserId
		? reaction.userIds.includes(currentUserId)
		: false;

	async function handleClick() {
		if (!currentUserId || loading) {
			return;
		}

		setLoading(true);
		try {
			await onToggle(reaction.emoji, !hasReacted);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Button
			disabled={loading || !currentUserId}
			onClick={() => void handleClick()}
			size="sm"
			title={`${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`}
			type="button"
			variant="ghost"
			className={cn(
				"h-7 gap-1 rounded-full px-2 text-xs transition-all",
				hasReacted
					? "bg-primary/20 text-primary hover:bg-primary/30"
					: "bg-muted/50 hover:bg-muted"
			)}
		>
			<span className="text-base leading-none">{reaction.emoji}</span>
			<span className="font-medium">{reaction.count}</span>
		</Button>
	);
}
