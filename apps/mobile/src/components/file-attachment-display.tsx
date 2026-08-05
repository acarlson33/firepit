import { useCallback } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";

import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type FileAttachment = {
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  downloadUrl?: string;
  mediaKind?: "generic" | "image" | "gif" | "sticker";
  source?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  packId?: string;
  itemId?: string;
};

function getFileCategory(fileType?: string): string {
  if (!fileType) return "generic";
  if (fileType.startsWith("image/")) return "image";
  if (fileType.startsWith("video/")) return "video";
  if (fileType.startsWith("audio/")) return "audio";
  return "generic";
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

type Props = {
  attachment: FileAttachment;
  onPress?: (url: string) => void;
};

export function FileAttachmentDisplay({ attachment, onPress }: Props) {
  const theme = useTheme();
  const category = getFileCategory(attachment.fileType);
  const size = formatFileSize(attachment.fileSize);
  const url = attachment.fileUrl || attachment.downloadUrl;

  const handlePress = useCallback(() => {
    if (!url) return;
    if (onPress) {
      onPress(url);
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    Linking.openURL(url).catch(() => {});
  }, [url, onPress]);

  // Image / GIF / Sticker — render inline with expo-image
  const isImage =
    category === "image" ||
    attachment.mediaKind === "image" ||
    attachment.mediaKind === "gif" ||
    attachment.mediaKind === "sticker";

  if (isImage && url) {
    const isGif = attachment.mediaKind === "gif" || attachment.fileType === "image/gif";
    return (
      <View style={styles.imageContainer}>
        <Pressable onPress={handlePress}>
          <Image
            source={{ uri: url }}
            style={isGif ? styles.gifImage : styles.inlineImage}
            contentFit="cover"
          />
        </Pressable>
        <View style={styles.imageMeta}>
          <Text
            style={[styles.metaText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {attachment.fileName || (isGif ? "GIF" : "Image")}
          </Text>
          <Text style={[styles.metaText, { color: theme.mutedForeground, fontSize: 11 }]}>
            {isGif ? "GIF" : size}
          </Text>
        </View>
      </View>
    );
  }

  // Video — thumbnail with play indicator
  if (category === "video") {
    return (
      <View style={styles.mediaContainer}>
        <Pressable
          onPress={handlePress}
          style={[styles.videoThumbContainer, { borderColor: theme.border }]}
        >
          {attachment.thumbnailUrl ? (
            <Image
              source={{ uri: attachment.thumbnailUrl }}
              style={styles.videoThumb}
              contentFit="cover"
            />
          ) : (
            <ThemedView style={styles.videoPlaceholder}>
              <Text style={{ fontSize: 28 }}>▶</Text>
            </ThemedView>
          )}
          <View style={styles.playOverlay}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </Pressable>
        <View style={styles.imageMeta}>
          <Text
            style={[styles.metaText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {attachment.fileName || "Video"}
          </Text>
          {size ? (
            <Text style={[styles.metaText, { color: theme.mutedForeground, fontSize: 11 }]}>
              {size}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  // Audio — compact player card
  if (category === "audio") {
    return (
      <ThemedView
        style={[
          styles.audioContainer,
          { borderColor: theme.border, backgroundColor: theme.card },
        ]}
      >
        <View style={[styles.audioIcon, { backgroundColor: theme.muted }]}>
          <Text>🎵</Text>
        </View>
        <View style={styles.audioInfo}>
          <Text
            style={[styles.metaText, { color: theme.text }]}
            numberOfLines={1}
          >
            {attachment.fileName || "Audio"}
          </Text>
          {size ? (
            <Text style={[styles.metaText, { color: theme.mutedForeground, fontSize: 11 }]}>
              {size}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={handlePress} style={styles.audioDownloadBtn}>
          <Text style={{ color: theme.primary, fontSize: 18 }}>⬇</Text>
        </Pressable>
      </ThemedView>
    );
  }

  // Generic file — download card
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.fileCard,
        {
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.fileIcon, { backgroundColor: theme.muted }]}>
        <Text style={{ color: theme.mutedForeground, fontSize: 14, fontWeight: "700" }}>
          {(attachment.fileName?.split(".").pop() ?? "FILE").toUpperCase()}
        </Text>
      </View>
      <View style={styles.fileInfo}>
        <Text
          style={[styles.metaText, { color: theme.text }]}
          numberOfLines={1}
        >
          {attachment.fileName || "File"}
        </Text>
        {size ? (
          <Text style={[styles.metaText, { color: theme.mutedForeground, fontSize: 11 }]}>
            {size}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.primary, fontSize: 20 }}>⬇</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    marginTop: Spacing.half,
    maxWidth: 260,
  },
  inlineImage: {
    width: 220,
    height: 165,
    borderRadius: 8,
  },
  gifImage: {
    width: 220,
    height: 180,
    borderRadius: 8,
  },
  imageMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    gap: Spacing.one,
  },
  mediaContainer: {
    marginTop: Spacing.half,
    maxWidth: 260,
  },
  videoThumbContainer: {
    width: 220,
    height: 140,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
  },
  videoThumb: {
    width: "100%",
    height: "100%",
  },
  videoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 32,
    color: "#fff",
  },
  audioContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.half,
  },
  audioIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  audioInfo: {
    flex: 1,
    gap: 2,
  },
  audioDownloadBtn: {
    padding: Spacing.one,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.half,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  metaText: {
    fontSize: 13,
  },
});
