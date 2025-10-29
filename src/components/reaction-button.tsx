"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CustomEmoji } from "@/lib/types";

type Reaction = {
	emoji: string;
	userIds: string[];
	count: number;
};

type ReactionButtonProps = {
	reaction: Reaction;
	currentUserId: string | null;
	onToggle: (emoji: string, isAdding: boolean) => Promise<void>;
	customEmojis?: CustomEmoji[];
};

export function ReactionButton({
	reaction,
	currentUserId,
	onToggle,
	customEmojis = [],
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

	// Check if this is a custom emoji (format: :emoji-name:)
	const isCustomEmoji = reaction.emoji.startsWith(":") && reaction.emoji.endsWith(":");
	let emojiDisplay: React.ReactNode = reaction.emoji;

	if (isCustomEmoji) {
		const emojiName = reaction.emoji.slice(1, -1); // Remove colons
		const customEmoji = customEmojis.find((e) => e.name === emojiName);

		if (customEmoji) {
			emojiDisplay = (
				<img
					src={customEmoji.url}
					alt={reaction.emoji}
					title={reaction.emoji}
					className="inline-block size-5"
					loading="lazy"
					crossOrigin="anonymous"
				/>
			);
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
			<span className="text-base leading-none">{emojiDisplay}</span>
			<span className="font-medium">{reaction.count}</span>
		</Button>
	);
}
