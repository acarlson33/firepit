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
  users: MentionableUser[];
  roles: MentionableRole[];
  onSelect: (item: MentionableItem | null) => void;
  isLoading?: boolean;
  canMentionEveryone?: boolean;
  selectedIndex?: number;
};

export function MentionAutocomplete({
  users,
  roles,
  onSelect,
  isLoading,
  canMentionEveryone,
  selectedIndex,
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
          keyExtractor={(it) =>
            it.type === "role"
              ? `role-${it.id}`
              : it.type === "all"
                ? "all"
                : `user-${it.userId}`
          }
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
