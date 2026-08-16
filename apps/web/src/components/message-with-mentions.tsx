"use client";

import { Children, cloneElement, isValidElement } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { MentionMatch } from "@/lib/mention-utils";
import { parseMentions } from "@/lib/mention-utils";
import { EmojiRenderer } from "@/components/emoji-renderer";
import type { UserProfileData, CustomEmoji } from "@/lib/types";

const MARKDOWN_PATTERN =
    /(\*\*|__|\*[^*\n]+\*|_[^_\n]+_|~~|`|\[[^\]]+\]\([^)]+\)|^\s{0,3}(?:[-+*]|\d+\.)\s+|^\s{0,3}>\s+|^\s{0,3}#{1,6}\s+)/m;

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

type MentionToken = {
    token: string;
    element: React.ReactElement;
    text: string;
};

type MarkdownNode = {
	tagName?: string;
	value?: string;
	children?: MarkdownNode[];
};

interface MessageWithMentionsProps {
    text: string;
    mentions?: string[]; // Display names of mentioned users (from the stored message)
    knownNames?: string[]; // All display names visible in the chat (for old messages / manual mentions)
    users?: Map<string, UserProfileData>;
    currentUserId?: string;
    customEmojis?: CustomEmoji[];
    renderLinks?: boolean;
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
    renderLinks = true,
}: MessageWithMentionsProps) {
    const allMatches = findMentionSpans(text, mentions, knownNames);
    const mentionTokens = createMentionTokens({
        text,
        matches: allMatches,
        users,
        currentUserId,
    });
    const textWithTokens = injectMentionTokens(text, allMatches, mentionTokens);

    return (
        <div className="min-w-0">
            {renderMessageText({
                customEmojis,
                mentionTokens,
                renderLinks,
                text: textWithTokens,
            })}
        </div>
    );
}

function hasMarkdownSyntax(text: string): boolean {
    return MARKDOWN_PATTERN.test(text);
}

function sanitizeLinkHref(href: string | undefined): string | null {
    if (!href) {
        return null;
    }

    const normalizedHref = href.trim();

    if (!normalizedHref) {
        return null;
    }

    if (
        normalizedHref.startsWith("/") ||
        normalizedHref.startsWith("#") ||
        normalizedHref.startsWith("?")
    ) {
        return normalizedHref;
    }

    try {
        const parsed = new URL(normalizedHref);
        if (SAFE_LINK_PROTOCOLS.has(parsed.protocol)) {
            return normalizedHref;
        }
    } catch {
        return null;
    }

    return null;
}

function renderMessageText({
    text,
    customEmojis,
    mentionTokens,
    renderLinks,
}: {
    text: string;
    customEmojis: CustomEmoji[];
    mentionTokens: MentionToken[];
    renderLinks: boolean;
}) {
    if (!hasMarkdownSyntax(text)) {
        return renderDecoratedText({ text, customEmojis, mentionTokens });
    }

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
                p: ({ children }) => (
                    <p className="my-1 first:mt-0 last:mb-0">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </p>
                ),
                strong: ({ children }) => (
                    <strong className="font-semibold">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </strong>
                ),
                em: ({ children }) => (
                    <em className="italic">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </em>
                ),
                del: ({ children }) => (
                    <del className="opacity-80">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </del>
                ),
                ul: ({ children }) => (
                    <ul className="my-1 list-disc pl-5">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </ul>
                ),
                ol: ({ children }) => (
                    <ol className="my-1 list-decimal pl-5">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </ol>
                ),
                li: ({ children }) => (
                    <li>
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </li>
                ),
                blockquote: ({ children }) => (
                    <blockquote className="my-1 border-l-2 border-border/70 pl-3 text-muted-foreground">
                        {renderMarkdownChildren({
                            children,
                            customEmojis,
                            mentionTokens,
                        })}
                    </blockquote>
                ),
                code: ({ children, className, node }) => (
                    <code className={className}>
                        {restoreMentionTokens(extractMarkdownNodeText(node),
                            mentionTokens,
                        ) ||
                            restoreMentionTokensToText({
                                children,
                                mentionTokens,
                            })}
                    </code>
                ),
                pre: ({ children, node }) => (
                    <pre className="my-1 overflow-x-auto rounded-md border border-border/70 bg-muted/60 p-2 text-xs leading-5">
                        {restoreMentionTokens(extractMarkdownNodeText(node),
                            mentionTokens,
                        ) ||
                            restoreMentionTokensToText({
                                children,
                                mentionTokens,
                            })}
                    </pre>
                ),
                a: ({ children, href }) => {
                    const safeHref = sanitizeLinkHref(href);

                    if (!safeHref || !renderLinks) {
                        return (
                            <span>
                                {renderMarkdownChildren({
                                    children,
                                    customEmojis,
                                    mentionTokens,
                                })}
                            </span>
                        );
                    }

                    const isExternal =
                        safeHref.startsWith("http://") ||
                        safeHref.startsWith("https://");

                    return (
                        <a
                            className="font-medium text-primary underline underline-offset-4"
                            href={safeHref}
                            rel={isExternal ? "noopener noreferrer" : undefined}
                            target={isExternal ? "_blank" : undefined}
                        >
                            {renderMarkdownChildren({
                                children,
                                customEmojis,
                                mentionTokens,
                            })}
                        </a>
                    );
                },
                img: ({ alt }) => (
                    <span className="italic text-muted-foreground">
                        [{alt || "image"}]
                    </span>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

function renderMarkdownChildren({
    children,
    customEmojis,
    mentionTokens,
}: {
    children: React.ReactNode;
    customEmojis: CustomEmoji[];
    mentionTokens: MentionToken[];
}): React.ReactNode {
    return Children.map(children, (child) => {
        if (typeof child === "string" || typeof child === "number") {
            return renderDecoratedText({
                text: String(child),
                customEmojis,
                mentionTokens,
            });
        }

        if (
            isValidElement<{ children?: React.ReactNode; node?: MarkdownNode }>(child) &&
            child.props.children !== undefined
        ) {
            const tagName = child.props.node?.tagName;

            if (
                tagName === "code" ||
                tagName === "pre"
            ) {
                return cloneElement(
                    child,
                    undefined,
                    restoreMentionTokensToText({
                        children: child.props.children,
                        mentionTokens,
                    }),
                );
            }

            return cloneElement(
                child,
                undefined,
                renderMarkdownChildren({
                    children: child.props.children,
                    customEmojis,
                    mentionTokens,
                }),
            );
        }

        return child;
    });
}

function renderDecoratedText({
    text,
    customEmojis,
    mentionTokens,
}: {
    text: string;
    customEmojis: CustomEmoji[];
    mentionTokens: MentionToken[];
}): React.ReactNode {
    if (mentionTokens.length === 0) {
        return <EmojiRenderer text={text} customEmojis={customEmojis} />;
    }

    const parts: React.ReactNode[] = [];
    let cursor = 0;

    while (cursor < text.length) {
        let nextMatch:
            | {
                  token: string;
                  index: number;
                  element: React.ReactElement;
              }
            | null = null;

        for (const mentionToken of mentionTokens) {
            const tokenIndex = text.indexOf(mentionToken.token, cursor);
            if (tokenIndex === -1) {
                continue;
            }

            if (!nextMatch || tokenIndex < nextMatch.index) {
                nextMatch = {
                    token: mentionToken.token,
                    index: tokenIndex,
                    element: mentionToken.element,
                };
            }
        }

        if (!nextMatch) {
            parts.push(
                <EmojiRenderer
                    key={`text-${cursor}`}
                    text={text.substring(cursor)}
                    customEmojis={customEmojis}
                />,
            );
            break;
        }

        if (nextMatch.index > cursor) {
            parts.push(
                <EmojiRenderer
                    key={`text-${cursor}`}
                    text={text.substring(cursor, nextMatch.index)}
                    customEmojis={customEmojis}
                />,
            );
        }

        parts.push(
            cloneElement(nextMatch.element, {
                key: `mention-${nextMatch.index}`,
            }),
        );

        cursor = nextMatch.index + nextMatch.token.length;
    }

    return <>{parts}</>;
}

function restoreMentionTokensToText({
    children,
    mentionTokens,
}: {
    children: React.ReactNode;
    mentionTokens: MentionToken[];
}): string {
    let restoredText = "";

    Children.forEach(children, (child) => {
        if (typeof child === "string" || typeof child === "number") {
            restoredText += restoreMentionTokens(String(child), mentionTokens);
            return;
        }

        if (
            isValidElement<{ children?: React.ReactNode }>(child) &&
            child.props.children !== undefined
        ) {
            restoredText += restoreMentionTokensToText({
                children: child.props.children,
                mentionTokens,
            });
        }
    });

    return restoredText;
}

function extractMarkdownNodeText(node: MarkdownNode | undefined): string {
    if (!node) {
        return "";
    }

    if (typeof node.value === "string") {
        return node.value;
    }

    if (!node.children || node.children.length === 0) {
        return "";
    }

    let text = "";
    for (const child of node.children) {
        text += extractMarkdownNodeText(child);
    }

    return text;
}

function restoreMentionTokens(
    text: string,
    mentionTokens: MentionToken[],
): string {
    let restoredText = text;

    for (const mentionToken of mentionTokens) {
        restoredText = restoredText.split(mentionToken.token).join(mentionToken.text);
    }

    return restoredText;
}

function createMentionTokens({
    text,
    matches,
    users,
    currentUserId,
}: {
    text: string;
    matches: MentionMatch[];
    users: Map<string, UserProfileData>;
    currentUserId?: string;
}): MentionToken[] {
    return matches.map((match, index) => {
        const mentionedUser = Array.from(users.values()).find((u) => {
            const displayName = u.displayName || "";
            return displayName.toLowerCase() === match.username.toLowerCase();
        });

        const isSelf = mentionedUser?.userId === currentUserId;
        const token = createMentionToken(text, index);

        return {
            token,
            text: match.fullMatch,
            element: (
                <span
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
                </span>
            ),
        };
    });
}

function createMentionToken(text: string, index: number): string {
    let token = `FIREPITMENTIONTOKEN${index}X`;
    while (text.includes(token)) {
        token = `${token}X`;
    }
    return token;
}

function injectMentionTokens(
    text: string,
    matches: MentionMatch[],
    mentionTokens: MentionToken[],
): string {
    if (matches.length === 0) {
        return text;
    }

    const parts: string[] = [];
    let lastIndex = 0;

    for (const [index, match] of matches.entries()) {
        if (match.startIndex > lastIndex) {
            parts.push(text.substring(lastIndex, match.startIndex));
        }

        parts.push(mentionTokens.at(index)?.token || match.fullMatch);
        lastIndex = match.endIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts.join("");
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
