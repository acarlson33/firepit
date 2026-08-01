import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import {
  muteConversation,
  type Channel,
  type DirectMessageConversation,
  type Server,
  type ServerCategory,
} from "@/lib/firepit";
import { getChannels, getCategories, getServers, getConversations, enrichConversations } from "@/lib/server-cache";
import { router } from "expo-router";

type LoadState = "idle" | "loading" | "ready" | "error";

function hasId<T extends { $id?: string }>(
  item: T,
): item is T & { $id: string } {
  return typeof item.$id === "string" && item.$id.length > 0;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function ChannelItem({
  channel,
  onPress,
}: {
  channel: Channel;
  onPress: () => void;
}) {
  const theme = useTheme();
  const chUnread = (channel as any).unreadCount ?? 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.channelItem,
        {
          backgroundColor: pressed
            ? theme.backgroundSelected
            : "transparent",
        },
      ]}
    >
      <ThemedText
        type="code"
        themeColor="mutedForeground"
        style={styles.channelHash}
      >
        #
      </ThemedText>
      <ThemedText
        numberOfLines={1}
        style={{ flex: 1 }}
      >
        {channel.name ?? "Untitled"}
      </ThemedText>
      {chUnread > 0 && (
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.primary },
          ]}
        >
          <ThemedText
            type="code"
            themeColor="primaryForeground"
          >
            {chUnread}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export default function ChatTabScreen() {
  const theme = useTheme();
  const { instanceUrl, accessToken, state, currentUser } = useFirepitBootstrap();

  const [servers, setServers] = useState<Server[]>([]);
  const [serverLoadState, setServerLoadState] = useState<LoadState>("idle");
  const [dms, setDms] = useState<DirectMessageConversation[]>([]);
  const [dmLoadState, setDmLoadState] = useState<LoadState>("idle");
  const [mutedConversations, setMutedConversations] = useState<Set<string>>(new Set());

  // Expanded server to show channels
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelLoadState, setChannelLoadState] = useState<LoadState>("idle");
  const [categories, setCategories] = useState<ServerCategory[]>([]);

  const canLoad = state === "ready" && !!instanceUrl && !!accessToken;

  // Load servers
  useEffect(() => {
    if (!canLoad) return;
    let cancelled = false;
    async function load() {
      setServerLoadState("loading");
      try {
        const serverList = await getServers(instanceUrl!, accessToken!);
        if (cancelled) return;
        setServers(serverList);
        setServerLoadState("ready");
      } catch {
        if (!cancelled) setServerLoadState("error");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [canLoad, instanceUrl, accessToken]);

  // Load DMs
  useEffect(() => {
    if (!canLoad) return;
    let cancelled = false;
    async function load() {
      setDmLoadState("loading");
      try {
        const raw = await getConversations(instanceUrl!, accessToken!);
        if (cancelled) return;
        const currentUserId = currentUser?.$id ?? currentUser?.userId ?? "";
        const enriched = await enrichConversations(instanceUrl!, accessToken!, raw, currentUserId);
        if (cancelled) return;
        setDms(enriched);
        setDmLoadState("ready");
      } catch {
        if (!cancelled) setDmLoadState("error");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [canLoad, instanceUrl, accessToken]);

  // Load channels when a server is expanded
  const expandServer = useCallback(async (serverId: string) => {
    if (expandedServerId === serverId) {
      setExpandedServerId(null);
      setChannels([]);
      setCategories([]);
      return;
    }
    setExpandedServerId(serverId);
    setChannelLoadState("loading");
    try {
      const [nextChannels, nextCategories] = await Promise.all([
        getChannels(instanceUrl!, accessToken!, serverId),
        getCategories(instanceUrl!, accessToken!, serverId),
      ]);
      setChannels(nextChannels.filter(hasId));
      setCategories(nextCategories.filter(hasId));
      setChannelLoadState("ready");
    } catch {
      setChannelLoadState("error");
    }
  }, [expandedServerId, instanceUrl, accessToken]);

  // Sort: items with unread first, then alphabetically
  const sortedServers = useMemo(() => {
    return [...servers].sort((a, b) => {
      const aUnread = (a as any).unreadCount ?? 0;
      const bUnread = (b as any).unreadCount ?? 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [servers]);

  const sortedDms = useMemo(() => {
    return [...dms].sort((a, b) => {
      const aUnread = (a as any).unreadCount ?? 0;
      const bUnread = (b as any).unreadCount ?? 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      // For DMs, sort by last message time if available
      const aTime = a.lastMessageAt ?? "";
      const bTime = b.lastMessageAt ?? "";
      if (aTime && bTime) return bTime.localeCompare(aTime);
      return 0;
    });
  }, [dms]);

  const navigateToChannel = useCallback((serverId: string, channelId: string) => {
    router.push(`/server/messages/${serverId}/${channelId}` as never);
  }, []);

  const navigateToDm = useCallback((conversationId: string) => {
    router.push(`/dm/${conversationId}` as never);
  }, []);

  const handleMute = useCallback(async (conversationId: string, currentlyMuted: boolean) => {
    if (!instanceUrl || !accessToken) return;
    try {
      await muteConversation(instanceUrl, accessToken, conversationId, !currentlyMuted);
      setMutedConversations((prev) => {
        const next = new Set(prev);
        if (currentlyMuted) {
          next.delete(conversationId);
        } else {
          next.add(conversationId);
        }
        return next;
      });
    } catch (e) {
      console.error("[chat:muteConversation] Failed to mute conversation", e);
    }
  }, [instanceUrl, accessToken]);

  // Group channels by category for the expanded server
  const groupedChannels = useMemo(() => {
    const sorted = [...categories].sort((a, b) => {
      const ap = a.position ?? 0;
      const bp = b.position ?? 0;
      if (ap !== bp) return ap - bp;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    const catMap = new Map<string, Channel[]>();
    for (const ch of channels) {
      const cid = ch.categoryId ?? "";
      if (!cid) continue;
      if (!catMap.has(cid)) catMap.set(cid, []);
      catMap.get(cid)!.push(ch);
    }
    return sorted.map((cat) => ({
      category: cat,
      channels: (catMap.get(cat.$id ?? "") ?? []).sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      ),
    }));
  }, [categories, channels]);

  const uncategorizedChannels = useMemo(() => {
    return [...channels]
      .filter((ch) => !ch.categoryId)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [channels]);

  return (
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
        <ScrollView
          style={styles.shell}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="code" themeColor="accent">
              Firepit chat
            </ThemedText>
            <ThemedText type="title">Messages</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.subtitle}>
              Servers and direct messages.
            </ThemedText>
          </View>

          {/* Server list */}
          <View style={styles.section}>
            <ThemedText type="smallBold" style={styles.sectionHeader}>
              Servers ({servers.length})
            </ThemedText>
            {serverLoadState === "ready" && sortedServers.length === 0 && (
              <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
                You haven&apos;t joined any servers yet.
              </ThemedText>
            )}
            {sortedServers.map((server) => {
              const isExpanded = expandedServerId === server.$id;
              const unread = (server as any).unreadCount ?? 0;
              return (
                <View key={server.$id}>
                  <Pressable
                    onPress={() => void expandServer(server.$id!)}
                    style={({ pressed }) => [
                      styles.listItem,
                      {
                        backgroundColor: isExpanded
                          ? theme.backgroundSelected
                          : "transparent",
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    {server.iconUrl ? (
                      <Image
                        source={{ uri: server.iconUrl }}
                        style={styles.itemIcon}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.itemIcon, styles.itemIconFallback, { backgroundColor: theme.muted }]}>
                        <ThemedText type="smallBold" style={{ fontSize: 14 }}>
                          {getInitials(server.name ?? "")}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.itemContent}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {server.name ?? "Untitled"}
                      </ThemedText>
                      {server.memberCount != null && (
                        <ThemedText type="code" themeColor="mutedForeground">
                          {server.memberCount} members
                        </ThemedText>
                      )}
                    </View>
                    {unread > 0 && (
                      <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                        <ThemedText type="code" themeColor="primaryForeground">
                          {unread}
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText type="code" themeColor="mutedForeground">
                      {isExpanded ? "▲" : "▼"}
                    </ThemedText>
                  </Pressable>

                  {/* Channels for this server */}
                  {isExpanded && (
                    <View style={styles.channelList}>
                      {channelLoadState === "loading" && (
                        <ActivityIndicator
                          color={theme.primary}
                          style={{ padding: Spacing.two }}
                        />
                      )}
                      {channelLoadState === "ready" && channels.length === 0 && (
                        <ThemedText
                          themeColor="mutedForeground"
                          style={styles.emptyChannels}
                        >
                          No channels in this server.
                        </ThemedText>
                      )}
                      {channelLoadState === "ready" && groupedChannels.map(({ category, channels: catChannels }) => (
                        <View key={category.$id} style={styles.categorySection}>
                          <ThemedText
                            type="smallBold"
                            style={styles.categoryHeader}
                          >
                            {category.name ?? "Category"}
                          </ThemedText>
                          {catChannels.map((channel) => (
                            <ChannelItem
                              key={channel.$id}
                              channel={channel}
                              onPress={() => navigateToChannel(server.$id!, channel.$id!)}
                            />
                          ))}
                        </View>
                      ))}
                      {channelLoadState === "ready" && uncategorizedChannels.length > 0 && (
                        <View style={styles.categorySection}>
                          {groupedChannels.length > 0 && (
                            <ThemedText
                              type="smallBold"
                              style={styles.categoryHeader}
                            >
                              Uncategorized
                            </ThemedText>
                          )}
                          {uncategorizedChannels.map((channel) => (
                            <ChannelItem
                              key={channel.$id}
                              channel={channel}
                              onPress={() => navigateToChannel(server.$id!, channel.$id!)}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* DM list */}
          <View style={styles.section}>
            <ThemedText type="smallBold" style={styles.sectionHeader}>
              Direct Messages ({dms.length})
            </ThemedText>
            {dmLoadState === "ready" && sortedDms.length === 0 && (
              <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
                No direct messages yet.
              </ThemedText>
            )}
            {sortedDms.map((dm) => {
              const unread = (dm as any).unreadCount ?? 0;
              const otherUser = dm.otherUser;
              const dmName = dm.isGroup
                ? dm.name ?? "Group DM"
                : otherUser?.displayName ?? otherUser?.userId ?? "Unknown";
              const dmAvatar = otherUser?.avatarUrl;
              const isMuted = mutedConversations.has(dm.$id!);

              return (
                <Pressable
                  key={dm.$id}
                  onPress={() => navigateToDm(dm.$id!)}
                  onLongPress={() => {
                    if (dm.$id) {
                      handleMute(dm.$id, isMuted);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.listItem,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  {dmAvatar ? (
                    <Image
                      source={{ uri: dmAvatar }}
                      style={[styles.itemIcon, isMuted && { opacity: 0.5 }]}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.itemIcon, styles.itemIconFallback, { backgroundColor: theme.muted }]}>
                      <ThemedText type="smallBold" style={{ fontSize: 14 }}>
                        {getInitials(dmName)}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.itemContent}>
                    <ThemedText type="smallBold" numberOfLines={1} style={isMuted ? { opacity: 0.5 } : undefined}>
                      {dmName}
                    </ThemedText>
                    <View style={{ flexDirection: "row", gap: Spacing.one, alignItems: "center" }}>
                      {isMuted && (
                        <ThemedText type="code" themeColor="mutedForeground" style={{ fontSize: 11 }}>
                          Muted
                        </ThemedText>
                      )}
                      {dm.lastMessageAt && (
                        <ThemedText type="code" themeColor="mutedForeground">
                          {new Date(dm.lastMessageAt).toLocaleDateString()}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                  {unread > 0 && !isMuted && (
                    <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                      <ThemedText type="code" themeColor="primaryForeground">
                        {unread}
                      </ThemedText>
                    </View>
                  )}
                  <Pressable
                    onPress={() => {
                      if (dm.$id) handleMute(dm.$id, isMuted);
                    }}
                    style={({ pressed }) => [
                      styles.muteBtn,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor="mutedForeground">
                      {isMuted ? "🔇" : "🔔"}
                    </ThemedText>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.two,
  },
  shell: {
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.two,
  },
  header: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  subtitle: { fontSize: 14, lineHeight: 20 },
  section: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  sectionHeader: {
    paddingVertical: Spacing.one,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: Spacing.two,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  itemIconFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  badge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  channelList: {
    paddingLeft: Spacing.four,
    gap: 2,
  },
  emptyChannels: {
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  categorySection: {
    paddingTop: Spacing.one,
  },
  categoryHeader: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    fontSize: 12,
    textTransform: "uppercase",
  },
  channelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 8,
  },
  channelHash: {
    width: 20,
    textAlign: "center",
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
  muteBtn: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
  },
});
