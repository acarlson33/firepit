import React, { useCallback } from "react";
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

type MentionableUser = {
  userId: string;
  displayName?: string;
  type?: "user";
};

type MentionableItem =
  | { readonly type: "all" }
  | MentionableRole
  | MentionableUser;

type MentionAutocompleteProps = {
  query: string;
  users: MentionableUser[];
  roles: MentionableRole[];
  onSelect: (item: MentionableItem | null) => void;
  onClose?: () => void;
  isLoading?: boolean;
  canMentionEveryone?: boolean;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
};

export function MentionAutocomplete({
  query,
  users,
  roles,
  onSelect,
  onClose,
  isLoading,
  canMentionEveryone,
  selectedIndex,
  onSelectedIndexChange,
}: MentionAutocompleteProps) {
  const colors = useTheme();

  const items: MentionableItem[] = [
    ...(canMentionEveryone ? [{ type: "all" as const }] : []),
    ...roles,
    ...users,
  ];

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
      {isLoading ? (
        <View style={{ padding: 12 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, idx) => (it.type === "role" ? it.id : `s-${idx}`)}
          renderItem={({ item, index }) => {
            const isSelected = index === selectedIndex;

            if (item.type === "all") {
              return (
                <Pressable
                  onPress={() => onSelect(null)}
                  style={{
                    padding: 12,
                    backgroundColor: isSelected ? colors.muted : "transparent",
                  }}
                >
                  <Text style={{ color: colors.text }}>@all</Text>
                </Pressable>
              );
            }

            if (item.type === "role") {
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={{
                    padding: 12,
                    backgroundColor: isSelected ? colors.muted : "transparent",
                  }}
                >
                  <Text style={{ color: colors.text }}>@{item.name}</Text>
                </Pressable>
              );
            }

            return (
              <Pressable
                onPress={() => onSelect(item)}
                style={{
                  padding: 12,
                  backgroundColor: isSelected ? colors.muted : "transparent",
                }}
              >
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
