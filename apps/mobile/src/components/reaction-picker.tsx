import React from "react";
import { View, Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/use-theme";

const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

export function ReactionPicker({ onSelectEmoji }: { onSelectEmoji: (emoji: string) => void }) {
  const colors = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {DEFAULT_EMOJIS.map((e) => (
        <Pressable key={e} onPress={() => onSelectEmoji(e)} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18 }}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default ReactionPicker;
