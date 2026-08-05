import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EmojiPicker, emojiData } from "@hiraku-ai/react-native-emoji-picker";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/use-theme";

type CustomEmojiType = {
  fileId: string;
  url: string;
  name: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  customEmojis?: CustomEmojiType[];
};

export default function EmojiPickerSheet({
  visible,
  onClose,
  onSelect,
  customEmojis,
}: Props) {
  const theme = useTheme();
  const hasCustom = customEmojis && customEmojis.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.container,
            { backgroundColor: theme.background, borderTopColor: theme.border },
          ]}
        >
          <EmojiPicker
            emojis={emojiData}
            onEmojiSelect={(emoji: string) => {
              onSelect(emoji);
              onClose();
            }}
            onClose={onClose}
            showSearchBar
            showTabs
            showSkinToneSelector
            columns={8}
            searchPlaceholder="Search emoji..."
            containerStyle={{ flex: 1, backgroundColor: theme.background }}
            tabsContainerStyle={{ borderBottomColor: theme.border }}
            tabStyle={{ backgroundColor: theme.muted, borderRadius: 8 }}
          />

          {hasCustom && (
            <View style={[styles.customRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.customLabel, { color: theme.mutedForeground }]}>
                Server
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.customScroll}
              >
                {customEmojis.map((ce) => (
                  <Pressable
                    key={ce.fileId}
                    onPress={() => {
                      onSelect(`:${ce.name}:`);
                      onClose();
                    }}
                    style={styles.customBtn}
                  >
                    <Image
                      source={{ uri: ce.url }}
                      style={styles.customImg}
                      contentFit="contain"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  container: {
    height: 460,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  customRow: {
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  customLabel: {
    fontSize: 11,
    fontWeight: "600",
    paddingLeft: 12,
    paddingBottom: 4,
  },
  customScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  customBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  customImg: {
    width: 28,
    height: 28,
  },
});
