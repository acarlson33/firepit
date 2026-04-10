"use client";

import Image from "next/image";
import {
    MessageSquare,
    MessageSquareMore,
    Pencil,
    Pin,
    Reply,
    Trash2,
} from "lucide-react";

import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import type { CustomEmoji } from "@/lib/types";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionPicker } from "@/components/reaction-picker";
import { ThreadIndicator } from "@/components/thread-indicator";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatMessageTimestamp } from "@/lib/utils";
import { profilePrefetchPool } from "@/hooks/useProfilePrefetch";

type ChatSurfaceMessageItemProps = {
    message: ChatSurfaceMessage;
    currentUserId: string | null;
    userIdSlice?: number;
    editingMessageId: string | null;
    deleteConfirmId: string | null;
    setDeleteConfirmId: (id: string | null) => void;
    onStartEdit: (message: ChatSurfaceMessage) => void;
    onStartReply: (message: ChatSurfaceMessage) => void;
    onRemove: (id: string) => void;
    onToggleReaction: (
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) => Promise<void>;
    onOpenProfileModal?: (
        userId: string,
        userName?: string,
        displayName?: string,
        avatarUrl?: string,
    ) => void;
    onOpenImageViewer: (imageUrl: string) => void;
    customEmojis?: CustomEmoji[];
    onUploadCustomEmoji?: (file: File, name: string) => Promise<void>;
    onOpenThread?: (message: ChatSurfaceMessage) => void | Promise<void>;
    onTogglePin?: (message: ChatSurfaceMessage) => Promise<void>;
    canManageMessages?: boolean;
    messageDensity?: "compact" | "cozy";
    pinnedMessageIds?: string[];
    knownNames?: string[];
    onMediaLoad?: (message: ChatSurfaceMessage) => void;
};

