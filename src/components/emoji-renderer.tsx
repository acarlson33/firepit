"use client";

import { memo } from "react";
import * as emoji from "node-emoji";
import type { CustomEmoji } from "@/lib/types";

type EmojiRendererProps = {
  text: string;
  customEmojis?: CustomEmoji[];
};

/**
 * Renders text with custom emoji and standard emoji support.
 * Converts :emoji-name: syntax to custom emoji images or standard Unicode emojis.
 */
export const EmojiRenderer = memo(function EmojiRenderer({
  text,
  customEmojis = [],
}: EmojiRendererProps) {
  // Match emoji syntax :emoji-name:
  const emojiPattern = /:([a-zA-Z0-9_+-]+):/g;
  const parts: Array<string | React.JSX.Element> = [];
  let lastIndex = 0;
  let match;

  while ((match = emojiPattern.exec(text)) !== null) {
    const [fullMatch, emojiName] = match;
    const matchIndex = match.index;

    // Add text before the emoji
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    // First, try to find matching custom emoji
    const customEmoji = customEmojis.find((e) => e.name === emojiName);

    if (customEmoji) {
      // Render as custom emoji image
      parts.push(
        <img
          key={`${customEmoji.fileId}-${matchIndex}`}
          src={customEmoji.url}
          alt={`:${emojiName}:`}
          title={`:${emojiName}:`}
          className="inline-block size-5 align-middle"
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
        />
      );
    } else {
      // Try to convert to standard emoji using node-emoji
      const standardEmoji = emoji.get(emojiName);
      
      if (standardEmoji && standardEmoji !== `:${emojiName}:`) {
        // Found a standard emoji, render as Unicode character
        parts.push(standardEmoji);
      } else {
        // Not found in either custom or standard, keep original text
        parts.push(fullMatch);
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span>{parts}</span>;
});
