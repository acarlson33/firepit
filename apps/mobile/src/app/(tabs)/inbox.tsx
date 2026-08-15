import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type {
  InboxDigestItem,
  InboxDigestResponse,
} from "@/lib/firepit/types";
import { listInboxDigest, markInboxContextRead } from "@/lib/firepit/messages";
import { captureError } from "@/lib/sentry";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { Search } from "lucide-react-native";
import { Users } from "lucide-react-native";

type LoadState = "idle" | "loading" | "ready" | "error";
type Filter = "all" | "mention" | "direct" | "server";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "all" },
  { label: "Mentions", value: "mention" },
  { label: "Direct", value: "direct" },
  { label: "Servers", value: "server" },
];

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function filterItems(items: InboxDigestItem[], filter: Filter): InboxDigestItem[] {
  if (filter === "all") return items;
  if (filter === "mention") return items.filter((i) => i.kind === "mention");
  if (filter === "direct")
    return items.filter((i) => i.contextKind === "conversation");
  if (filter === "server")
    return items.filter((i) => i.contextKind === "channel");
  return items;
}

const INBOX_CACHE_TTL = 30_000;
type InboxCacheEntry = {
  items: InboxDigestItem[];
  totalUnread: number;
  cachedAt: number;
};
const inboxCacheMap = new Map<string, InboxCacheEntry>();

function inboxCacheKey(
  instanceUrl?: string | null,
  accessToken?: string | null,
): string | null {
  return instanceUrl && accessToken ? `${instanceUrl}|${accessToken}` : null;
}

function getInboxCache(
  instanceUrl?: string | null,
  accessToken?: string | null,
): InboxCacheEntry | null {
  const key = inboxCacheKey(instanceUrl, accessToken);
  if (!key) return null;
  const entry = inboxCacheMap.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt >= INBOX_CACHE_TTL) {
    inboxCacheMap.delete(key);
    return null;
  }
  return entry;
}

function setInboxCache(
  instanceUrl: string,
  accessToken: string,
  entry: InboxCacheEntry,
) {
  const key = inboxCacheKey(instanceUrl, accessToken);
  if (key) inboxCacheMap.set(key, entry);
}

function invalidateInboxCache() {
  inboxCacheMap.clear();
}

