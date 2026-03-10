"use client";

import { useState, useEffect, useCallback } from "react";
import { adaptChannelMessages, fromChannelMessage } from "@/lib/chat-surface";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { ChatThreadContent } from "@/components/chat-thread-content";
import { MessageSquareMore } from "lucide-react";
import type { Message, CustomEmoji } from "@/lib/types";

type ThreadPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    parentMessage: Message | null;
    userId: string | null;
    customEmojis?: CustomEmoji[];
    onToggleReaction?: (
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) => Promise<void>;
};

type ThreadReply = Message;

export function ThreadPanel({
    open,
    onOpenChange,
    parentMessage,
    userId,
    customEmojis,
    onToggleReaction,
}: ThreadPanelProps) {
    const [replies, setReplies] = useState<ThreadReply[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Fetch thread replies when panel opens
    const fetchThread = useCallback(async () => {
        if (!parentMessage) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/messages/${parentMessage.$id}/thread`,
            );
            if (!res.ok) {
                throw new Error("Failed to fetch thread");
            }
            const data = await res.json();
            setReplies(data.replies || []);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to load thread",
            );
        } finally {
            setLoading(false);
        }
    }, [parentMessage]);

    useEffect(() => {
        if (open && parentMessage) {
            void fetchThread();
        }
    }, [open, parentMessage, fetchThread]);

    // Send a reply to the thread
    const handleSendReply = async () => {
        if (!replyText.trim() || !parentMessage || sending) {
            return;
        }

        setSending(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/messages/${parentMessage.$id}/thread`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: replyText.trim() }),
                },
            );

            if (!res.ok) {
                throw new Error("Failed to send reply");
            }

            const data = await res.json();
            setReplies((prev) => [...prev, data.reply]);
            setReplyText("");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to send reply",
            );
        } finally {
            setSending(false);
        }
    };

    if (!parentMessage) {
        return null;
    }

    const parentSurfaceMessage = fromChannelMessage(parentMessage);
    const replySurfaceMessages = adaptChannelMessages(replies);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className="flex w-full flex-col sm:max-w-lg"
                side="right"
            >
                <SheetHeader className="border-b pb-4">
                    <SheetTitle className="flex items-center gap-2">
                        <MessageSquareMore className="h-5 w-5" />
                        Thread
                    </SheetTitle>
                </SheetHeader>

                <ChatThreadContent
                    currentUserId={userId}
                    customEmojis={customEmojis}
                    error={error}
                    loading={loading}
                    onReplyTextChange={setReplyText}
                    onSendReply={handleSendReply}
                    onToggleReaction={onToggleReaction}
                    parentMessage={parentSurfaceMessage}
                    replies={replySurfaceMessages}
                    replyText={replyText}
                    sendingReply={sending}
                />
            </SheetContent>
        </Sheet>
    );
}
