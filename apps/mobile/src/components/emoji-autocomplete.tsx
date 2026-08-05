import React, { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";

export type AutocompleteEmoji = {
  shortcode: string;
  unicode?: string;
  customUrl?: string;
};

export function filterEmojis(
  query: string,
  standardEmojis: Record<string, string>,
  customEmojis: AutocompleteEmoji[],
): AutocompleteEmoji[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    return [
      ...customEmojis.slice(0, 20),
      ...Object.entries(standardEmojis).slice(0, 20).map(([shortcode, unicode]) => ({ shortcode, unicode })),
    ];
  }

  const custom: AutocompleteEmoji[] = customEmojis
    .filter((e) => e.shortcode.toLowerCase().includes(q))
    .slice(0, 10)
    .map((e) => ({ shortcode: e.shortcode, unicode: e.unicode, customUrl: e.customUrl }));

  const standard: AutocompleteEmoji[] = Object.entries(standardEmojis)
    .filter(([shortcode]) => shortcode.toLowerCase().includes(q))
    .slice(0, 10)
    .map(([shortcode, unicode]) => ({ shortcode, unicode }));

  return [...custom, ...standard];
}

type EmojiAutocompleteProps = {
  query: string;
  standardEmojis: Record<string, string>;
  customEmojis: AutocompleteEmoji[];
  onSelect: (emoji: AutocompleteEmoji) => void;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
};

export function EmojiAutocomplete({
  query,
  standardEmojis,
  customEmojis,
  onSelect,
  selectedIndex,
  onSelectedIndexChange,
}: EmojiAutocompleteProps) {
  const colors = useTheme();

  const items = useMemo(
    () => filterEmojis(query, standardEmojis, customEmojis),
    [query, standardEmojis, customEmojis],
  );

  if (items.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: colors.popover,
        borderWidth: 1,
        borderColor: colors.border,
        maxHeight: 220,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      <FlatList
        data={items}
        keyExtractor={(item, idx) => `${item.shortcode}-${idx}`}
        renderItem={({ item, index }) => {
          const isSelected = index === selectedIndex;
          return (
            <Pressable
              onPress={() => onSelect(item)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: isSelected
                  ? colors.muted
                  : pressed
                    ? colors.muted
                    : "transparent",
              })}
          >
            {item.customUrl ? (
              <Image
                source={{ uri: item.customUrl }}
                style={{ width: 22, height: 22 }}
              />
            ) : (
              <Text style={{ fontSize: 22 }}>{item.unicode}</Text>
            )}
            <Text style={{ color: colors.text, fontSize: 14 }}>
              :{item.shortcode}:
            </Text>
          </Pressable>
          );
        }}
      />
    </View>
  );
}

export default EmojiAutocomplete;
