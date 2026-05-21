import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";

type Reaction = { emoji: string; count: number; reactedByMe?: boolean };

export function ReactionButton({
  reaction,
  onToggle,
}: {
  reaction: Reaction;
  onToggle: (emoji: string, adding: boolean) => void;
}) {
  const colors = useTheme();

  return (
    <Pressable
      onPress={() => onToggle(reaction.emoji, !reaction.reactedByMe)}
      style={{ padding: 6, borderRadius: 8, backgroundColor: colors.backgroundElement, marginRight: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 14 }}>{reaction.emoji}</Text>
        <Text style={{ color: colors.textSecondary, marginLeft: 6 }}>{reaction.count}</Text>
      </View>
    </Pressable>
  );
}

export default ReactionButton;
