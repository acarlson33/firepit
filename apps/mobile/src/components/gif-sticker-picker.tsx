import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Search, Film, Sticker } from "lucide-react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { authHeaders } from "@/lib/firepit/http";
import { useTheme } from "@/hooks/use-theme";
import type { FileAttachment } from "@/components/file-attachment-display";

const DEFAULT_GIF_QUERY = "trending";
const GIF_PAGE_SIZE = 24;
const REQUEST_TIMEOUT_MS = 15000;

type PickerMode = "gifs" | "stickers";

type GifSearchItem = {
  id: string;
  title: string;
  gifUrl: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  source: string;
};

type StickerItem = {
  id: string;
  name: string;
  mediaUrl: string;
  previewUrl?: string;
  source: string;
  packId: string;
};

type StickerPack = {
  id: string;
  name: string;
  description?: string;
  source: string;
  items: StickerItem[];
};

type GifSearchResponse = {
  items?: GifSearchItem[];
  next?: string;
};

type StickerResponse = {
  packs?: StickerPack[];
};

type Props = {
  instanceUrl: string;
  accessToken: string;
  visible: boolean;
  onClose: () => void;
  onSelectAttachment: (attachment: FileAttachment) => void;
};

function toSafeFileBaseName(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "gif";
  const sanitized = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return sanitized || "gif";
}

function inferImageMimeType(url: string): string {
  const normalized = url.toLowerCase();
  if (/\.gif$/.test(normalized)) return "image/gif";
  if (/\.webp$/.test(normalized)) return "image/webp";
  if (/\.jpe?g$/.test(normalized)) return "image/jpeg";
  return "image/png";
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/gif": return "gif";
    case "image/webp": return "webp";
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    default: return "gif";
  }
}

function toGifAttachment(item: GifSearchItem): FileAttachment {
  const fileType = inferImageMimeType(item.gifUrl);
  const ext = mimeTypeToExtension(fileType);
  const safeTitle = toSafeFileBaseName(item.title);
  return {
    fileId: `${item.source}-${item.id}`,
    fileName: `${safeTitle}.${ext}`,
    fileSize: 0,
    fileType,
    fileUrl: item.gifUrl,
    thumbnailUrl: item.previewUrl,
    previewUrl: item.previewUrl,
    mediaKind: "gif",
    source: item.source,
  };
}

function toStickerAttachment(item: StickerItem): FileAttachment {
  const fileType = inferImageMimeType(item.mediaUrl);
  return {
    fileId: `sticker-${item.packId}-${item.id}`,
    fileName: `${toSafeFileBaseName(item.name || item.id)}.sticker`,
    fileSize: 0,
    fileType,
    fileUrl: item.mediaUrl,
    thumbnailUrl: item.previewUrl,
    previewUrl: item.previewUrl,
    mediaKind: "sticker",
    source: item.source,
    packId: item.packId,
    itemId: item.id,
  };
}

