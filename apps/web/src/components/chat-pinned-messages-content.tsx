"use client";

import { useState } from "react";

import { Loader2, Pin, X } from "lucide-react";

import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import { formatMessageTimestamp } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { MessagePollBlock } from "@/components/message-poll";

type ChatPinnedMessagesContentProps = {
    messages: ChatSurfaceMessage[];
    loading?: boolean;
    error?: string | null;
    onJumpToMessage?: (messageId: string) => void;
    onUnpin?: (message: ChatSurfaceMessage) => Promise<void> | void;
    canManageMessages?: boolean;
    currentUserId?: string;
    channelName?: string;
};

export function ChatPinnedMessagesContent({
    messages,
    loading = false,
    error,
    onJumpToMessage,
    onUnpin,
    canManageMessages = false,
    currentUserId,
    channelName,
}: ChatPinnedMessagesContentProps) {
    const [unpinningId, setUnpinningId] = useState<string | null>(null);

    async function handleUnpin(message: ChatSurfaceMessage) {
        if (!onUnpin || unpinningId) {
            return;
        }

        setUnpinningId(message.id);
        try {
            await onUnpin(message);
        } finally {
            setUnpinningId(null);
        }
    }

    return (
        <>
            {channelName ? (
                <div className="px-1 text-sm text-muted-foreground">
                    in #{channelName}
                </div>
            ) : null}

            <div className="flex-1 overflow-y-auto py-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : messages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        <Pin className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        <p>No pinned messages</p>
                        <p className="mt-1 text-xs">
                            Pin important messages to make them easy to find
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {messages.map((message) => {
                            const isUnpinning = unpinningId === message.id;

                            return (
                                <div
                                    className="group relative rounded-lg border bg-card p-3 transition hover:border-primary/30"
                                    key={message.id}
                                >
                                    {canManageMessages && onUnpin ? (
                                        <Button
                                            aria-label="Unpin message"
                                            className="absolute right-2 top-2 h-6 w-6 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                                            disabled={isUnpinning}
                                            onClick={() => {
                                                void handleUnpin(message);
                                            }}
                                            size="icon"
                                            title="Unpin message"
                                            type="button"
                                            variant="ghost"
                                        >
                                            {isUnpinning ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <X className="h-3 w-3" />
                                            )}
                                        </Button>
                                    ) : null}

                                    <div className="flex gap-3">
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
                                                <span>
                                                    {formatMessageTimestamp(
                                                        message.createdAt,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-sm">
                                                <MessageWithMentions
                                                    mentions={message.mentions}
                                                    text={message.text}
                                                />
                                            </div>
                                            {message.poll ? (
                                                <MessagePollBlock
                                                    currentUserId={
                                                        currentUserId ?? null
                                                    }
                                                    messageId={message.id}
                                                    poll={message.poll}
                                                    readOnly
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
                                            {message.attachments &&
                                            message.attachments.length > 0 ? (
                                                <div className="mt-2 space-y-1">
                                                    {message.attachments.map(
                                                        (attachment, index) => (
                                                            <FileAttachmentDisplay
                                                                attachment={
                                                                    attachment
                                                                }
                                                                key={`${message.id}-${attachment.fileId}-${index}`}
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                                        <span>
                                            Pinned{" "}
                                            {message.pinnedAt
                                                ? formatMessageTimestamp(
                                                      message.pinnedAt,
                                                  )
                                                : "recently"}
                                        </span>
                                        {onJumpToMessage ? (
                                            <Button
                                                className="h-6 text-xs"
                                                onClick={() => {
                                                    onJumpToMessage(message.id);
                                                }}
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                            >
                                                Jump to message
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {messages.length > 0 ? (
                <div className="border-t pt-3 text-center text-xs text-muted-foreground">
                    {messages.length} pinned{" "}
                    {messages.length === 1 ? "message" : "messages"} (max 50)
                </div>
            ) : null}
        </>
    );
}
