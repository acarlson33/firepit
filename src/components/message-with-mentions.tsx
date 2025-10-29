"use client";

import { parseMentions } from "@/lib/mention-utils";
import { EmojiRenderer } from "@/components/emoji-renderer";
import type { UserProfileData, CustomEmoji } from "@/lib/types";

interface MessageWithMentionsProps {
	text: string;
	mentions?: string[]; // User IDs that were mentioned
	users?: Map<string, UserProfileData>; // Map of userId -> user data for mentioned users
	currentUserId?: string;
	customEmojis?: CustomEmoji[];
}

/**
 * Render message text with highlighted @mentions and custom/standard emojis
 */
export function MessageWithMentions({
	text,
	mentions: _mentions = [],
	users = new Map(),
	currentUserId,
	customEmojis = [],
}: MessageWithMentionsProps) {
	const mentionMatches = parseMentions(text);

	if (mentionMatches.length === 0) {
		return <EmojiRenderer text={text} customEmojis={customEmojis} />;
	}

	const parts: React.ReactNode[] = [];
	let lastIndex = 0;

	mentionMatches.forEach((match, index) => {
		// Add text before mention (with emoji support)
		if (match.startIndex > lastIndex) {
			parts.push(
				<EmojiRenderer
					key={`text-${index}`}
					text={text.substring(lastIndex, match.startIndex)}
					customEmojis={customEmojis}
				/>,
			);
		}

		// Find user data for this mention
		const mentionedUser = Array.from(users.values()).find((u) => {
			const displayName = u.displayName || "";
			return displayName.toLowerCase() === match.username.toLowerCase();
		});

		const isMentionedUser = mentionedUser?.userId === currentUserId;

		// Render mention with styling
		parts.push(
			<span
				key={`mention-${index}`}
				className={`rounded px-1 font-semibold ${
					isMentionedUser
						? "bg-primary/20 text-primary dark:bg-primary/30"
						: "bg-accent text-accent-foreground"
				}`}
				title={
					mentionedUser
						? `${mentionedUser.displayName}${mentionedUser.pronouns ? ` (${mentionedUser.pronouns})` : ""}`
						: match.fullMatch
				}
			>
				{match.fullMatch}
			</span>,
		);

		lastIndex = match.endIndex;
	});

	// Add remaining text after last mention (with emoji support)
	if (lastIndex < text.length) {
		parts.push(
			<EmojiRenderer
				key="text-end"
				text={text.substring(lastIndex)}
				customEmojis={customEmojis}
			/>,
		);
	}

	return <span>{parts}</span>;
}
