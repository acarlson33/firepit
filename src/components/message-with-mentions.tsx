"use client";

import type { MentionMatch } from "@/lib/mention-utils";
import { parseMentions } from "@/lib/mention-utils";
import { EmojiRenderer } from "@/components/emoji-renderer";
import type { UserProfileData, CustomEmoji } from "@/lib/types";

interface MessageWithMentionsProps {
    text: string;
    mentions?: string[]; // Display names of mentioned users (from the stored message)
    knownNames?: string[]; // All display names visible in the chat (for old messages / manual mentions)
    users?: Map<string, UserProfileData>;
    currentUserId?: string;
    customEmojis?: CustomEmoji[];
}

/**
 * Render message text with highlighted @mentions and custom/standard emojis.
 *
 * When `mentions` (display names) are provided, we locate exact `@displayName`
 * substrings — this correctly handles names with spaces and symbols like
 * "avery <3". A regex fallback catches any `@word` patterns not already
 * covered (e.g. when the mentions array is empty).
 */
export function MessageWithMentions({
    text,
    mentions = [],
    knownNames = [],
    users = new Map(),
    currentUserId,
    customEmojis = [],
}: MessageWithMentionsProps) {
    const allMatches = findMentionSpans(text, mentions, knownNames);

    if (allMatches.length === 0) {
        return <EmojiRenderer text={text} customEmojis={customEmojis} />;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const [index, match] of allMatches.entries()) {
        if (match.startIndex > lastIndex) {
            parts.push(
                <EmojiRenderer
                    key={`text-${index}`}
                    text={text.substring(lastIndex, match.startIndex)}
                    customEmojis={customEmojis}
                />,
            );
        }

        const mentionedUser = Array.from(users.values()).find((u) => {
            const displayName = u.displayName || "";
            return displayName.toLowerCase() === match.username.toLowerCase();
        });

        const isSelf = mentionedUser?.userId === currentUserId;

        parts.push(
            <span
                key={`mention-${index}`}
                className={`rounded px-1 font-semibold ${
                    isSelf
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
    }

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

/**
 * Build a sorted, non-overlapping list of mention spans.
 *
 * 1. For each known display name (from stored mentions + chat participants),
 *    find exact `@displayName` occurrences (case-insensitive).
 *    Longest name wins when names overlap — so "avery <3" beats "avery".
 * 2. Fall back to the simple regex parser for any `@word`-style mentions
 *    not already covered.
 */
function findMentionSpans(
    text: string,
    mentionNames: string[],
    knownNames: string[],
): MentionMatch[] {
    const lowerText = text.toLowerCase();
    const matches: MentionMatch[] = [];
    const taken: Array<{ start: number; end: number }> = [];

    // Merge stored mentions with all known display names, deduplicate
    const allNames = [...new Set([...mentionNames, ...knownNames])].filter(
        Boolean,
    );

    // Sort names longest-first so "avery <3" is matched before "avery"
    const sortedNames = allNames.sort((a, b) => b.length - a.length);

    // --- Pass 1: exact display-name matches ---
    for (const name of sortedNames) {
        const needle = `@${name.toLowerCase()}`;
        let pos = lowerText.indexOf(needle);
        while (pos !== -1) {
            const end = pos + needle.length;
            const overlaps = taken.some(
                (r) => !(end <= r.start || pos >= r.end),
            );
            if (!overlaps) {
                matches.push({
                    fullMatch: text.substring(pos, end),
                    username: name,
                    startIndex: pos,
                    endIndex: end,
                });
                taken.push({ start: pos, end });
            }
            pos = lowerText.indexOf(needle, end);
        }
    }

    // --- Pass 2: regex fallback for unknown @mentions ---
    for (const match of parseMentions(text)) {
        const overlaps = taken.some(
            (r) => !(match.endIndex <= r.start || match.startIndex >= r.end),
        );
        if (overlaps) {
            continue;
        }
        matches.push(match);
        taken.push({ start: match.startIndex, end: match.endIndex });
    }

    return matches.sort((a, b) => a.startIndex - b.startIndex);
}
