import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";

import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/action-button";
import MessageWithMentions from "@/components/message-with-mentions";
import { ReactionButton } from "@/components/reaction-button";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { MessagePoll, type PollData } from "@/components/message-poll";
import { FileAttachmentDisplay, type FileAttachment } from "@/components/file-attachment-display";
import type { CustomEmoji } from "@/components/emoji-renderer";

export type Reaction = {
  emoji: string;
  count: number;
  reactedByMe?: boolean;
};

export type MessageReplyPreview = {
  authorLabel?: string;
  text: string;
};

export type ChatBubbleMessageProps = {
  messageId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorAvatarFramePreset?: string;
  authorAvatarFrameUrl?: string;
  authorPronouns?: string;
  text: string;
  createdAt?: string;
  editedAt?: string;
  removedAt?: string | null;
  removedBy?: string | null;
  isPinned?: boolean;
  isMine: boolean;
  imageUrl?: string | null;
  replyTo?: MessageReplyPreview | null;
  reactions?: Reaction[];
  attachments?: FileAttachment[];
  threadReplyCount?: number | null;
  mentions?: string[];
  customEmojis?: CustomEmoji[];
  customEmojiUrls?: Record<string, string>;
  poll?: PollData | null;
  pollReadOnly?: boolean;
  currentUserId?: string;
  canManageMessages?: boolean;
  compact?: boolean;
  onToggleReaction?: (emoji: string, isAdding: boolean) => void | Promise<void>;
  onStartReply?: () => void;
  onStartEdit?: () => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
  onOpenThread?: () => void;
  onOpenImageViewer?: (url: string) => void;
  onOpenProfile?: () => void;
  onShowEmojiPicker?: () => void;
  onVotePoll?: (optionId: string) => void | Promise<void>;
  onClosePoll?: () => void | Promise<void>;
};

const TIME_FORMAT = new Intl.DateTimeFormat([], {
  hour: "numeric",
  minute: "2-digit",
});

const DATE_FORMAT = new Intl.DateTimeFormat([], {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
});