export default function InboxScreen() {
  const theme = useTheme();
  const { instanceUrl, accessToken, state } = useFirepitBootstrap();
  const canLoad = state === "ready" && !!instanceUrl && !!accessToken;

  const [items, setItems] = useState<InboxDigestItem[]>(
    getInboxCache(instanceUrl, accessToken)?.items ?? [],
  );
  const [totalUnread, setTotalUnread] = useState(
    getInboxCache(instanceUrl, accessToken)?.totalUnread ?? 0,
  );
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const navigateToItem = useCallback((item: InboxDigestItem) => {
    if (instanceUrl && accessToken) {
      void markInboxContextRead(instanceUrl, accessToken, {
        contextId: item.contextId,
        contextKind: item.contextKind,
      })
        .then(() => invalidateInboxCache())
        .catch((e) => {
          captureError(e instanceof Error ? e : new Error(String(e)), {
            context: "inbox:markRead",
            contextId: item.contextId,
            contextKind: item.contextKind,
          });
        });
    }

    if (item.contextKind === "channel" && item.serverId) {
      router.push(
        `/server/messages/${item.serverId}/${item.contextId}?messageId=${item.messageId}` as never,
      );
    } else if (item.contextKind === "conversation") {
      router.push(
        `/dm/${item.contextId}?messageId=${item.messageId}` as never,
      );
    }
  }, [instanceUrl, accessToken]);

  const fetchDigest = useCallback(async () => {
    if (!instanceUrl || !accessToken) return;
    setLoadState("loading");
    setError(null);
    try {
      const res = await listInboxDigest(instanceUrl, accessToken);
      const newItems = res.items ?? [];
      const newTotal = res.totalUnreadCount ?? 0;
      setInboxCache(instanceUrl, accessToken, {
        items: newItems,
        totalUnread: newTotal,
        cachedAt: Date.now(),
      });
      setItems(newItems);
      setTotalUnread(newTotal);
      setLoadState("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load inbox",
      );
      setLoadState("error");
    }
  }, [instanceUrl, accessToken]);

  const loadInbox = useCallback(async () => {
    if (!canLoad) return;
    const cached = getInboxCache(instanceUrl, accessToken);
    if (cached) {
      setItems(cached.items);
      setTotalUnread(cached.totalUnread);
      setLoadState("ready");
      return;
    }
    await fetchDigest();
  }, [canLoad, instanceUrl, accessToken, fetchDigest]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useRetryOnReconnect(loadState === "error", fetchDigest);

  // Drop any cached/rendered inbox data when the instance or session changes
  const prevScopeRef = useRef<string | null>(null);
  useEffect(() => {
    const key = inboxCacheKey(instanceUrl, accessToken);
    if (prevScopeRef.current !== null && key !== prevScopeRef.current) {
      invalidateInboxCache();
      setItems([]);
      setTotalUnread(0);
      setLoadState("idle");
      setError(null);
    }
    prevScopeRef.current = key;
  }, [instanceUrl, accessToken]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateInboxCache();
    if (canLoad) {
      await fetchDigest();
    }
    setRefreshing(false);
  }, [canLoad, fetchDigest]);

  const filtered = useMemo(() => filterItems(items, filter), [items, filter]);

  const renderItem = useCallback(
    ({ item }: { item: InboxDigestItem }) => (
      <InboxItemRow
        item={item}
        onPress={() => navigateToItem(item)}
      />
    ),
    [navigateToItem],
  );

  return (
    <AuthRouteGuard>
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View
          pointerEvents="none"
          style={[
            styles.backdropOrbTop,
            { backgroundColor: "rgba(217, 121, 43, 0.06)" },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.backdropOrbBottom,
            { backgroundColor: "rgba(78, 138, 134, 0.04)" },
          ]}
        />
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <View style={styles.shell}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <ThemedText type="code" themeColor="accent">
                  Firepit inbox
                </ThemedText>
                <ThemedText type="title">Notifications</ThemedText>
                {totalUnread > 0 && (
                  <ThemedText themeColor="mutedForeground" style={styles.unreadCount}>
                    {totalUnread} unread
                  </ThemedText>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search messages"
                onPress={() => router.push("/search" as never)}
                style={({ pressed }) => [
                  styles.searchButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Search size={20} color={theme.foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Friends"
                onPress={() => router.push("/friends" as never)}
                style={({ pressed }) => [
                  styles.searchButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Users size={20} color={theme.foreground} />
              </Pressable>
            </View>

            {/* Filter tabs */}
            <View style={styles.filterRowContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setFilter(f.value)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      {
                        backgroundColor: active
                          ? theme.primary
                          : theme.muted,
                        borderColor: active ? theme.primary : theme.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      themeColor={active ? "primaryForeground" : "foreground"}
                    >
                      {f.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            </View>

            {/* Content */}
            {loadState === "error" ? (
              <ThemedText themeColor="destructive" style={styles.errorText}>
                {error}
              </ThemedText>
            ) : filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <ThemedText type="smallBold">No notifications</ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.emptySubtext}>
                  You&apos;re all caught up. New mentions and messages will appear here.
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={theme.primary}
                  />
                }
                contentContainerStyle={styles.listContent}
                renderItem={renderItem}
                windowSize={5}
                maxToRenderPerBatch={10}
                initialNumToRender={10}
                removeClippedSubviews
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    </AuthRouteGuard>
  );
}

function InboxItemRow({
  item,
  onPress,
}: {
  item: InboxDigestItem;
  onPress: () => void;
}) {
  const theme = useTheme();
  const initials = getInitials(item.authorLabel);
  const isUnread = item.unreadCount > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemRow,
        {
          backgroundColor: isUnread
            ? theme.primary + "08"
            : "transparent",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Avatar */}
      {item.authorAvatarUrl ? (
        <Image
          source={{ uri: item.authorAvatarUrl }}
          style={styles.itemAvatar}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.itemAvatar,
            styles.itemAvatarFallback,
            { backgroundColor: theme.muted },
          ]}
        >
          <ThemedText type="smallBold" style={{ fontSize: 14 }}>
            {initials}
          </ThemedText>
        </View>
      )}

      {/* Content */}
      <View style={styles.itemContent}>
        <View style={styles.itemTopRow}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={styles.itemAuthor}
          >
            {item.authorLabel}
          </ThemedText>
          <ThemedText
            type="code"
            themeColor="mutedForeground"
            style={styles.itemTime}
          >
            {formatTime(item.activityAt)}
          </ThemedText>
        </View>
        <ThemedText
          numberOfLines={2}
          themeColor="mutedForeground"
          style={styles.itemPreview}
        >
          {item.previewText}
        </ThemedText>
        <View style={styles.itemMeta}>
          {item.kind === "mention" && (
            <View style={[styles.badge, { backgroundColor: theme.primary + "20" }]}>
              <ThemedText type="code" themeColor="accent">
                mention
              </ThemedText>
            </View>
          )}
          {item.contextKind === "conversation" && (
            <View style={[styles.badge, { backgroundColor: theme.secondary + "20" }]}>
              <ThemedText type="code" themeColor="foreground">
                DM
              </ThemedText>
            </View>
          )}
          {item.contextKind === "channel" && item.serverId && (
            <View style={[styles.badge, { backgroundColor: theme.muted }]}>
              <ThemedText type="code" themeColor="mutedForeground">
                channel
              </ThemedText>
            </View>
          )}
          {isUnread && (
            <View
              style={[
                styles.unreadDot,
                { backgroundColor: theme.primary },
              ]}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.two,
  },
  shell: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    flex: 1,
    paddingBottom: BottomTabInset + Spacing.two,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  headerLeft: {
    flex: 1,
    gap: Spacing.one,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadCount: { fontSize: 13 },
  filterRowContainer: {
    height: 44,
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  filterChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 36,
  },
  errorText: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  emptyState: {
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
  },
  emptySubtext: { fontSize: 14, textAlign: "center" },
  listContent: {
    gap: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: 10,
  },
  itemAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  itemAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.one,
  },
  itemAuthor: { flex: 1 },
  itemTime: { fontSize: 11 },
  itemPreview: { fontSize: 13, lineHeight: 18 },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  badge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  backdropOrbTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 260,
    top: -90,
    left: -80,
  },
  backdropOrbBottom: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 320,
    right: -120,
    bottom: 40,
  },
});
