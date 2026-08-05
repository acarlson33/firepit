import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { ChatBubbleMessage } from "@/components/chat-bubble-message";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  createDMThreadReply,
  fetchDMThreadMessages,
  fetchChannelThreadMessages,
  createChannelThreadReply,
} from "@/lib/firepit";
import type { CustomEmoji } from "@/lib/firepit/types";
import { markAsThreadReply } from "@/lib/cache/ThreadCache";
import { getProfilesBatch } from "@/lib/profile-cache";

type LoadState = "idle" | "loading" | "ready" | "error";

type Props = {
  parentMessageId: string;
  instanceUrl: string;
  accessToken: string;
  customEmojis: CustomEmoji[];
  onClose: () => void;
  onReplySent?: () => void;
  type: "dm" | "channel";
};

export function ThreadPanel({
  parentMessageId,
  instanceUrl,
  accessToken,
  customEmojis,
  onClose,
  onReplySent,
  type,
}: Props) {
  const theme = useTheme();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [parentMessage, setParentMessage] = useState<Record<string, unknown> | null>(null);
  const [replies, setReplies] = useState<Record<string, unknown>[]>([]);
  const [draft, setDraft] = useState("");
  const [sendState, setSendState] = useState<LoadState>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(40);

  const fetchThread =
    type === "channel" ? fetchChannelThreadMessages : fetchDMThreadMessages;
  const createReply =
    type === "channel" ? createChannelThreadReply : createDMThreadReply;

  const loadThread = useCallback(async () => {
    if (!parentMessageId) return;
    setLoadState("loading");
    try {
      const response = await fetchThread(
        instanceUrl,
        accessToken,
        parentMessageId,
      );
      const nextParent =
        (response.parentMessage ?? response.message ?? null) as Record<string, unknown> | null;
      const nextReplies = (response.replies ?? response.items ?? []) as Record<string, unknown>[];

      const authorIdOf = (msg: Record<string, unknown>) =>
        (msg.senderId as string | undefined) ?? (msg.userId as string | undefined);

      const senderIds = new Set<string>();
      if (nextParent) {
        const id = authorIdOf(nextParent);
        if (id) senderIds.add(id);
      }
      for (const r of nextReplies) {
        const id = authorIdOf(r);
        if (id) senderIds.add(id);
      }
      if (senderIds.size > 0) {
        const profileMap = await getProfilesBatch(instanceUrl, accessToken, Array.from(senderIds));
        if (Object.keys(profileMap).length > 0) {
          const enrich = (msg: Record<string, unknown>): Record<string, unknown> => {
            const profile = profileMap[authorIdOf(msg) ?? ""];
            if (!profile) return msg;
            return {
              ...msg,
              userName: profile.displayName ?? msg.userName,
              authorAvatarUrl: profile.avatarUrl ?? msg.authorAvatarUrl,
            };
          };
          setParentMessage(nextParent ? enrich(nextParent) : null);
          const enrichedReplies = nextReplies.map(enrich);
          setReplies(enrichedReplies);
          for (const r of enrichedReplies) {
            if (r.$id) void markAsThreadReply(r.$id as string);
          }
          setLoadState("ready");
          return;
        }
      }
      setParentMessage(nextParent);
      setReplies(nextReplies);
      for (const r of nextReplies) {
        if (r.$id) void markAsThreadReply(r.$id as string);
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [parentMessageId, instanceUrl, accessToken, fetchThread]);

  useEffect(() => {
    setLoadState("idle");
    setParentMessage(null);
    setReplies([]);
    setDraft("");
    setSendState("idle");
    setSendError(null);
    void loadThread();
  }, [loadThread]);

  const sendReply = useCallback(async () => {
    if (!parentMessageId || sendState === "loading") return;
    const text = draft.trim();
    if (!text) return;
    setSendState("loading");
    setSendError(null);
    try {
      await createReply(instanceUrl, accessToken, parentMessageId, { text });
      setDraft("");
      setSendState("ready");
      onReplySent?.();
      await loadThread();
    } catch (err) {
      setSendState("error");
      setSendError(err instanceof Error ? err.message : "Unable to send reply");
    }
  }, [parentMessageId, draft, sendState, instanceUrl, accessToken, loadThread, createReply, onReplySent]);

  const allMessages = parentMessage ? [parentMessage, ...replies] : replies;

  const renderItem = useCallback(
    ({ item, index }: { item: Record<string, unknown>; index: number }) => {
      const isParent =
        index === 0 &&
        (item.$id as string) === (parentMessage?.$id as string | undefined);
      return (
        <View style={isParent ? styles.parentWrapper : undefined}>
          {isParent && (
            <View style={styles.parentLabel}>
              <ThemedText type="code" themeColor="mutedForeground">
                Parent message
              </ThemedText>
            </View>
          )}
          <ChatBubbleMessage
            messageId={(item.$id as string) ?? String(index)}
            authorId={(item.senderId as string) ?? (item.userId as string) ?? ""}
            authorName={
              (item.userName as string) ?? (item.displayName as string) ?? (item.senderId as string) ?? "Unknown"
            }
            authorAvatarUrl={
              typeof item.authorAvatarUrl === "string"
                ? item.authorAvatarUrl
                : null
            }
            text={(item.text as string) ?? ""}
            createdAt={item.$createdAt as string}
            isMine={false}
            customEmojis={customEmojis}
          />
        </View>
      );
    },
    [customEmojis, parentMessage],
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={BottomTabInset + 50}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="smallBold" style={{ fontSize: 16 }}>
            Thread &middot; {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <ThemedText themeColor="mutedForeground" style={{ fontSize: 18 }}>✕</ThemedText>
          </Pressable>
        </View>

        {/* Messages */}
        <View style={styles.messageArea}>
          {loadState === "loading" && replies.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : loadState === "error" ? (
            <ThemedText themeColor="destructive" style={styles.errorText}>
              Unable to load thread
            </ThemedText>
          ) : null}

          <FlatList
            data={allMessages}
            inverted
            extraData={customEmojis}
            keyExtractor={(item, idx) =>
              (item.$id as string) ?? `${(item.$createdAt as string) ?? ""}-${idx}`
            }
            renderItem={renderItem}
            windowSize={5}
            maxToRenderPerBatch={10}
            initialNumToRender={15}
            removeClippedSubviews
            contentContainerStyle={styles.messageList}
            style={styles.flex}
          />
        </View>

        {/* Composer */}
        <View
          style={[
            styles.composer,
            { borderTopColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          {sendError ? (
            <ThemedText themeColor="destructive" style={styles.sendError}>
              {sendError}
            </ThemedText>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              multiline
              placeholder="Reply to thread"
              placeholderTextColor={theme.mutedForeground}
              value={draft}
              onChangeText={(t) => setDraft(t)}
              editable={sendState !== "loading"}
              onContentSizeChange={(e) =>
                setComposerHeight(Math.min(120, Math.max(40, e.nativeEvent.contentSize.height)))
              }
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  color: theme.foreground,
                  height: composerHeight,
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              onPress={sendReply}
              disabled={!draft.trim() || sendState === "loading"}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed || !draft.trim() ? 0.6 : 1,
                },
              ]}
            >
              <ThemedText type="smallBold" themeColor="primaryForeground">
                {sendState === "loading" ? "…" : "Send"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messageArea: {
    flex: 1,
  },
  loadingContainer: {
    padding: Spacing.four,
    alignItems: "center",
  },
  errorText: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  parentWrapper: {
    borderBottomWidth: 2,
    borderBottomColor: "rgba(128,128,128,0.15)",
    paddingBottom: Spacing.two,
    marginBottom: Spacing.two,
  },
  parentLabel: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    alignItems: "center",
  },
  messageList: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.one,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  sendButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    alignSelf: "flex-end",
    minWidth: 60,
    alignItems: "center",
  },
  sendError: {
    paddingHorizontal: Spacing.one,
  },
});
