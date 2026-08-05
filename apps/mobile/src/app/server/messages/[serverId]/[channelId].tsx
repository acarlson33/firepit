import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ChatInput, { type ComposerAttachmentState } from "@/components/chat-input";
import { ChatBubbleMessage } from "@/components/chat-bubble-message";
import { ImageViewer } from "@/components/image-viewer";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Channel, EffectivePermissions, Message } from "@/lib/firepit";
import {
  createChannelMessage,
  deleteChannelMessage,
  fetchChannelMessages,
  fetchChannels,
  fetchServer,
  pinChannelMessage,
  unpinChannelMessage,
  updateChannelMessage,
} from "@/lib/firepit";
import { uploadFile, uploadImage } from "@/lib/firepit/uploads";
import { parseMentions, buildPollCommand } from "@/lib/mention-utils";
import { toggleReaction } from "@/lib/reactions-client";
import { cacheMessages, getCachedMessages } from "@/lib/cache/MessageCache";
import { getKnownThreadReplyIds, markAsThreadReply } from "@/lib/cache/ThreadCache";
import EmojiPickerSheet from "@/components/emoji-picker";
import { PollCreationModal } from "@/components/poll-creation-modal";
import { GifStickerPicker } from "@/components/gif-sticker-picker";
import { ThreadPanel } from "@/components/thread-panel";
import { TypingIndicator } from "@/components/typing-indicator";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { extractAppwriteConfig } from "@/lib/firepit/bootstrap";
import { getAvatarUrl, getMessageAvatarFileId } from "@/lib/avatars";
import { getProfilesBatch } from "@/lib/profile-cache";
import { getChannels as getCachedChannels, getServerName as getCachedServerName, getCachedEffectivePermissions } from "@/lib/server-cache";
import { getLastReadAt, setLastReadAt, countUnread } from "@/lib/channel-read-state";
import { captureError } from "@/lib/sentry";
import { UserProfileSheet } from "@/components/user-profile-sheet";
import { ArrowLeft, Megaphone } from "lucide-react-native";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function ServerMessageScreen() {
  const theme = useTheme();
  const { serverId, channelId } = useLocalSearchParams<{
    serverId?: string;
    channelId?: string;
  }>();
  const { instanceUrl, accessToken, currentUser, instance, customEmojis, appwriteConfig } =
    useFirepitBootstrap();
  const [serverName, setServerName] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelLoadState, setChannelLoadState] = useState<LoadState>("idle");
  const [messageLoadState, setMessageLoadState] = useState<LoadState>("idle");
  const [messageLoadError, setMessageLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSendState, setMessageSendState] = useState<LoadState>("idle");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [gifStickerPickerVisible, setGifStickerPickerVisible] = useState(false);
  const [activeThreadMessageId, setActiveThreadMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [composerAttachments, setComposerAttachments] =
    useState<ComposerAttachmentState>({ image: null, files: [] });
  const [profileSheetUser, setProfileSheetUser] = useState<{
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  } | null>(null);
  const composerAttachmentsRef = useRef(composerAttachments);
  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);
  const cancelledRef = useRef(false);
  const [lastReadAt, setLastReadAtState] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;
  const normalizedChannelId = Array.isArray(channelId)
    ? channelId[0]
    : channelId;
  const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;

  // Typing indicators for this channel
  const { typingUsers: typingUsersList, handleTypingChange } = useTypingIndicator(
    instanceUrl ?? null,
    accessToken,
    currentUserId,
    normalizedChannelId,
    currentUser?.displayName ?? currentUser?.userName ?? null,
    appwriteConfig?.project,
    appwriteConfig?.endpoint ?? null,
  );

  const selectedChannel = useMemo(
    () =>
      channels.find((channel) => channel.$id === normalizedChannelId) ??
      null,
    [channels, normalizedChannelId],
  );

  const isAnnouncement = selectedChannel?.type === "announcement";
  const [channelPermissions, setChannelPermissions] = useState<EffectivePermissions | null>(null);
  const listRef = useRef<FlatList>(null);
  const markChannelReadRef = useRef<() => Promise<void>>(undefined);

  const loadServer = useCallback(async () => {
    if (!instanceUrl || !accessToken || !normalizedServerId) return;
    try {
      const name = await getCachedServerName(
        instanceUrl,
        accessToken,
        normalizedServerId,
      );
      if (cancelledRef.current) return;
      setServerName(name);
    } catch {
      // server name is non-critical
    }
  }, [accessToken, instanceUrl, normalizedServerId]);

  const loadChannels = useCallback(async () => {
    if (!instanceUrl || !accessToken || !normalizedServerId) return;
    setChannelLoadState("loading");
    try {
      const nextChannels = await getCachedChannels(
        instanceUrl,
        accessToken,
        normalizedServerId,
      );
      if (cancelledRef.current) return;
      setChannels(nextChannels);
      setChannelLoadState("ready");
    } catch {
      if (!cancelledRef.current) setChannelLoadState("error");
    }
  }, [accessToken, instanceUrl, normalizedServerId]);

  const loadMessages = useCallback(
    async (nextChannelId: string) => {
      if (!instanceUrl || !accessToken) return;
      setMessageLoadState("loading");
      setMessageLoadError(null);

      // Show cached messages instantly if available
      const cached = (await getCachedMessages(nextChannelId)) as Message[];
      if (cached.length > 0) {
        const knownThreadReplyIds = await getKnownThreadReplyIds();
        const filtered = cached.filter((m: Message) => {
          if (m.threadId) return false;
          if (m.$id && knownThreadReplyIds.has(m.$id)) return false;
          return true;
        });
        setMessages(filtered);
      }

      try {
        const appwriteCfg = extractAppwriteConfig(instance ?? {});

        const enrichMessages = async (
          msgs: Message[],
        ): Promise<{ enriched: Message[]; filtered: Message[] }> => {
          const enriched = msgs.map((msg): Message => {
            const avatarFileId = getMessageAvatarFileId(msg);
            const avatarUrl = getAvatarUrl(avatarFileId, appwriteCfg);
            const rawReactions: unknown = msg.reactions;
            let reactions: Message["reactions"] = undefined;
            if (typeof rawReactions === "string") {
              try {
                reactions = JSON.parse(rawReactions) as Message["reactions"];
              } catch {
                reactions = undefined;
              }
            } else if (Array.isArray(rawReactions)) {
              reactions = rawReactions as Message["reactions"];
            }
            return { ...msg, authorAvatarUrl: avatarUrl, reactions };
          });

          const senderIds = new Set<string>();
          for (const msg of enriched) {
            const senderId = (msg.senderId ?? msg.userId) as string | undefined;
            if (senderId) senderIds.add(senderId);
          }
          if (senderIds.size > 0) {
            const profileMap = await getProfilesBatch(instanceUrl, accessToken, Array.from(senderIds));
            for (const msg of enriched) {
              const senderId = (msg.senderId ?? msg.userId) as string | undefined;
              if (senderId && profileMap[senderId]) {
                if (profileMap[senderId].displayName) {
                  msg.senderDisplayName = profileMap[senderId].displayName;
                }
                if (profileMap[senderId].avatarUrl) {
                  msg.authorAvatarUrl = profileMap[senderId].avatarUrl;
                }
              }
            }
          }

          const knownThreadReplyIds = await getKnownThreadReplyIds();
          const filtered = enriched.filter((m: Message) => {
            if (m.threadId) {
              if (m.$id) void markAsThreadReply(m.$id);
              return false;
            }
            if (m.$id && knownThreadReplyIds.has(m.$id)) return false;
            return true;
          });

          return { enriched, filtered };
        };

        // Fetch messages (batch both phases to avoid flicker)
        const initialRes = await fetchChannelMessages(
          instanceUrl,
          accessToken,
          nextChannelId,
          10,
        );
        if (cancelledRef.current) return;

        let allEnriched: Message[];
        let allFiltered: Message[];
        let cursor: string | undefined;
        if ((initialRes.messages ?? []).length >= 10) {
          const lastMsg = initialRes.messages![initialRes.messages!.length - 1];
          cursor = lastMsg.$id as string;
        }

        const { enriched: firstEnriched, filtered: firstFiltered } = await enrichMessages(
          initialRes.messages ?? [],
        );
        allEnriched = firstEnriched;
        allFiltered = firstFiltered;

        if (cursor) {
          const remainingRes = await fetchChannelMessages(
            instanceUrl,
            accessToken,
            nextChannelId,
            50,
            cursor,
          );
          if (cancelledRef.current) return;

          const { enriched: remainingEnriched, filtered: remainingFiltered } = await enrichMessages(
            remainingRes.messages ?? [],
          );
          allEnriched = [...allEnriched, ...remainingEnriched];
          allFiltered = [...allFiltered, ...remainingFiltered];
        }

        setMessages(allFiltered);
        setMessageLoadState("ready");
        void cacheMessages(nextChannelId, allEnriched);
      } catch (error) {
        if (!cancelledRef.current) {
          setMessageLoadState("error");
          setMessageLoadError(
            error instanceof Error ? error.message : "Unable to load messages",
          );
        }
      }
    },
    [accessToken, instance, instanceUrl],
  );

  useEffect(() => {
    void loadServer();
  }, [loadServer]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (!normalizedChannelId || !selectedChannel) {
      setMessages([]);
      setMessageLoadState("idle");
      setMessageLoadError(null);
      return;
    }
    void loadMessages(normalizedChannelId);
  }, [loadMessages, normalizedChannelId, selectedChannel]);

  useEffect(() => {
    if (
      !instanceUrl ||
      !accessToken ||
      !normalizedServerId ||
      !normalizedChannelId ||
      !currentUserId
    ) {
      setChannelPermissions(null);
      return;
    }
    let cancelled = false;
    const token = accessToken;
    const baseUrl = instanceUrl;
    const userId = currentUserId;
    async function loadPermissions() {
      try {
        const res = await getCachedEffectivePermissions(
          baseUrl,
          token,
          normalizedServerId,
          normalizedChannelId,
          userId,
        );
        if (!cancelled) setChannelPermissions(res);
      } catch {
        if (!cancelled) setChannelPermissions(null);
      }
    }
    void loadPermissions();
    return () => { cancelled = true; };
  }, [accessToken, currentUserId, instanceUrl, normalizedChannelId, normalizedServerId]);

  const sendMessage = useCallback(async () => {
    if (
      !instanceUrl ||
      !accessToken ||
      !selectedChannel?.$id ||
      !normalizedServerId ||
      messageSendState === "loading"
    ) {
      return;
    }
    const text = messageDraft.trim();
    const ca = composerAttachmentsRef.current;
    const hasImage = Boolean(ca.image);
    const hasFiles = ca.files.length > 0;
    if (!text && !hasImage && !hasFiles) {
      return;
    }

    // Handle edit mode
    if (editingMessage) {
      const messageId = editingMessage.$id;
      if (!messageId) return;
      setMessageSendState("loading");
      setMessageError(null);
      try {
        await updateChannelMessage(instanceUrl, accessToken, messageId, text);
        if (cancelledRef.current) return;
        setEditingMessage(null);
        setMessageDraft("");
        setMessageSendState("ready");
        await loadMessages(selectedChannel.$id);
      } catch (editError) {
        setMessageSendState("error");
        setMessageError(
          editError instanceof Error ? editError.message : "Unable to edit message",
        );
      }
      return;
    }

    const mentions = parseMentions(text)
      .map((m) => m.username)
      .filter((u, i, l) => l.indexOf(u) === i);

    setMessageSendState("loading");
    setMessageError(null);
    try {
      const localFiles = ca.files.filter(
        (f) => !f.remoteAttachment,
      );
      const remoteAttachments = ca.files
        .filter((f) => f.remoteAttachment)
        .map((f) => f.remoteAttachment!);

      const [imageUpload, fileUploads] = await Promise.all([
        ca.image
          ? uploadImage(instanceUrl, accessToken, ca.image)
          : Promise.resolve(null),
        Promise.all(
          localFiles.map((f) =>
            uploadFile(instanceUrl, accessToken, f),
          ),
        ),
      ]);
      await createChannelMessage(instanceUrl, accessToken, {
        channelId: selectedChannel.$id,
        serverId: normalizedServerId,
        text: text || undefined,
        mentions,
        imageFileId: imageUpload?.fileId,
        imageUrl: imageUpload?.fileUrl,
        attachments: [...(fileUploads ?? []), ...remoteAttachments],
        replyToId: replyingTo?.$id,
      });
      if (cancelledRef.current) return;
      setMessageDraft("");
      setReplyingTo(null);
      setComposerAttachments({ image: null, files: [] });
      setMessageSendState("ready");
      await loadMessages(selectedChannel.$id);
    } catch (error) {
      setMessageSendState("error");
      setMessageError(
        error instanceof Error ? error.message : "Unable to send message",
      );
    }
  }, [
    accessToken,
    editingMessage,
    instanceUrl,
    loadMessages,
    messageDraft,
    messageSendState,
    normalizedServerId,
    replyingTo,
    selectedChannel,
  ]);

  const handlePollSubmit = useCallback(
    (question: string, options: string[]) => {
      const channelId = selectedChannel?.$id;
      if (!instanceUrl || !accessToken || !channelId || !normalizedServerId) return;
      const built = buildPollCommand(question, options);
      if (!built.ok) {
        setMessageError(built.error);
        return;
      }
      const command = built.command;
      const serverId = normalizedServerId;
      (async () => {
        try {
          await createChannelMessage(instanceUrl, accessToken, {
            channelId,
            serverId,
            text: command,
          });
          await loadMessages(channelId);
        } catch (e) {
          captureError(e instanceof Error ? e : new Error(String(e)), {
            handler: "handlePollSubmit",
          });
          setMessageError(
            e instanceof Error ? e.message : "Failed to send poll",
          );
        }
      })();
    },
    [instanceUrl, accessToken, normalizedServerId, selectedChannel, loadMessages],
  );

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Realtime message subscription
  const lastRealtimeReloadRef = useRef(0);
  useRealtimeMessages({
    instance,
    accessToken,
    collectionId: "messages",
    filterField: "channelId",
    filterValue: normalizedChannelId,
    onMessageEvent: () => {
      if (!normalizedChannelId) return;
      // ponytail: coalesce bursts (reaction/typing events) so a full reload isn't fired per event
      const now = Date.now();
      if (now - lastRealtimeReloadRef.current < 1500) return;
      lastRealtimeReloadRef.current = now;
      void loadMessages(normalizedChannelId);
    },
  });

  // Fallback: refresh messages when app returns to foreground
  useEffect(() => {
    if (!normalizedChannelId) return;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") void loadMessages(normalizedChannelId);
    });

    return () => subscription.remove();
  }, [normalizedChannelId, loadMessages]);

  useEffect(() => {
    setMessageDraft("");
    setMessageError(null);
    setMessageSendState("idle");
    setLastReadAtState(null);
    setUnreadCount(0);
  }, [normalizedChannelId]);

  // Load last-read timestamp on channel change
  useEffect(() => {
    if (!normalizedChannelId) return;
    let cancelled = false;
    getLastReadAt(normalizedChannelId).then((ts) => {
      if (!cancelled) setLastReadAtState(ts);
    });
    return () => { cancelled = true; };
  }, [normalizedChannelId]);

  // Calculate unread count after messages load
  useEffect(() => {
    if (messageLoadState !== "ready" || !messages.length) return;
    setUnreadCount(countUnread(messages, lastReadAt));
  }, [messages, lastReadAt, messageLoadState]);

  const markChannelRead = useCallback(async () => {
    if (!normalizedChannelId || !messages.length) return;
    const newest = messages[0]?.$createdAt;
    if (!newest) return;
    await setLastReadAt(normalizedChannelId, newest);
    setLastReadAtState(newest);
    setUnreadCount(0);
  }, [normalizedChannelId, messages]);

  // Keep ref fresh for scroll callback
  markChannelReadRef.current = markChannelRead;

  const mappedEmojis = useMemo(
    () =>
      customEmojis?.map((ce) => ({
        ...ce,
        url: ce.url.startsWith("http") ? ce.url : `${instanceUrl}${ce.url}`,
      })) ?? [],
    [customEmojis, instanceUrl],
  );

  const renderItem = useCallback(
    ({ item: message, index: idx }: { item: Message; index: number }) => {
      const isMine = Boolean(
        message.userId &&
          currentUserId &&
          message.userId === currentUserId,
      );
      const displayName =
        message.userName ??
        message.displayName ??
        message.userId ??
        "Unknown user";
      const avatarUrl =
        typeof message.authorAvatarUrl === "string"
          ? message.authorAvatarUrl
          : null;
      const reactions = Array.isArray(message.reactions)
        ? (message.reactions as Array<{
            emoji: string;
            userIds?: string[];
            count: number;
            reactedByMe?: boolean;
          }>).map((r) => ({
            emoji: r.emoji,
            count: r.count ?? r.userIds?.length ?? 0,
            reactedByMe: r.userIds?.includes(currentUserId ?? "") ?? false,
          }))
        : [];
      const imageUrl =
        typeof message.imageUrl === "string"
          ? message.imageUrl
          : null;
      const replyToId = message.replyToId;
      const replyToMsg = replyToId
        ? messages.find((m) => m.$id === replyToId)
        : null;

      return (
        <ChatBubbleMessage
          messageId={message.$id ?? String(idx)}
          authorId={message.userId ?? ""}
          authorName={displayName}
          authorAvatarUrl={avatarUrl}
          authorAvatarFrameUrl={
            typeof message.avatarFrameUrl === "string"
              ? message.avatarFrameUrl
              : undefined
          }
          authorPronouns={
            typeof message.pronouns === "string"
              ? message.pronouns
              : undefined
          }
          text={message.text ?? ""}
          createdAt={message.$createdAt}
          editedAt={message.editedAt}
          removedAt={message.removedAt}
          removedBy={message.removedBy}
          isPinned={message.isPinned === true}
          isMine={isMine}
          currentUserId={currentUserId ?? undefined}
          canManageMessages={channelPermissions?.manageMessages ?? false}
          imageUrl={imageUrl}
          replyTo={
            replyToMsg
              ? {
                  authorLabel:
                    replyToMsg.userName ??
                    replyToMsg.displayName ??
                    replyToMsg.userId ??
                    "User",
                  text: replyToMsg.text ?? "",
                }
              : null
          }
          reactions={reactions}
          attachments={message.attachments}
          mentions={message.mentions}
          poll={message.poll ?? null}
          customEmojis={mappedEmojis}
          onToggleReaction={async (
            emoji: string,
            isAdding: boolean,
          ) => {
            if (!instanceUrl || !accessToken) return;
            try {
              const msgId = message.$id;
              if (!msgId) return;
              await toggleReaction(
                String(msgId),
                emoji,
                isAdding,
                false,
                instanceUrl,
                accessToken,
              );
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.$id !== msgId || !Array.isArray(m.reactions)) return m;
                  const existing = m.reactions.find((r) => r.emoji === emoji);
                  if (isAdding) {
                    if (existing) {
                      return { ...m, reactions: m.reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r) };
                    }
                    return { ...m, reactions: [...m.reactions, { emoji, userIds: [currentUserId ?? ""], count: 1, reactedByMe: true }] };
                  }
                  if (!existing) return m;
                  const updated = m.reactions.map((r) => r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), reactedByMe: false } : r).filter((r) => r.count > 0);
                  return { ...m, reactions: updated };
                }),
              );
            } catch {
              setMessageError("Unable to update reaction");
            }
          }}
          onTogglePin={async () => {
            if (!instanceUrl || !accessToken) return;
            try {
              const msgId = message.$id;
              if (!msgId) return;
              if (message.isPinned) {
                await unpinChannelMessage(instanceUrl, accessToken, msgId);
              } else {
                await pinChannelMessage(instanceUrl, accessToken, msgId);
              }
            } catch (e) {
              captureError(e instanceof Error ? e : new Error(String(e)), {
                handler: "channel:togglePin",
              });
              setMessageError("Unable to update pin");
            }
          }}
          onOpenImageViewer={(url) => setViewerImageUrl(url)}
          onShowEmojiPicker={() => {
            setEmojiPickerMsgId(message.$id ?? null);
            setEmojiPickerVisible(true);
          }}
          onStartReply={() => {
            setReplyingTo(message);
            setEditingMessage(null);
          }}
          onStartEdit={() => {
            setEditingMessage(message);
            setReplyingTo(null);
            setMessageDraft(message.text ?? "");
          }}
          onDelete={async () => {
            if (!instanceUrl || !accessToken) return;
            try {
              const msgId = message.$id;
              if (!msgId) return;
              await deleteChannelMessage(instanceUrl, accessToken, msgId);
              setMessages((prev) =>
                prev.filter((m) => m.$id !== msgId),
              );
            } catch (e) {
              captureError(e instanceof Error ? e : new Error(String(e)), {
                handler: "channel:deleteMessage",
              });
              setMessageError("Unable to delete message");
            }
          }}
          onOpenThread={() => {
            const msgId = message.$id;
            if (!msgId) return;
            setActiveThreadMessageId(msgId);
          }}
          threadReplyCount={message.threadMessageCount ?? null}
          onOpenProfile={() => {
            setProfileSheetUser({
              userId: message.userId ?? "",
              displayName: displayName ?? undefined,
              avatarUrl: avatarUrl ?? undefined,
            });
          }}
        />
      );
    },
    [
      currentUserId,
      mappedEmojis,
      messages,
      instanceUrl,
      accessToken,
      channelPermissions,
      setMessages,
      setViewerImageUrl,
      setEmojiPickerMsgId,
      setEmojiPickerVisible,
      setReplyingTo,
      setEditingMessage,
      setMessageDraft,
      setMessageError,
      setActiveThreadMessageId,
      setProfileSheetUser,
    ],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? BottomTabInset + 50 : 0}
    >
      {/* Backdrop decorations -- behind everything */}
      <View
        pointerEvents="none"
        style={[
          styles.backdropOrbTop,
          { backgroundColor: "rgba(217, 121, 43, 0.08)" },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.backdropOrbBottom,
          { backgroundColor: "rgba(78, 138, 134, 0.06)" },
        ]}
      />

      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {/* Thin header bar */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (normalizedServerId) {
                  router.replace(`/server/${normalizedServerId}`);
                }
              }}
              style={styles.backButton}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.one }}>
                <ArrowLeft size={18} color={theme.foreground} />
                <ThemedText type="smallBold">Back</ThemedText>
              </View>
            </Pressable>
          </View>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              {isAnnouncement ? (
                <Megaphone size={16} color={theme.foreground} />
              ) : null}
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={styles.channelName}
              >
                {selectedChannel?.name ?? "Channel"}
              </ThemedText>
              {isAnnouncement ? (
                <ThemedText
                  type="code"
                  themeColor="mutedForeground"
                  style={styles.announcementBadge}
                >
                  ANNOUNCEMENT
                </ThemedText>
              ) : null}
            </View>
            {serverName ? (
              <ThemedText
                type="code"
                themeColor="mutedForeground"
                numberOfLines={1}
                style={styles.serverName}
              >
                {serverName}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            {selectedChannel?.topic ? (
              <ThemedText
                type="code"
                themeColor="mutedForeground"
                numberOfLines={1}
              >
                {selectedChannel.topic}
              </ThemedText>
            ) : null}
          </View>
        </View>

        {/* Messages area fills remaining space */}
        {selectedChannel ? (
          <View style={styles.messageArea}>
            {messageLoadError ? (
              <ThemedText themeColor="destructive" style={styles.errorText}>
                {messageLoadError}
              </ThemedText>
            ) : null}
            {messageError ? (
              <ThemedText themeColor="destructive" style={styles.errorText}>
                {messageError}
              </ThemedText>
            ) : null}

            {typingUsersList.length > 0 ? (
              <TypingIndicator
                names={typingUsersList.map((u) => u.userName ?? u.userId)}
              />
            ) : null}

            {activeThreadMessageId && instanceUrl && accessToken ? (
              <ThreadPanel
                parentMessageId={activeThreadMessageId}
                instanceUrl={instanceUrl}
                accessToken={accessToken}
                customEmojis={mappedEmojis}
                onClose={() => setActiveThreadMessageId(null)}
                type="channel"
              />
            ) : (
              <>
                <View style={styles.messageAreaInner}>
                <FlatList
                  ref={listRef}
                  data={messages}
                  inverted
                  extraData={mappedEmojis}
                  keyExtractor={(item, index) =>
                    item.$id ?? `${item.channelId}-${item.$createdAt}-${index}`
                  }
                  renderItem={renderItem}
                  viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
                  onViewableItemsChanged={({ viewableItems }) => {
                    if (viewableItems.length > 0 && viewableItems[0].index === 0) {
                      markChannelReadRef.current?.();
                    }
                  }}
                  onScrollEndDrag={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    if (y <= 10) {
                      markChannelReadRef.current?.();
                    }
                  }}
                  ListEmptyComponent={
                    messageLoadState === "loading" ? null : (
                      <ThemedView type="secondary" style={styles.emptyTimeline}>
                        <ThemedText type="smallBold">No messages yet</ThemedText>
                        <ThemedText themeColor="mutedForeground" style={styles.emptyCopy}>
                          Send the first message to start the conversation.
                        </ThemedText>
                      </ThemedView>
                    )
                  }
                  initialNumToRender={15}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.timelineList}
                  style={styles.messageList}
                />

                {unreadCount > 0 ? (
                  <Pressable
                    onPress={() => {
                      listRef.current?.scrollToOffset({ offset: 0, animated: true });
                      markChannelRead();
                    }}
                    style={[styles.unreadBadge, { backgroundColor: theme.primary }]}
                  >
                    <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                      {unreadCount} new message{unreadCount === 1 ? "" : "s"}
                    </ThemedText>
                  </Pressable>
                ) : null}
                </View>

                {/* Reply / Edit preview */}
                {replyingTo ? (
                  <View
                    style={[
                      styles.replyPreview,
                      { borderTopColor: theme.border, backgroundColor: theme.muted },
                    ]}
                  >
                    <View style={styles.replyPreviewCopy}>
                      <ThemedText type="smallBold" themeColor="accent">
                        Replying to {replyingTo.userName ?? replyingTo.userId ?? "User"}
                      </ThemedText>
                      <ThemedText themeColor="mutedForeground" numberOfLines={1}>
                        {replyingTo.text ?? ""}
                      </ThemedText>
                    </View>
                    <Pressable onPress={() => setReplyingTo(null)} style={styles.replyCloseBtn}>
                      <ThemedText themeColor="mutedForeground">✕</ThemedText>
                    </Pressable>
                  </View>
                ) : editingMessage ? (
                  <View
                    style={[
                      styles.replyPreview,
                      { borderTopColor: theme.border, backgroundColor: theme.muted },
                    ]}
                  >
                    <View style={styles.replyPreviewCopy}>
                      <ThemedText type="smallBold" themeColor="accent">
                        Editing message
                      </ThemedText>
                      <ThemedText themeColor="mutedForeground" numberOfLines={1}>
                        {editingMessage.text ?? ""}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => {
                        setEditingMessage(null);
                        setMessageDraft("");
                      }}
                      style={styles.replyCloseBtn}
                    >
                      <ThemedText themeColor="mutedForeground">✕</ThemedText>
                    </Pressable>
                  </View>
                ) : null}

                {/* Composer pinned at bottom */}
                <View
                  style={[
                    styles.composer,
                    { borderTopColor: theme.border, backgroundColor: theme.background },
                  ]}
                >
                  {instanceUrl && accessToken ? (
                    <ChatInput
                      value={messageDraft}
                      onChange={setMessageDraft}
                      onChangeText={handleTypingChange}
                      placeholder={
                        isAnnouncement && !channelPermissions?.canSend
                          ? "Only admins can send announcements"
                          : `Message #${selectedChannel?.name ?? "channel"}`
                      }
                      disabled={
                        messageSendState === "loading" ||
                        (isAnnouncement && !channelPermissions?.canSend)
                      }
                      onMentionsChange={() => {}}
                      serverId={normalizedServerId ?? undefined}
                      canMentionEveryone={channelPermissions?.mentionEveryone ?? false}
                      instanceUrl={instanceUrl}
                      accessToken={accessToken}
                      attachments={composerAttachments}
                      onAttachmentsChange={setComposerAttachments}
                      onSend={() => void sendMessage()}
                      sending={messageSendState === "loading"}
                      customEmojis={mappedEmojis.map((ce) => ({
                        shortcode: ce.name,
                        customUrl: ce.url,
                      }))}
                      onOpenPollCreate={() => setPollModalVisible(true)}
                      onOpenGifStickerPicker={() => setGifStickerPickerVisible(true)}
                    />
                  ) : null}
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <ThemedText themeColor="mutedForeground">
              Select a channel from the server page to open its messages.
            </ThemedText>
          </View>
        )}
      </SafeAreaView>

      <ImageViewer
        url={viewerImageUrl ?? undefined}
        visible={Boolean(viewerImageUrl)}
        onClose={() => setViewerImageUrl(null)}
      />

      <EmojiPickerSheet
                visible={emojiPickerVisible}
        onClose={() => setEmojiPickerVisible(false)}
        onSelect={async (emoji) => {
          if (!instanceUrl || !accessToken) {
            setEmojiPickerVisible(false);
            return;
          }
          if (emojiPickerMsgId) {
            try {
              await toggleReaction(emojiPickerMsgId, emoji, true, false, instanceUrl, accessToken);
              // Refresh messages to show the new reaction
          if (!selectedChannel?.$id) return;
          await loadMessages(selectedChannel.$id);
            } catch (e) {
              captureError(e instanceof Error ? e : new Error(String(e)), {
                handler: "channel:toggleReaction",
              });
              setMessageError("Unable to update reaction");
            }
          }
          setEmojiPickerVisible(false);
        }}
        customEmojis={mappedEmojis}
        />
        {pollModalVisible && (
          <PollCreationModal
            visible
            onClose={() => setPollModalVisible(false)}
            onSubmit={handlePollSubmit}
          />
        )}
        {gifStickerPickerVisible && instanceUrl && accessToken ? (
          <GifStickerPicker
            instanceUrl={instanceUrl}
            accessToken={accessToken}
            visible={gifStickerPickerVisible}
            onClose={() => setGifStickerPickerVisible(false)}
          onSelectAttachment={(attachment) => {
            const fileUrl = attachment.fileUrl;
            if (!fileUrl) return;
            setComposerAttachments((prev) => ({
              ...prev,
              files: [
                ...prev.files,
                {
                  uri: fileUrl,
                  name: attachment.fileName,
                  mimeType: attachment.fileType,
                  size: attachment.fileSize,
                  remoteAttachment: {
                    fileId: attachment.fileId,
                    fileName: attachment.fileName,
                    fileSize: attachment.fileSize,
                    fileType: attachment.fileType,
                    fileUrl,
                    thumbnailUrl: attachment.thumbnailUrl,
                    previewUrl: attachment.previewUrl,
                    mediaKind: attachment.mediaKind,
                    source: attachment.source,
                    packId: attachment.packId,
                    itemId: attachment.itemId,
                  },
                },
              ],
            }));
          }}
        />
        ) : null}
        <UserProfileSheet
          userId={profileSheetUser?.userId ?? ""}
          displayName={profileSheetUser?.displayName}
          avatarUrl={profileSheetUser?.avatarUrl}
          open={Boolean(profileSheetUser)}
          onClose={() => setProfileSheetUser(null)}
          onViewFullProfile={() => {
            if (profileSheetUser?.userId) {
              router.push(`/user/${encodeURIComponent(profileSheetUser.userId)}` as never);
            }
          }}
        />
        </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropOrbTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 260,
    top: -130,
    left: -130,
    zIndex: 0,
  },
  backdropOrbBottom: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 320,
    right: -160,
    bottom: -100,
    zIndex: 0,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flex: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  announcementBadge: {
    fontSize: 10,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  headerRight: {
    flex: 0,
    maxWidth: 100,
  },
  backButton: {
    fontSize: 16,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
  },
  channelName: {
    fontSize: 15,
    lineHeight: 20,
  },
  serverName: {
    fontSize: 11,
    lineHeight: 14,
  },
  messageArea: {
    flex: 1,
    minHeight: 0,
  },
  messageAreaInner: {
    flex: 1,
    position: "relative",
  },
  unreadBadge: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  messageList: {
    flex: 1,
  },
  timelineList: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
    gap: Spacing.half,
  },
  emptyTimeline: {
    padding: Spacing.three,
    borderRadius: 12,
    alignItems: "center",
    marginTop: Spacing.six,
  },
  emptyCopy: {
    fontSize: 13,
    marginTop: Spacing.half,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  errorText: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 13,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
  },
  announcementComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  announcementComposerText: {
    fontSize: 13,
    flex: 1,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
  },
  replyPreviewCopy: {
    flex: 1,
    gap: 2,
  },
  replyCloseBtn: {
    padding: Spacing.one,
  },
});