function formatTs(createdAt?: string) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const time = TIME_FORMAT.format(d);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isToday) return time;
  return `${time} ${DATE_FORMAT.format(d)}`;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function ChatBubbleMessageInner({
  messageId,
  authorName,
  authorAvatarUrl,
  authorAvatarFrameUrl,
  authorPronouns,
  text,
  createdAt,
  editedAt,
  removedAt,
  removedBy,
  isPinned,
  isMine,
  imageUrl,
  replyTo,
  reactions,
  attachments,
  threadReplyCount,
  customEmojis = [],
  customEmojiUrls: propCustomEmojiUrls,
  poll,
  pollReadOnly = false,
  currentUserId,
  canManageMessages = false,
  compact = true,
  onToggleReaction,
  onStartReply,
  onStartEdit,
  onDelete,
  onTogglePin,
  onOpenThread,
  onOpenImageViewer,
  onOpenProfile,
  onShowEmojiPicker,
  onVotePoll,
  onClosePoll,
}: ChatBubbleMessageProps) {
  const theme = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const handleToggleReaction = useCallback(
    (emoji: string, isAdding: boolean) => onToggleReaction?.(emoji, isAdding),
    [onToggleReaction],
  );
  const handleStartReply = useCallback(() => onStartReply?.(), [onStartReply]);
  const handleStartEdit = useCallback(() => onStartEdit?.(), [onStartEdit]);
  const handleDelete = useCallback(() => onDelete?.(), [onDelete]);
  const handleTogglePin = useCallback(() => onTogglePin?.(), [onTogglePin]);
  const handleOpenThread = useCallback(() => onOpenThread?.(), [onOpenThread]);
  const handleOpenImageViewer = useCallback(
    (url: string) => onOpenImageViewer?.(url),
    [onOpenImageViewer],
  );
  const handleOpenProfile = useCallback(() => onOpenProfile?.(), [onOpenProfile]);
  const handleShowEmojiPicker = useCallback(
    () => onShowEmojiPicker?.(),
    [onShowEmojiPicker],
  );
  const handleVotePoll = useCallback(
    (optionId: string) => onVotePoll?.(optionId),
    [onVotePoll],
  );
  const handleClosePoll = useCallback(() => onClosePoll?.(), [onClosePoll]);

  const removed = Boolean(removedAt);
  const gap = compact ? Spacing.half : Spacing.one;
  const pad = compact ? Spacing.one : Spacing.two;
  const metaSize = compact ? 11 : 12;

  const customEmojiUrlMap = useMemo(() => {
    if (propCustomEmojiUrls) return propCustomEmojiUrls;
    const map: Record<string, string> = {};
    for (const ce of customEmojis) {
      if (ce.name && ce.url) {
        map[ce.name.toLowerCase()] = ce.url;
      }
    }
    return map;
  }, [customEmojis, propCustomEmojiUrls]);

  const ts = formatTs(createdAt);
  const displayName = authorName || "Unknown";

  const toggleActions = () => {
    setShowActions((v) => !v);
    setDeleteConfirming(false);
  };

  const handleLongPress = () => {
    if (!removed) toggleActions();
  };

  return (
    <View
      style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}
    >
      {/* Avatar */}
      {!isMine && (
        <View style={styles.avatarCol}>
          {onOpenProfile ? (
              <Pressable onPress={handleOpenProfile}>
              <Avatar
                uri={authorAvatarUrl ?? undefined}
                size={28}
                initials={getInitials(displayName)}
                frameUrl={authorAvatarFrameUrl}
              />
            </Pressable>
          ) : (
            <Avatar
              uri={authorAvatarUrl ?? undefined}
              size={28}
              initials={getInitials(displayName)}
              frameUrl={authorAvatarFrameUrl}
            />
          )}
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={350}
          style={[
            styles.bubble,
            {
              padding: pad,
              gap: gap,
              backgroundColor: isMine ? theme.primary + "14" : theme.card,
              borderColor: isMine ? theme.primary + "30" : theme.border,
            },
          ]}
        >
          {/* Header: name + pronouns + timestamp + badges */}
          <View style={styles.headerRow}>
            <Text
              style={[styles.authorName, { fontSize: metaSize, color: theme.text }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {authorPronouns ? (
              <Text style={[styles.meta, { fontSize: metaSize - 1, color: theme.mutedForeground }]}>
                ({authorPronouns})
              </Text>
            ) : null}
            {ts ? (
              <Text style={[styles.meta, { fontSize: metaSize - 1, color: theme.mutedForeground }]}>
                {ts}
              </Text>
            ) : null}
            {editedAt ? (
              <Text style={[styles.meta, { fontSize: metaSize - 1, color: theme.mutedForeground }]}>
                (edited)
              </Text>
            ) : null}
            {isPinned ? (
              <Text style={[styles.meta, { fontSize: metaSize - 1, color: theme.primary }]}>
                📌
              </Text>
            ) : null}
            {removed ? (
              <Text style={[styles.meta, { fontSize: metaSize - 1, color: theme.destructive }]}>
                {removedBy ? "Removed by mod" : "Removed"}
              </Text>
            ) : null}
          </View>

          {/* Reply preview */}
          {replyTo && !removed ? (
            <View
              style={[
                styles.replyPreview,
                { backgroundColor: theme.muted + "60", borderColor: theme.border },
              ]}
            >
              <Text style={[styles.replyAuthor, { fontSize: metaSize, color: theme.text }]}>
                {replyTo.authorLabel || "User"}
              </Text>
              <Text
                style={[styles.replyText, { fontSize: metaSize, color: theme.mutedForeground }]}
                numberOfLines={1}
              >
                {replyTo.text.length > 80
                  ? replyTo.text.slice(0, 80) + "..."
                  : replyTo.text}
              </Text>
            </View>
          ) : null}

          {/* Message body with markdown + mentions + custom emojis */}
          {!removed ? (
            <MessageWithMentions
              text={poll ? "" : text}
              customEmojis={customEmojis}
            />
          ) : null}

          {/* Inline image */}
          {imageUrl && !removed ? (
            <Pressable
              onPress={() => handleOpenImageViewer(imageUrl)}
              style={{ marginTop: gap }}
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.inlineImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Pressable>
          ) : null}

          {/* Poll */}
          {poll && !removed ? (
            <MessagePoll
              poll={poll}
              currentUserId={currentUserId}
              canClose={canManageMessages || (currentUserId != null && poll.createdBy === currentUserId)}
              readOnly={pollReadOnly}
              onVote={handleVotePoll}
              onClose={handleClosePoll}
            />
          ) : null}

          {/* Attachments */}
          {attachments && attachments.length > 0 && !removed ? (
            <View style={{ gap: gap, marginTop: gap }}>
              {attachments.map((att, idx) => (
                <FileAttachmentDisplay
                  key={`${messageId}-${att.fileId ?? "att"}-${idx}`}
                  attachment={att}
                  onPress={handleOpenImageViewer}
                />
              ))}
            </View>
          ) : null}

          {/* Thread indicator */}
          {typeof threadReplyCount === "number" && threadReplyCount > 0 && onOpenThread ? (
            <Pressable
              onPress={handleOpenThread}
              style={[
                styles.threadRow,
                { borderColor: theme.border, backgroundColor: theme.muted + "40" },
              ]}
            >
              <Text style={[styles.threadText, { fontSize: metaSize, color: theme.primary }]}>
                {threadReplyCount} {threadReplyCount === 1 ? "reply" : "replies"}
              </Text>
            </Pressable>
          ) : null}

          {/* Reactions */}
          {reactions && reactions.length > 0 ? (
            <View style={styles.reactionsRow}>
              {reactions.map((reaction) => (
                <ReactionButton
                  key={`${messageId}-${reaction.emoji}`}
                  reaction={reaction}
                  customEmojiUrls={customEmojiUrlMap}
                  onToggle={handleToggleReaction}
                />
              ))}
            </View>
          ) : null}

          {/* Action sheet */}
          {showActions && !removed ? (
            <View style={[styles.actionsRow, isMine && styles.actionsRowMine]}>
              {onToggleReaction ? (
                <ActionButton
                  label="React"
                  onPress={() => {
                    if (onShowEmojiPicker) {
                      handleShowEmojiPicker();
                    } else {
                      handleToggleReaction("❤️", true);
                    }
                    setShowActions(false);
                  }}
                  tone="ghost"
                />
              ) : null}
              {onStartReply ? (
                <ActionButton
                  label="Reply"
                  onPress={() => {
                    handleStartReply();
                    setShowActions(false);
                  }}
                  tone="ghost"
                />
              ) : null}
              {onOpenThread ? (
                <ActionButton
                  label="Thread"
                  onPress={() => {
                    handleOpenThread();
                    setShowActions(false);
                  }}
                  tone="ghost"
                />
              ) : null}
              {isMine && onStartEdit ? (
                <ActionButton
                  label="Edit"
                  onPress={() => {
                    handleStartEdit();
                    setShowActions(false);
                  }}
                  tone="ghost"
                />
              ) : null}
              {(isMine || canManageMessages) && onTogglePin ? (
                <ActionButton
                  label={isPinned ? "Unpin" : "Pin"}
                  onPress={() => {
                    handleTogglePin();
                    setShowActions(false);
                  }}
                  tone="ghost"
                />
              ) : null}
              {isMine && onDelete ? (
                deleteConfirming ? (
                  <View style={styles.deleteConfirmRow}>
                    <ActionButton
                      label="Confirm"
                      onPress={() => {
                        handleDelete();
                        setDeleteConfirming(false);
                        setShowActions(false);
                      }}
                      tone="destructive"
                    />
                    <ActionButton
                      label="Cancel"
                      onPress={() => setDeleteConfirming(false)}
                      tone="ghost"
                    />
                  </View>
                ) : (
                  <ActionButton
                    label="Delete"
                    onPress={() => setDeleteConfirming(true)}
                    tone="ghost"
                  />
                )
              ) : null}
              <ActionButton
                label="Close"
                onPress={() => {
                  setShowActions(false);
                  setDeleteConfirming(false);
                }}
                tone="ghost"
              />
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.one,
    paddingVertical: 1,
  },
  rowMine: {
    flexDirection: "row-reverse",
  },
  rowOther: {
    flexDirection: "row",
  },
  avatarCol: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  bubble: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    flexWrap: "wrap",
  },
  authorName: {
    fontWeight: "700",
  },
  meta: {
    fontStyle: "italic",
  },
  replyPreview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
    gap: 1,
  },
  replyAuthor: {
    fontWeight: "700",
  },
  replyText: {},
  inlineImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  threadRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
    alignSelf: "flex-start",
  },
  threadText: {
    fontWeight: "700",
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.half,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.half,
    paddingTop: Spacing.half,
  },
  actionsRowMine: {
    justifyContent: "flex-end",
  },
  deleteConfirmRow: {
    flexDirection: "row",
    gap: Spacing.half,
  },
});

export const ChatBubbleMessage = React.memo(ChatBubbleMessageInner, (prev, next) => {
  if (prev.messageId !== next.messageId) return false;
  if (prev.authorId !== next.authorId) return false;
  if (prev.currentUserId !== next.currentUserId) return false;
  if (prev.authorName !== next.authorName) return false;
  if (prev.authorAvatarUrl !== next.authorAvatarUrl) return false;
  if (prev.authorAvatarFramePreset !== next.authorAvatarFramePreset) return false;
  if (prev.authorAvatarFrameUrl !== next.authorAvatarFrameUrl) return false;
  if (prev.authorPronouns !== next.authorPronouns) return false;
  if (prev.text !== next.text) return false;
  if (prev.createdAt !== next.createdAt) return false;
  if (prev.editedAt !== next.editedAt) return false;
  if (prev.removedAt !== next.removedAt) return false;
  if (prev.removedBy !== next.removedBy) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.isMine !== next.isMine) return false;
  if (prev.imageUrl !== next.imageUrl) return false;
  if (prev.replyTo?.text !== next.replyTo?.text) return false;
  if (prev.replyTo?.authorLabel !== next.replyTo?.authorLabel) return false;
  if (prev.reactions !== next.reactions) return false;
  if (prev.attachments !== next.attachments) return false;
  if (prev.threadReplyCount !== next.threadReplyCount) return false;
  if (prev.mentions !== next.mentions) return false;
  if (prev.customEmojis !== next.customEmojis) return false;
  if (prev.customEmojiUrls !== next.customEmojiUrls) return false;
  if (prev.poll !== next.poll) return false;
  if (prev.pollReadOnly !== next.pollReadOnly) return false;
  if (prev.canManageMessages !== next.canManageMessages) return false;
  if (prev.compact !== next.compact) return false;
  return true;
});