export function ChatSurfaceMessageItem({
    message,
    currentUserId,
    userIdSlice = 6,
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
    onOpenThread,
    onTogglePin,
    canManageMessages = false,
    messageDensity = "compact",
    pinnedMessageIds,
    knownNames,
    onMediaLoad,
}: ChatSurfaceMessageItemProps) {
    const compactMessages = messageDensity === "compact";
    const mine = message.authorId === currentUserId;
    const isEditing = editingMessageId === message.id;
    const removed = Boolean(message.removedAt);
    const isDeleting = deleteConfirmId === message.id;
    const isPinned =
        message.isPinned ||
        (Array.isArray(pinnedMessageIds) &&
            pinnedMessageIds.includes(message.id));
    const displayName =
        message.authorLabel ||
        message.authorUserName ||
        message.authorId.slice(0, userIdSlice);
    const canPinMessage =
        Boolean(onTogglePin) &&
        (canManageMessages || message.context.kind === "dm");

    return (
        <div
            className={`group flex min-w-0 overflow-hidden rounded-2xl border border-transparent bg-background/60 transition-colors ${
                mine
                    ? "ml-auto max-w-[85%] flex-row-reverse text-right"
                    : "mr-auto max-w-[85%]"
            } ${
                isEditing
                    ? "border-blue-400/50 bg-blue-50/40 dark:border-blue-500/40 dark:bg-blue-950/30"
                    : "hover:border-border/80"
            } ${compactMessages ? "gap-2 p-2" : "gap-3 p-3"}`}
            data-message-id={message.id}
            id={`message-${message.id}`}
            onFocusCapture={() => profilePrefetchPool.add(message.authorId)}
            onMouseEnter={() => profilePrefetchPool.add(message.authorId)}
        >
            {onOpenProfileModal ? (
                <button
                    className="shrink-0 cursor-pointer rounded-full border border-transparent transition hover:border-border"
                    onClick={() =>
                        onOpenProfileModal(
                            message.authorId,
                            message.authorUserName,
                            message.authorLabel,
                            message.authorAvatarUrl,
                        )
                    }
                    type="button"
                >
                    <Avatar
                        alt={displayName}
                        fallback={displayName}
                        framePreset={message.authorAvatarFramePreset}
                        frameUrl={message.authorAvatarFrameUrl}
                        size="md"
                        src={message.authorAvatarUrl}
                    />
                </button>
            ) : (
                <Avatar
                    alt={displayName}
                    fallback={displayName}
                    framePreset={message.authorAvatarFramePreset}
                    frameUrl={message.authorAvatarFrameUrl}
                    size="md"
                    src={message.authorAvatarUrl}
                />
            )}

            <div className="min-w-0 flex-1 space-y-2">
                <div
                    className={`flex flex-wrap items-baseline gap-2 ${
                        mine ? "justify-end" : ""
                    } text-muted-foreground ${
                        compactMessages ? "text-[11px]" : "text-xs"
                    }`}
                >
                    <span className="font-medium text-foreground">
                        {displayName}
                    </span>
                    {message.authorPronouns && (
                        <span className="italic text-muted-foreground">
                            ({message.authorPronouns})
                        </span>
                    )}
                    <span>{formatMessageTimestamp(message.createdAt)}</span>
                    {message.editedAt && (
                        <span className="italic">(edited)</span>
                    )}
                    {removed && (
                        <span className="text-destructive">(removed)</span>
                    )}
                    {isPinned && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Pin className="h-3 w-3" />
                            Pinned
                        </span>
                    )}
                </div>

                {message.replyTo && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs">
                        <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                            <span className="font-medium text-foreground">
                                {message.replyTo.authorLabel || "User"}
                            </span>
                            <span className="ml-1 text-muted-foreground">
                                {message.replyTo.text.length > 50
                                    ? `${message.replyTo.text.slice(0, 50)}...`
                                    : message.replyTo.text}
                            </span>
                        </div>
                    </div>
                )}

                {!removed && (
                    <div
                        className={`min-w-0 whitespace-pre-wrap wrap-anywhere ${
                            compactMessages ? "text-xs" : "text-sm"
                        }`}
                    >
                        <MessageWithMentions
                            text={message.text}
                            mentions={message.mentions}
                            knownNames={knownNames}
                            currentUserId={currentUserId ?? undefined}
                            customEmojis={customEmojis}
                        />
                    </div>
                )}
                {removed && (
                    <div
                        className={`${
                            compactMessages ? "text-[11px]" : "text-xs"
                        } italic text-muted-foreground`}
                    >
                        {message.removedBy
                            ? "Removed by moderator"
                            : "Message removed"}
                    </div>
                )}

                {message.imageUrl && !removed && (
                    <div className="mt-2">
                        <button
                            className="max-w-full overflow-hidden rounded-lg border border-border transition hover:opacity-90"
                            onClick={() =>
                                onOpenImageViewer(message.imageUrl || "")
                            }
                            type="button"
                        >
                            <Image
                                alt={message.text ? message.text : "attachment"}
                                className="max-h-64 max-w-full h-auto"
                                height={768}
                                loading="lazy"
                                src={message.imageUrl}
                                width={1024}
                                onLoad={() => onMediaLoad?.(message)}
                            />
                        </button>
                    </div>
                )}

                {message.attachments &&
                    message.attachments.length > 0 &&
                    !removed && (
                        <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment, idx) => (
                                <FileAttachmentDisplay
                                    key={`${message.id}-${attachment.fileId}-${idx}`}
                                    attachment={attachment}
                                    onMediaLoad={() => onMediaLoad?.(message)}
                                />
                            ))}
                        </div>
                    )}

                {!message.threadId &&
                    typeof message.threadReplyCount === "number" &&
                    message.threadReplyCount > 0 &&
                    onOpenThread && (
                        <ThreadIndicator
                            hasUnread={message.threadHasUnread}
                            replyCount={message.threadReplyCount}
                            lastReplyAt={message.lastThreadReplyAt}
                            onClick={() => {
                                void onOpenThread(message);
                            }}
                        />
                    )}

                {message.reactions && message.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {message.reactions.map((reaction) => (
                            <ReactionButton
                                currentUserId={currentUserId}
                                customEmojis={customEmojis}
                                key={`${message.id}-${reaction.emoji}`}
                                onToggle={(emoji, isAdding) =>
                                    onToggleReaction(
                                        message.id,
                                        emoji,
                                        isAdding,
                                    )
                                }
                                reaction={reaction}
                            />
                        ))}
                    </div>
                )}

                {!removed && (
                    <div
                        className={`flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${mine ? "justify-end" : ""}`}
                    >
                        <ReactionPicker
                            customEmojis={customEmojis}
                            onUploadCustomEmoji={onUploadCustomEmoji}
                            onSelectEmoji={async (emoji) => {
                                await onToggleReaction(message.id, emoji, true);
                            }}
                        />
                        <Button
                            onClick={() => onStartReply(message)}
                            size="sm"
                            title="Reply"
                            type="button"
                            variant="ghost"
                        >
                            <Reply className="h-4 w-4" />
                        </Button>
                        {!message.threadId && onOpenThread && (
                            <Button
                                onClick={() => {
                                    void onOpenThread(message);
                                }}
                                size="sm"
                                title="Start or view thread"
                                type="button"
                                variant="ghost"
                            >
                                <MessageSquareMore className="h-4 w-4" />
                            </Button>
                        )}
                        {canPinMessage && (
                            <Button
                                onClick={() => {
                                    if (onTogglePin) {
                                        void onTogglePin(message);
                                    }
                                }}
                                size="sm"
                                title={
                                    isPinned ? "Unpin message" : "Pin message"
                                }
                                type="button"
                                variant="ghost"
                            >
                                <Pin
                                    className={`h-4 w-4 ${
                                        isPinned
                                            ? "text-amber-600 dark:text-amber-400"
                                            : ""
                                    }`}
                                />
                            </Button>
                        )}
                        {mine && (
                            <>
                                <Button
                                    aria-label="Edit message"
                                    onClick={() => onStartEdit(message)}
                                    size="sm"
                                    title="Edit message"
                                    type="button"
                                    variant="ghost"
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                {isDeleting ? (
                                    <>
                                        <Button
                                            onClick={() => onRemove(message.id)}
                                            size="sm"
                                            type="button"
                                            variant="destructive"
                                        >
                                            Confirm
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                setDeleteConfirmId(null)
                                            }
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                        >
                                            Cancel
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        aria-label="Delete message"
                                        onClick={() =>
                                            setDeleteConfirmId(message.id)
                                        }
                                        size="sm"
                                        title="Delete message"
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
}
