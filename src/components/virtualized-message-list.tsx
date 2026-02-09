"use client";
import { Virtuoso } from "react-virtuoso";
import type { Message, CustomEmoji } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionPicker } from "@/components/reaction-picker";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { formatMessageTimestamp } from "@/lib/utils";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";

type VirtualizedMessageListProps = {
  messages: Message[];
  userId: string | null;
  userIdSlice: number;
  editingMessageId: string | null;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  onStartEdit: (message: Message) => void;
  onStartReply: (message: Message) => void;
  onRemove: (id: string) => void;
  onToggleReaction: (messageId: string, emoji: string, isAdding: boolean) => Promise<void>;
  onOpenProfileModal: (userId: string, userName?: string, displayName?: string, avatarUrl?: string) => void;
  onOpenImageViewer: (imageUrl: string) => void;
  customEmojis?: CustomEmoji[];
  onUploadCustomEmoji?: (file: File, name: string) => Promise<void>;
  shouldShowLoadOlder: boolean;
  onLoadOlder: () => void;
};

export function VirtualizedMessageList({
  messages,
  userId,
  userIdSlice,
  editingMessageId,
  deleteConfirmId,
  setDeleteConfirmId,
  onStartEdit,
  onStartReply,
  onRemove,
  onToggleReaction,
  onOpenProfileModal,
  onOpenImageViewer,
  customEmojis,
  onUploadCustomEmoji,
  shouldShowLoadOlder,
  onLoadOlder,
}: VirtualizedMessageListProps) {
  return (
    <Virtuoso
      className="h-[60vh] rounded-3xl border border-border/60 bg-background/70 shadow-inner"
      data={messages}
      followOutput="smooth"
      initialTopMostItemIndex={messages.length - 1}
      itemContent={(index, m) => {
        const mine = m.userId === userId;
        const isEditing = editingMessageId === m.$id;
        const removed = Boolean(m.removedAt);
        const isDeleting = deleteConfirmId === m.$id;
        const displayName = m.displayName || m.userName || m.userId.slice(0, userIdSlice);

        return (
          <div
            className={`group mb-4 mx-4 flex gap-3 rounded-2xl border border-transparent bg-background/60 p-3 transition-colors ${
              mine ? "ml-auto max-w-[85%] flex-row-reverse text-right" : "mr-auto max-w-[85%]"
            } ${
              isEditing ? "border-blue-400/50 bg-blue-50/40 dark:border-blue-500/40 dark:bg-blue-950/30" : "hover:border-border/80"
            }`}
          >
            <button
              className="shrink-0 cursor-pointer rounded-full border border-transparent transition hover:border-border"
              onClick={() => onOpenProfileModal(m.userId, m.userName, m.displayName, m.avatarUrl)}
              type="button"
            >
              <Avatar
                alt={displayName}
                fallback={displayName}
                size="md"
                src={m.avatarUrl}
              />
            </button>
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`flex flex-wrap items-baseline gap-2 text-xs ${mine ? "justify-end" : ""} text-muted-foreground`}>
                <span className="font-medium text-foreground">
                  {displayName}
                </span>
                {m.pronouns && (
                  <span className="italic text-muted-foreground">
                    ({m.pronouns})
                  </span>
                )}
                <span>{formatMessageTimestamp(m.$createdAt)}</span>
                {m.editedAt && <span className="italic">(edited)</span>}
                {removed && <span className="text-destructive">(removed)</span>}
              </div>

              {m.replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs">
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">
                      {m.replyTo.displayName || m.replyTo.userName || "User"}
                    </span>
                    <span className="ml-1 text-muted-foreground">
                      {m.replyTo.text?.length > 50
                        ? `${m.replyTo.text.slice(0, 50)}...`
                        : m.replyTo.text}
                    </span>
                  </div>
                </div>
              )}

              {!removed && (
                <div className="wrap-break-word text-sm">
                  <MessageWithMentions text={m.text} customEmojis={customEmojis} />
                </div>
              )}
              {removed && m.removedBy && (
                <div className="text-xs italic text-muted-foreground">
                  Removed by moderator
                </div>
              )}

              {m.imageUrl && !removed && (
                <div className="mt-2">
                  <button
                    className="overflow-hidden rounded-lg border border-border transition hover:opacity-90"
                    onClick={() => {
                      if (m.imageUrl) {
                        onOpenImageViewer(m.imageUrl);
                      }
                    }}
                    type="button"
                  >
                    <img
                      alt="Attached"
                      className="max-h-64 w-auto"
                      decoding="async"
                      loading="lazy"
                      src={m.imageUrl}
                    />
                  </button>
                </div>
              )}

              {m.attachments && m.attachments.length > 0 && !removed && (
                <div className="mt-2 space-y-2">
                  {m.attachments.map((attachment, idx) => (
                    <FileAttachmentDisplay
                      key={`${m.$id}-${attachment.fileId}-${idx}`}
                      attachment={attachment}
                    />
                  ))}
                </div>
              )}

              {m.reactions && m.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.reactions.map((reaction) => {
                    return (
                      <ReactionButton
                        currentUserId={userId}
                        customEmojis={customEmojis}
                        key={`${m.$id}-${reaction.emoji}`}
                        onToggle={(e, isAdding) => onToggleReaction(m.$id, e, isAdding)}
                        reaction={reaction}
                      />
                    );
                  })}
                </div>
              )}

              {!removed && (
                <div className={`flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${mine ? "justify-end" : ""}`}>
                  <ReactionPicker
                    customEmojis={customEmojis}
                    onUploadCustomEmoji={onUploadCustomEmoji}
                    onSelectEmoji={async (emoji) => {
                      await onToggleReaction(m.$id, emoji, true);
                    }}
                  />
                  <Button
                    onClick={() => onStartReply(m)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  {mine && (
                    <>
                      <Button
                        onClick={() => onStartEdit(m)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isDeleting ? (
                        <>
                          <Button
                            onClick={() => onRemove(m.$id)}
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            Confirm
                          </Button>
                          <Button
                            onClick={() => setDeleteConfirmId(null)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => setDeleteConfirmId(m.$id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }}
      components={{
        Header: shouldShowLoadOlder
          ? () => (
              <div className="flex justify-center p-4">
                <Button onClick={onLoadOlder} size="sm" type="button" variant="outline">
                  Load older messages
                </Button>
              </div>
            )
          : undefined,
      }}
    />
  );
}