export function GifStickerPicker({
  instanceUrl,
  accessToken,
  visible,
  onClose,
  onSelectAttachment,
}: Props) {
  const theme = useTheme();
  const [mode, setMode] = useState<PickerMode>("gifs");
  const [query, setQuery] = useState("");
  const gifSearchQueryRef = useRef(DEFAULT_GIF_QUERY);
  const gifControllerRef = useRef<AbortController | null>(null);
  const stickerControllerRef = useRef<AbortController | null>(null);

  const [gifResults, setGifResults] = useState<GifSearchItem[]>([]);
  const [gifNextCursor, setGifNextCursor] = useState<string | undefined>();
  const [gifLoading, setGifLoading] = useState(false);
  const [gifLoadingMore, setGifLoadingMore] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);

  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [stickerLoading, setStickerLoading] = useState(false);
  const [stickerError, setStickerError] = useState<string | null>(null);

  const fetchGifs = useCallback(
    async (options?: { append?: boolean; cursor?: string; query?: string }) => {
      const append = options?.append === true;
      const cursor = options?.cursor;
      const searchQuery = options?.query?.trim() || gifSearchQueryRef.current || DEFAULT_GIF_QUERY;

      if (append) {
        setGifLoadingMore(true);
      } else {
        setGifLoading(true);
        setGifError(null);
      }

      gifControllerRef.current?.abort();
      const controller = new AbortController();
      gifControllerRef.current = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const params = new URLSearchParams({ q: searchQuery, limit: String(GIF_PAGE_SIZE) });
        if (cursor) params.set("cursor", cursor);

        const response = await fetch(
          `${instanceUrl}/api/gifs/search?${params.toString()}`,
          {
            headers: authHeaders(accessToken),
            signal: controller.signal,
          },
        );

        if (response.status === 404) {
          setGifResults([]);
          setGifNextCursor(undefined);
          setGifError("GIF search is not enabled.");
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || "Failed to search GIFs");
        }

        const payload = (await response.json()) as GifSearchResponse;
        const items = Array.isArray(payload.items) ? payload.items : [];

        if (!append) gifSearchQueryRef.current = searchQuery;
        setGifResults((prev) => {
          if (!append) return items;
          const seen = new Set(prev.map((it) => `${it.source}-${it.id}`));
          return [...prev, ...items.filter((it) => !seen.has(`${it.source}-${it.id}`))];
        });
        setGifNextCursor(payload.next);
        setGifError(null);
      } catch (err) {
        if (controller.signal.aborted) {
          if (timedOut) setGifError("Request timed out.");
          return;
        }
        setGifError(err instanceof Error ? err.message : "Failed to search GIFs");
        if (!append) {
          setGifResults([]);
          setGifNextCursor(undefined);
        }
      } finally {
        clearTimeout(timeout);
        if (gifControllerRef.current === controller) {
          gifControllerRef.current = null;
        }
        setGifLoading(false);
        setGifLoadingMore(false);
      }
    },
    [instanceUrl, accessToken],
  );

  const fetchStickers = useCallback(async () => {
    setStickerLoading(true);
    setStickerError(null);

    stickerControllerRef.current?.abort();
    const controller = new AbortController();
    stickerControllerRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${instanceUrl}/api/stickers`, {
        headers: authHeaders(accessToken),
        signal: controller.signal,
      });

      if (response.status === 404) {
        setStickerPacks([]);
        setStickerError("Stickers are not enabled.");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Failed to load stickers");
      }

      const payload = (await response.json()) as StickerResponse;
      setStickerPacks(Array.isArray(payload.packs) ? payload.packs : []);
      setStickerError(null);
    } catch (err) {
      if (controller.signal.aborted) {
        if (timedOut) setStickerError("Request timed out.");
        return;
      }
      setStickerError(err instanceof Error ? err.message : "Failed to load stickers");
      setStickerPacks([]);
    } finally {
      clearTimeout(timeout);
      if (stickerControllerRef.current === controller) {
        stickerControllerRef.current = null;
      }
      setStickerLoading(false);
    }
  }, [instanceUrl, accessToken]);

  useEffect(() => {
    if (!visible) return;
    if (mode === "gifs") {
      void fetchGifs();
    } else {
      void fetchStickers();
    }
  }, [visible, mode, fetchGifs, fetchStickers]);

  useEffect(() => {
    return () => {
      gifControllerRef.current?.abort();
      stickerControllerRef.current?.abort();
    };
  }, [visible, mode]);

  const handleSelect = useCallback(
    (attachment: FileAttachment) => {
      onSelectAttachment(attachment);
      onClose();
    },
    [onSelectAttachment, onClose],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredStickerPacks = normalizedQuery
    ? stickerPacks
        .map((pack) => ({
          ...pack,
          items: pack.items.filter(
            (item) =>
              item.name?.toLowerCase().includes(normalizedQuery),
          ),
        }))
        .filter((pack) => pack.items.length > 0)
    : stickerPacks;

  const renderGifItem = useCallback(
    ({ item }: { item: GifSearchItem }) => (
      <Pressable
        onPress={() => handleSelect(toGifAttachment(item))}
        style={({ pressed }) => ({
          flex: 1,
          margin: 4,
          borderRadius: 8,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.muted,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Image
          source={{ uri: item.previewUrl || item.gifUrl }}
          style={{ width: "100%", aspectRatio: 1 }}
          contentFit="cover"
        />
        {item.title ? (
          <Text
            style={{
              fontSize: 11,
              color: theme.mutedForeground,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
        ) : null}
      </Pressable>
    ),
    [handleSelect, theme],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="title" style={{ flex: 1 }}>
            GIFs & Stickers
          </ThemedText>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <ThemedText type="default">Close</ThemedText>
          </Pressable>
        </View>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setMode("gifs")}
            style={[
              styles.tab,
              {
                backgroundColor: mode === "gifs" ? theme.primary : "transparent",
                borderColor: theme.border,
              },
            ]}
          >
            <Film size={14} color={mode === "gifs" ? "#fff" : theme.foreground} />
            <ThemedText
              type="small"
              style={{ color: mode === "gifs" ? "#fff" : theme.foreground, marginLeft: 6 }}
            >
              GIFs
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setMode("stickers")}
            style={[
              styles.tab,
              {
                backgroundColor: mode === "stickers" ? theme.primary : "transparent",
                borderColor: theme.border,
              },
            ]}
          >
            <Sticker size={14} color={mode === "stickers" ? "#fff" : theme.foreground} />
            <ThemedText
              type="small"
              style={{ color: mode === "stickers" ? "#fff" : theme.foreground, marginLeft: 6 }}
            >
              Stickers
            </ThemedText>
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { borderColor: theme.border }]}>
          <Search size={16} color={theme.mutedForeground} />
          <TextInput
            style={[
              styles.searchInput,
              { color: theme.foreground },
            ]}
            placeholder={mode === "gifs" ? "Search GIFs" : "Search stickers"}
            placeholderTextColor={theme.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              if (mode === "gifs") {
                const sq = query.trim() || DEFAULT_GIF_QUERY;
                void fetchGifs({ query: sq });
              }
            }}
            returnKeyType="search"
          />
        </View>

        {/* Content */}
        {mode === "gifs" ? (
          <View style={{ flex: 1 }}>
            {gifLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={theme.foreground} />
              </View>
            ) : gifError ? (
              <View style={styles.centered}>
                <ThemedText type="default" themeColor="mutedForeground">
                  {gifError}
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={gifResults}
                keyExtractor={(item) => `${item.source}-${item.id}`}
                renderItem={renderGifItem}
                numColumns={2}
                columnWrapperStyle={{ paddingHorizontal: Spacing.two }}
                contentContainerStyle={{ paddingBottom: Spacing.four }}
                ListEmptyComponent={
                  <View style={styles.centered}>
                    <ThemedText type="default" themeColor="mutedForeground">
                      No GIFs found.
                    </ThemedText>
                  </View>
                }
                ListFooterComponent={
                  gifNextCursor ? (
                    <Pressable
                      onPress={() =>
                        void fetchGifs({ append: true, cursor: gifNextCursor })
                      }
                      disabled={gifLoadingMore}
                      style={({ pressed }) => ({
                        alignSelf: "center",
                        paddingVertical: Spacing.two,
                        paddingHorizontal: Spacing.three,
                        borderRadius: 999,
                        backgroundColor: theme.muted,
                        opacity: pressed ? 0.8 : 1,
                        marginTop: Spacing.one,
                      })}
                    >
                      {gifLoadingMore ? (
                        <ActivityIndicator color={theme.foreground} size="small" />
                      ) : (
                        <ThemedText type="smallBold">Load more</ThemedText>
                      )}
                    </Pressable>
                  ) : null
                }
              />
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {stickerLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={theme.foreground} />
              </View>
            ) : stickerError ? (
              <View style={styles.centered}>
                <ThemedText type="default" themeColor="mutedForeground">
                  {stickerError}
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={filteredStickerPacks}
                keyExtractor={(pack) => pack.id}
                contentContainerStyle={{ paddingBottom: Spacing.four }}
                ListEmptyComponent={
                  <View style={styles.centered}>
                    <ThemedText type="default" themeColor="mutedForeground">
                      No stickers found.
                    </ThemedText>
                  </View>
                }
                renderItem={({ item: pack }) => (
                  <View style={{ paddingHorizontal: Spacing.two }}>
                    <ThemedText type="smallBold" style={{ marginVertical: Spacing.one }}>
                      {pack.name}
                    </ThemedText>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {pack.items.map((sticker) => (
                        <Pressable
                          key={sticker.id}
                          onPress={() => handleSelect(toStickerAttachment(sticker))}
                          style={({ pressed }) => ({
                            width: "30%",
                            margin: 4,
                            borderRadius: 8,
                            overflow: "hidden",
                            borderWidth: 1,
                            borderColor: theme.border,
                            backgroundColor: theme.muted,
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <Image
                            source={{ uri: sticker.previewUrl || sticker.mediaUrl }}
                            style={{ width: "100%", aspectRatio: 1 }}
                            contentFit="cover"
                          />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        )}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Spacing.six,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.two,
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderWidth: 1,
    borderRadius: 8,
    gap: Spacing.one,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.three,
  },
});
