"use client";

import { memo } from "react";

type CustomEmoji = {
  fileId: string;
  url: string;
  name: string;
};

type EmojiRendererProps = {
  text: string;
  customEmojis?: CustomEmoji[];
};

/**
 * Renders text with custom emoji support.
 * Converts :emoji-name: syntax to custom emoji images.
 */
export const EmojiRenderer = memo(function EmojiRenderer({
  text,
  customEmojis = [],
}: EmojiRendererProps) {
  if (customEmojis.length === 0) {
    return <span>{text}</span>;
  }

  // Match custom emoji syntax :emoji-name:
  const emojiPattern = /:([a-zA-Z0-9_-]+):/g;
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

    // Find matching custom emoji
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
        />
      );
    } else {
      // Not found, keep original text
      parts.push(fullMatch);
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span>{parts}</span>;
});
