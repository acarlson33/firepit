import React, { memo } from "react";
import { Text, Image } from "react-native";
import * as emoji from "node-emoji";

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
 * Renders text with custom emoji and standard emoji support for React Native.
 * Converts :emoji-name: syntax to custom emoji images or standard Unicode emojis.
 */
export const EmojiRenderer = memo(function EmojiRenderer({
  text,
  customEmojis = [],
}: EmojiRendererProps) {
  const emojiPattern = /:([a-zA-Z0-9_+-]+):/g;
  const parts: Array<string | React.ReactElement> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = emojiPattern.exec(text)) !== null) {
    const [fullMatch, emojiName] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    const customEmoji = customEmojis.find((e) => e.name === emojiName);

    if (customEmoji) {
      parts.push(
        <Image
          key={`${customEmoji.fileId}-${matchIndex}`}
          source={{ uri: customEmoji.url }}
          style={{ width: 16, height: 16 }}
        />,
      );
    } else {
      const standardEmoji = emoji.get(emojiName);
      if (standardEmoji && standardEmoji !== `:${emojiName}:`) {
        parts.push(standardEmoji);
      } else {
        parts.push(fullMatch);
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <Text>
      {parts.map((part, i) =>
        typeof part === "string"
          ? part
          : React.cloneElement(part as React.ReactElement, { key: `e-${i}` }),
      )}
    </Text>
  );
});

export default EmojiRenderer;
