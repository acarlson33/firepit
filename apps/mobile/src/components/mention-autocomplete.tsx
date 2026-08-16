import React from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";

type MentionableRole = {
  readonly type: "role";
  id: string;
  name: string;
  color: string;
  mentionable: boolean;
  memberCount: number;
};

type MentionAutocompleteProps = {
  query: string;
  users: any[];
  roles: MentionableRole[];
  onSelect: (item: any | null) => void;
  onClose?: () => void;
  isLoading?: boolean;
  canMentionEveryone?: boolean;
  keyboardHeight?: number;
};

export function MentionAutocomplete({
  query,
  users,
  roles,
  onSelect,
  onClose,
  isLoading,
  canMentionEveryone,
  keyboardHeight,
}: MentionAutocompleteProps) {
  const colors = useTheme();

  const items = [
    ...(canMentionEveryone ? [{ special: "all" }] : []),
    ...roles,
    ...users,
  ];

  return (
    <View
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: (keyboardHeight ?? 48) + 8,
        backgroundColor: colors.popover,
        borderWidth: 1,
        borderColor: colors.border,
        maxHeight: 220,
        zIndex: 50,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {isLoading ? (
        <View style={{ padding: 12 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, idx) => (it.id ? String(it.id) : `s-${idx}`)}
          renderItem={({ item }) => {
            if ((item as any).special === "all") {
              return (
                <Pressable
                  onPress={() => onSelect(null)}
                  style={{ padding: 12 }}
                >
                  <Text style={{ color: colors.text }}>@all</Text>
                </Pressable>
              );
            }

            if ((item as any).type === "role") {
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={{ padding: 12 }}
                >
                  <Text style={{ color: colors.text }}>@{item.name}</Text>
                </Pressable>
              );
            }

            return (
              <Pressable onPress={() => onSelect(item)} style={{ padding: 12 }}>
                <Text style={{ color: colors.text }}>
                  {item.displayName || item.userId}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

export default MentionAutocomplete;
