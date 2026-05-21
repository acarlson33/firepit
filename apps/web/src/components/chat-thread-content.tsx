"use client";

import { Loader2, Send } from "lucide-react";

import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import type { CustomEmoji } from "@/lib/types";
import { formatMessageTimestamp } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { MessagePollBlock } from "@/components/message-poll";
import { ReactionButton } from "@/components/reaction-button";

type ChatThreadContentProps = {
    parentMessage: ChatSurfaceMessage | null;
    replies: ChatSurfaceMessage[];
    loading?: boolean;
    error?: string | null;
    currentUserId: string | null;
    canManageMessages?: (message: ChatSurfaceMessage) => boolean;
    customEmojis?: CustomEmoji[];
    onToggleReaction?: (
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) => Promise<void>;
    onVotePoll?: (message: ChatSurfaceMessage, optionId: string) => Promise<void>;
    onClosePoll?: (message: ChatSurfaceMessage) => Promise<void>;
    replyText?: string;
    onReplyTextChange?: (value: string) => void;
    onSendReply?: () => Promise<void> | void;
    sendingReply?: boolean;
    replyPlaceholder?: string;
    replyDisabled?: boolean;
};

function MessageCard({
    message,
    currentUserId,
    canManageMessages,
    customEmojis,
    onToggleReaction,
    onVotePoll,
    onClosePoll,
}: {
    message: ChatSurfaceMessage;
    currentUserId: string | null;
    canManageMessages?: (message: ChatSurfaceMessage) => boolean;
    customEmojis?: CustomEmoji[];
    onToggleReaction?: (
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) => Promise<void>;
    onVotePoll?: (message: ChatSurfaceMessage, optionId: string) => Promise<void>;
    onClosePoll?: (message: ChatSurfaceMessage) => Promise<void>;
}) {
    return (
        <div className="flex gap-3 rounded-lg border border-transparent p-2 transition hover:border-border/50">
            <Avatar
                alt={message.authorLabel}
                fallback={message.authorLabel}
                size="sm"
                src={message.authorAvatarUrl}
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {message.authorLabel}
                    </span>
                    <span>{formatMessageTimestamp(message.createdAt)}</span>
                </div>
                <div className="mt-1 text-sm">
                    <MessageWithMentions text={message.text} />
                </div>
                {message.poll ? (
                    <MessagePollBlock
                        canClose={
                            message.poll.createdBy === currentUserId ||
                            canManageMessages?.(message) === true
                        }
                        currentUserId={currentUserId}
                        messageId={message.id}
                        onClose={
                            onClosePoll
                                ? () => onClosePoll(message)
                                : undefined
                        }
                        onVote={
                            onVotePoll
                                ? (optionId) => onVotePoll(message, optionId)
                                : undefined
                        }
                        poll={message.poll}
                        readOnly={message.context.kind === "dm"}
                    />
                ) : null}
                {message.imageUrl ? (
                    <div className="mt-2">
                        <ImageWithSkeleton
                            alt="Attached"
                            className="max-h-24 rounded-lg border"
                            src={message.imageUrl}
                        />
                    </div>
                ) : null}
                {message.attachments && message.attachments.length > 0 ? (
                    <div className="mt-2 space-y-1">
                        {message.attachments.map((attachment, index) => (
                            <FileAttachmentDisplay
                                attachment={attachment}
                                key={`${message.id}-${attachment.fileId}-${index}`}
                            />
                        ))}
                    </div>
                ) : null}
                {message.reactions &&
                message.reactions.length > 0 &&
                onToggleReaction ? (
                    <div className="mt-2 flex flex-wrap gap-1">
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
                ) : null}
            </div>
        </div>
    );
}

export function ChatThreadContent({
    parentMessage,
    replies,
    loading = false,
    error,
    currentUserId,
    canManageMessages,
    customEmojis,
    onToggleReaction,
    onVotePoll,
    onClosePoll,
    replyText = "",
    onReplyTextChange,
    onSendReply,
    sendingReply = false,
    replyPlaceholder = "Reply to thread...",
    replyDisabled = false,
}: ChatThreadContentProps) {
    if (!parentMessage) {
        return null;
    }

    return (
        <>
            <div className="border-b pb-4">
                <MessageCard
                    currentUserId={currentUserId}
                    canManageMessages={canManageMessages}
                    customEmojis={customEmojis}
                    message={parentMessage}
                    onToggleReaction={onToggleReaction}
                    onVotePoll={onVotePoll}
                    onClosePoll={onClosePoll}
                />
                <div className="mt-2 text-xs text-muted-foreground">
                    {replies.length}{" "}
                    {replies.length === 1 ? "reply" : "replies"}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : replies.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        No replies yet. Be the first to reply!
                    </div>
                ) : (
                    <div className="space-y-4">
                        {replies.map((reply) => (
                            <MessageCard
                                currentUserId={currentUserId}
                                canManageMessages={canManageMessages}
                                customEmojis={customEmojis}
                                key={reply.id}
                                message={reply}
                                onToggleReaction={onToggleReaction}
                                onVotePoll={onVotePoll}
                                onClosePoll={onClosePoll}
                            />
                        ))}
                    </div>
                )}
            </div>

            {onReplyTextChange && onSendReply ? (
                <div className="border-t pt-4">
                    <div className="flex gap-2">
                        <Textarea
                            className="min-h-20 resize-none"
                            disabled={replyDisabled || sendingReply}
                            onChange={(event) => {
                                onReplyTextChange(event.target.value);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void onSendReply();
                                }
                            }}
                            placeholder={replyPlaceholder}
                            value={replyText}
                        />
                        <Button
                            aria-label="Send reply"
                            className="shrink-0"
                            disabled={
                                replyDisabled ||
                                sendingReply ||
                                !replyText.trim()
                            }
                            onClick={() => {
                                void onSendReply();
                            }}
                            size="icon"
                            type="button"
                        >
                            {sendingReply ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            ) : null}
        </>
    );
}
