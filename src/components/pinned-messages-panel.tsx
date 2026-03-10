"use client";

import { useState, useEffect, useCallback } from "react";
import { adaptChannelMessages } from "@/lib/chat-surface";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Pin } from "lucide-react";
import { ChatPinnedMessagesContent } from "@/components/chat-pinned-messages-content";
import type { Message } from "@/lib/types";

type PinnedMessagesPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string | null;
    channelName?: string;
    onJumpToMessage?: (messageId: string) => void;
    onUnpin?: (messageId: string) => Promise<void>;
    canManageMessages?: boolean;
};

export function PinnedMessagesPanel({
    open,
    onOpenChange,
    channelId,
    channelName,
    onJumpToMessage,
    onUnpin,
    canManageMessages = false,
}: PinnedMessagesPanelProps) {
    const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch pinned messages when panel opens
    const fetchPins = useCallback(async () => {
        if (!channelId) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/channels/${channelId}/pins`);
            if (!res.ok) {
                throw new Error("Failed to fetch pinned messages");
            }
            const data = await res.json();
            setPinnedMessages(data.pins || []);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load pinned messages",
            );
        } finally {
            setLoading(false);
        }
    }, [channelId]);

    useEffect(() => {
        if (open && channelId) {
            void fetchPins();
        }
    }, [open, channelId, fetchPins]);

    const handleJump = (messageId: string) => {
        if (onJumpToMessage) {
            onJumpToMessage(messageId);
            onOpenChange(false);
        }
    };

    const surfaceMessages = adaptChannelMessages(pinnedMessages);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className="flex w-full flex-col sm:max-w-lg"
                side="right"
            >
                <SheetHeader className="border-b pb-4">
                    <SheetTitle className="flex items-center gap-2">
                        <Pin className="h-5 w-5" />
                        Pinned Messages
                        {channelName && (
                            <span className="text-sm font-normal text-muted-foreground">
                                in #{channelName}
                            </span>
                        )}
                    </SheetTitle>
                </SheetHeader>

                <ChatPinnedMessagesContent
                    canManageMessages={canManageMessages}
                    channelName={channelName}
                    error={error}
                    loading={loading}
                    messages={surfaceMessages}
                    onJumpToMessage={onJumpToMessage ? handleJump : undefined}
                    onUnpin={
                        onUnpin
                            ? async (message) => {
                                  await onUnpin(message.id);
                                  setPinnedMessages((prev) =>
                                      prev.filter(
                                          (item) => item.$id !== message.id,
                                      ),
                                  );
                              }
                            : undefined
                    }
                />
            </SheetContent>
        </Sheet>
    );
}
