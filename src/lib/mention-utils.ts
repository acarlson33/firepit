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
 * Regular expression to match @username patterns (simple fallback).
 * Matches @ followed by one or more non-whitespace characters.
 * This is intentionally conservative — names with spaces are handled by the
 * display-name matching in MessageWithMentions when the mentions array is
 * available.
 */
export const MENTION_REGEX = /@(\S+)/g;

/**
 * Parse message text to find all @mentions using the simple regex.
 * For names with spaces/symbols, use findMentionSpans in
 * message-with-mentions.tsx with the mentions array instead.
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
 * Extract usernames from @mentions in text (simple regex fallback).
 * Only captures single-word @mentions. For names with spaces, use
 * extractMentionsWithKnownNames instead.
 */
export function extractMentionedUsernames(text: string): string[] {
    const mentions = parseMentions(text);
    return mentions.map((m) => m.username);
}

/**
 * Extract mentioned display names from text using a list of known names.
 * This handles names containing spaces and special characters (e.g. "avery <3")
 * by finding exact `@displayName` substrings in the text.
 * Falls back to the simple regex for any remaining @-mentions.
 */
export function extractMentionsWithKnownNames(
    text: string,
    knownNames: string[],
): string[] {
    const lowerText = text.toLowerCase();
    const found: string[] = [];
    const taken: Array<{ start: number; end: number }> = [];

    // Sort longest-first so "avery <3" is matched before "avery"
    const sorted = [...new Set(knownNames)]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    for (const name of sorted) {
        const needle = `@${name.toLowerCase()}`;
        let pos = lowerText.indexOf(needle);
        while (pos !== -1) {
            const end = pos + needle.length;
            const overlaps = taken.some(
                (r) => !(end <= r.start || pos >= r.end),
            );
            if (!overlaps) {
                found.push(name);
                taken.push({ start: pos, end });
            }
            pos = lowerText.indexOf(needle, end);
        }
    }

    // Fallback: pick up any @word-style mentions we missed
    for (const match of parseMentions(text)) {
        const overlaps = taken.some(
            (r) => !(match.endIndex <= r.start || match.startIndex >= r.end),
        );
        if (!overlaps) {
            found.push(match.username);
            taken.push({ start: match.startIndex, end: match.endIndex });
        }
    }

    return found;
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
        nextWhitespace === -1 ? text.length : cursorPosition + nextWhitespace;

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
