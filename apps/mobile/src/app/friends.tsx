import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { ArrowLeft } from "lucide-react-native";

import { ThemedText } from "@/components/themed-text";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFriends } from "@/hooks/use-friends";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import type { FriendshipEntry, BlockedUserEntry } from "@/lib/firepit/types";
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "@/lib/firepit/messages";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type Tab = "friends" | "incoming" | "outgoing" | "blocked";

const TABS: { label: string; value: Tab }[] = [
  { label: "Friends", value: "friends" },
  { label: "Incoming", value: "incoming" },
  { label: "Outgoing", value: "outgoing" },
  { label: "Blocked", value: "blocked" },
];

const EMPTY_STATE_COPY: Record<Tab, string> = {
  friends: "No friends yet. Send a friend request to get started.",
  incoming: "No incoming friend requests.",
  outgoing: "No outgoing friend requests.",
  blocked: "You have not blocked anyone.",
};

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function FriendshipActions({
  entry,
  tab,
  onActionDone,
}: {
  entry: FriendshipEntry;
  tab: Tab;
  onActionDone: () => void;
}) {
  const theme = useTheme();
  const { instanceUrl, accessToken } = useFirepitBootstrap();
  const [actionLoading, setActionLoading] = useState(false);
  const userId = entry.user.userId;

  const runAction = useCallback(
    async (action: () => Promise<{ success?: boolean }>) => {
      if (!instanceUrl || !accessToken) return;
      setActionLoading(true);
      try {
        await action();
        onActionDone();
      } catch {
        // ignore individual action failures; list refetches below
      } finally {
        setActionLoading(false);
      }
    },
    [instanceUrl, accessToken, onActionDone],
  );

  if (tab === "incoming") {
    return (
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => {
            if (!instanceUrl || !accessToken) return;
            void runAction(() =>
              acceptFriendRequest(instanceUrl, accessToken, userId),
            );
          }}
          disabled={actionLoading}
          style={({ pressed }) => ({
            backgroundColor: theme.primary,
            borderRadius: 999,
            paddingHorizontal: Spacing.two,
            paddingVertical: Spacing.one,
            opacity: actionLoading ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <ThemedText
            type="smallBold"
            style={{ color: theme.primaryForeground }}
          >
            Accept
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!instanceUrl || !accessToken) return;
            void runAction(() =>
              declineFriendRequest(instanceUrl, accessToken, userId),
            );
          }}
          disabled={actionLoading}
          style={({ pressed }) => ({
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: Spacing.two,
            paddingVertical: Spacing.one,
            opacity: actionLoading ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <ThemedText type="smallBold">Decline</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (tab === "outgoing") {
    return (
      <Pressable
        onPress={() => {
          if (!instanceUrl || !accessToken) return;
          void runAction(() =>
            removeFriendship(instanceUrl, accessToken, userId),
          );
        }}
        disabled={actionLoading}
        style={({ pressed }) => ({
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: Spacing.two,
          paddingVertical: Spacing.one,
          opacity: actionLoading ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <ThemedText type="smallBold">Cancel</ThemedText>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (!instanceUrl || !accessToken) return;
        void runAction(() =>
          removeFriendship(instanceUrl, accessToken, userId),
        );
      }}
      disabled={actionLoading}
      style={({ pressed }) => ({
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        opacity: actionLoading ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <ThemedText type="smallBold">Remove</ThemedText>
    </Pressable>
  );
}

function FriendRow({
  entry,
  tab,
  onActionDone,
}: {
  entry: FriendshipEntry;
  tab: Tab;
  onActionDone: () => void;
}) {
  const theme = useTheme();
  const initials = getInitials(entry.user.displayName ?? "Unknown");

  return (
    <Pressable
      onPress={() =>
        router.push(`/user/${entry.user.userId}` as never)
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {entry.user.avatarUrl ? (
        <Image
          source={{ uri: entry.user.avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.avatar,
            styles.avatarFallback,
            { backgroundColor: theme.muted },
          ]}
        >
          <ThemedText type="smallBold" style={{ fontSize: 14 }}>
            {initials}
          </ThemedText>
        </View>
      )}

      <View style={styles.friendInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {entry.user.displayName ?? "Unknown"}
        </ThemedText>
        {entry.user.pronouns ? (
          <ThemedText
            type="code"
            themeColor="mutedForeground"
            style={{ fontSize: 11 }}
          >
            {entry.user.pronouns}
          </ThemedText>
        ) : null}
      </View>

      <FriendshipActions
        entry={entry}
        tab={tab}
        onActionDone={onActionDone}
      />
    </Pressable>
  );
}

function BlockedRow({ entry }: { entry: BlockedUserEntry }) {
  const theme = useTheme();
  const initials = getInitials(entry.user.displayName ?? "Unknown");
  const { actionLoading, unblock } = useBlockedUsers();
  const [localLoading, setLocalLoading] = useState(false);
  const isLoading = actionLoading === entry.user.userId || localLoading;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 10,
      }}
    >
      <Pressable
        onPress={() =>
          router.push(`/user/${entry.user.userId}` as never)
        }
        style={{ flexDirection: "row", alignItems: "center", gap: Spacing.two, flex: 1 }}
      >
        {entry.user.avatarUrl ? (
          <Image
            source={{ uri: entry.user.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarFallback,
              { backgroundColor: theme.muted },
            ]}
          >
            <ThemedText type="smallBold" style={{ fontSize: 14 }}>
              {initials}
            </ThemedText>
          </View>
        )}

        <View style={styles.friendInfo}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {entry.user.displayName ?? "Unknown"}
          </ThemedText>
          <ThemedText
            type="code"
            themeColor="mutedForeground"
            style={{ fontSize: 11 }}
          >
            Blocked on {new Date(entry.block.blockedAt).toLocaleDateString()}
          </ThemedText>
        </View>
      </Pressable>

      <Pressable
        onPress={async () => {
          setLocalLoading(true);
          await unblock(entry.user.userId);
          setLocalLoading(false);
        }}
        disabled={isLoading}
        style={({ pressed }) => ({
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: Spacing.two,
          paddingVertical: Spacing.one,
          opacity: isLoading ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <ThemedText type="smallBold">
          {isLoading ? "..." : "Unblock"}
        </ThemedText>
      </Pressable>
    </View>
  );
}

export default function FriendsScreen() {
  const theme = useTheme();
  const {
    friends,
    incoming,
    outgoing,
    loading,
    refetch,
  } = useFriends();
  const {
    items: blocked,
    loading: blockedLoading,
    refetch: refetchBlocked,
  } = useBlockedUsers();
  const [tab, setTab] = useState<Tab>("friends");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    await refetchBlocked();
    setRefreshing(false);
  }, [refetch, refetchBlocked]);

  const list = {
    friends,
    incoming,
    outgoing,
    blocked,
  }[tab];

  const isLoading = ({
    friends: loading,
    incoming: loading,
    outgoing: loading,
    blocked: blockedLoading,
  })[tab];

  const renderItem = useCallback(
    ({ item }: { item: FriendshipEntry | BlockedUserEntry }) => {
      if (tab === "blocked") {
        return <BlockedRow entry={item as BlockedUserEntry} />;
      }
      return (
        <FriendRow
          entry={item as FriendshipEntry}
          tab={tab}
          onActionDone={() => void refetch()}
        />
      );
    },
    [tab, refetch],
  );

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.shell}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              padding: Spacing.one,
            })}
          >
            <ArrowLeft size={24} color={theme.foreground} />
          </Pressable>
          <ThemedText type="title">Friends</ThemedText>
        </View>

        {/* Stats summary */}
        {(friends.length > 0 || incoming.length > 0 || blocked.length > 0) && (
          <View style={styles.statsRow}>
            {friends.length > 0 ? (
              <View style={[styles.statCard, { backgroundColor: theme.muted }]}>
                <ThemedText type="code" themeColor="mutedForeground">{friends.length}</ThemedText>
                <ThemedText type="smallBold">Friends</ThemedText>
              </View>
            ) : null}
            {incoming.length > 0 ? (
              <View style={[styles.statCard, { backgroundColor: theme.primary + "15" }]}>
                <ThemedText type="code" themeColor="accent">{incoming.length}</ThemedText>
                <ThemedText type="smallBold">Pending</ThemedText>
              </View>
            ) : null}
            {blocked.length > 0 ? (
              <View style={[styles.statCard, { backgroundColor: theme.destructive + "15" }]}>
                <ThemedText type="code" themeColor="destructive">{blocked.length}</ThemedText>
                <ThemedText type="smallBold">Blocked</ThemedText>
              </View>
            ) : null}
          </View>
        )}

        {/* Tab bar */}
        <View style={styles.tabRowContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((t) => {
            const active = tab === t.value;
            const count = {
              friends: friends.length,
              incoming: incoming.length,
              outgoing: outgoing.length,
              blocked: blocked.length,
            }[t.value];

            return (
              <Pressable
                key={t.value}
                onPress={() => setTab(t.value)}
                style={({ pressed }) => [
                  styles.tabChip,
                  {
                    backgroundColor: active ? theme.primary : theme.muted,
                    borderColor: active ? theme.primary : theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  themeColor={
                    active ? "primaryForeground" : "foreground"
                  }
                >
                  {t.label} ({count})
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
        </View>

        {/* Content */}
        {isLoading && (list as unknown[]).length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.primary} />
            <ThemedText themeColor="mutedForeground">
              Loading friends…
            </ThemedText>
          </View>
        ) : (list as unknown[]).length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText type="smallBold">Nothing here</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.emptySubtext}>
              {EMPTY_STATE_COPY[tab]}
            </ThemedText>
          </View>
        ) : (
          <FlatList<FriendshipEntry | BlockedUserEntry>
            data={list as (FriendshipEntry | BlockedUserEntry)[]}
            keyExtractor={(item) =>
              tab === "blocked"
                ? (item as BlockedUserEntry).block.$id
                : (item as FriendshipEntry).friendship.$id
            }
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: {
    width: "100%",
    maxWidth: MaxContentWidth,
    flex: 1,
    marginHorizontal: "auto",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  tabRowContainer: {
    height: 44,
    justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  tabChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 36,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
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
    paddingBottom: Spacing.six,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  friendInfo: {
    flex: 1,
    gap: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two,
    borderRadius: 12,
    gap: 2,
  },
});
