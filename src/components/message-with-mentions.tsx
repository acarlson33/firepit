"use client";

import { parseMentions } from "@/lib/mention-utils";
import type { UserProfileData } from "@/lib/types";

interface MessageWithMentionsProps {
	text: string;
	mentions?: string[]; // User IDs that were mentioned
	users?: Map<string, UserProfileData>; // Map of userId -> user data for mentioned users
	currentUserId?: string;
}

/**
 * Render message text with highlighted @mentions
 */
export function MessageWithMentions({
	text,
	mentions: _mentions = [],
	users = new Map(),
	currentUserId,
}: MessageWithMentionsProps) {
	const mentionMatches = parseMentions(text);

	if (mentionMatches.length === 0) {
		return <span>{text}</span>;
	}

	const parts: React.ReactNode[] = [];
	let lastIndex = 0;

	mentionMatches.forEach((match, index) => {
		// Add text before mention
		if (match.startIndex > lastIndex) {
			parts.push(
				<span key={`text-${index}`}>
					{text.substring(lastIndex, match.startIndex)}
				</span>,
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

	// Add remaining text after last mention
	if (lastIndex < text.length) {
		parts.push(<span key="text-end">{text.substring(lastIndex)}</span>);
	}

	return <span>{parts}</span>;
}
