import React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/use-theme";

type Reaction = {
  emoji: string;
  count: number;
  reactedByMe?: boolean;
};

export function ReactionButton({
  reaction,
  customEmojiUrls,
  onToggle,
}: {
  reaction: Reaction;
  customEmojiUrls?: Record<string, string>;
  onToggle: (emoji: string, adding: boolean) => void;
}) {
  const colors = useTheme();
  const isCustomEmoji = reaction.emoji.startsWith(":") && reaction.emoji.endsWith(":");
  const emojiName = isCustomEmoji ? reaction.emoji.slice(1, -1).toLowerCase() : reaction.emoji;

  const emojiUrl = isCustomEmoji
    ? customEmojiUrls?.[emojiName]
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${reaction.emoji} reaction, ${reaction.count}`}
      accessibilityState={{ selected: Boolean(reaction.reactedByMe) }}
      onPress={() => onToggle(reaction.emoji, !reaction.reactedByMe)}
      style={{
        padding: 6,
        borderRadius: 8,
        backgroundColor: reaction.reactedByMe
          ? colors.accentSoft || "rgba(217,121,43,0.15)"
          : colors.backgroundElement || "rgba(128,128,128,0.08)",
        marginRight: 6,
        borderWidth: reaction.reactedByMe ? 1 : 0,
        borderColor: reaction.reactedByMe ? colors.border : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {isCustomEmoji && emojiUrl ? (
          <Image
            source={{ uri: emojiUrl }}
            style={{ width: 18, height: 18, marginRight: 6 }}
            contentFit="contain"
          />
        ) : (
          <Text style={{ fontSize: 14 }}>{reaction.emoji}</Text>
        )}
        <Text style={{ color: colors.textSecondary, marginLeft: 2 }}>{reaction.count}</Text>
      </View>
    </Pressable>
  );
}

export default ReactionButton;
