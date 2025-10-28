/**
 * Mention parsing and formatting utilities
 */

export interface MentionMatch {
	fullMatch: string;
	username: string;
	startIndex: number;
	endIndex: number;
}

/**
 * Regular expression to match @username patterns
 * Matches: @word, @word-with-dashes, @word_with_underscores, @word/with/slashes
 * Allows letters, numbers, dashes, underscores, slashes, dots, and other common characters
 * Stops at whitespace or end of string
 */
export const MENTION_REGEX = /@([^\s]+)/g;

/**
 * Parse message text to find all @mentions
 */
export function parseMentions(text: string): MentionMatch[] {
	const matches: MentionMatch[] = [];
	let match: RegExpExecArray | null;

	// Reset regex state
	MENTION_REGEX.lastIndex = 0;

	while ((match = MENTION_REGEX.exec(text)) !== null) {
		matches.push({
			fullMatch: match[0],
			username: match[1],
			startIndex: match.index,
			endIndex: match.index + match[0].length,
		});
	}

	return matches;
}

/**
 * Extract usernames from @mentions in text
 */
export function extractMentionedUsernames(text: string): string[] {
	const mentions = parseMentions(text);
	return mentions.map((m) => m.username);
}

/**
 * Check if text contains any mentions
 */
export function hasMentions(text: string): boolean {
	MENTION_REGEX.lastIndex = 0;
	return MENTION_REGEX.test(text);
}

/**
 * Find mention at cursor position
 * Returns the mention being typed if cursor is within/after an @ symbol
 */
export function getMentionAtCursor(
	text: string,
	cursorPosition: number,
): MentionMatch | null {
	const beforeCursor = text.substring(0, cursorPosition);
	const lastAtSymbol = beforeCursor.lastIndexOf("@");

	if (lastAtSymbol === -1) {
		return null;
	}

	// Check if there's whitespace between @ and cursor
	const textAfterAt = text.substring(lastAtSymbol + 1, cursorPosition);
	if (/\s/.test(textAfterAt)) {
		return null;
	}

	// Find the end of the mention (next whitespace or end of string)
	const textAfterCursor = text.substring(cursorPosition);
	const nextWhitespace = textAfterCursor.search(/\s/);
	const endIndex =
		nextWhitespace === -1
			? text.length
			: cursorPosition + nextWhitespace;

	const fullMatch = text.substring(lastAtSymbol, endIndex);
	const username = fullMatch.substring(1); // Remove @ symbol

	return {
		fullMatch,
		username,
		startIndex: lastAtSymbol,
		endIndex,
	};
}

/**
 * Replace mention text with formatted version (for autocomplete)
 */
export function replaceMentionAtCursor(
	text: string,
	cursorPosition: number,
	newUsername: string,
): { newText: string; newCursorPosition: number } {
	const mention = getMentionAtCursor(text, cursorPosition);

	if (!mention) {
		return { newText: text, newCursorPosition: cursorPosition };
	}

	const before = text.substring(0, mention.startIndex);
	const after = text.substring(mention.endIndex);
	const newText = `${before}@${newUsername} ${after}`;
	const newCursorPosition = mention.startIndex + newUsername.length + 2; // +2 for @ and space

	return { newText, newCursorPosition };
}
