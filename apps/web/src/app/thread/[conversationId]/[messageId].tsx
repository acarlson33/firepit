"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatThreadContent } from "@/components/chat-thread-content";
import { fromDirectMessage, adaptDirectMessages } from "@/lib/chat-surface";
import {
    listDMThreadMessages,
    createDMThreadReply,
} from "@/lib/thread-pin-client";
import { toggleReaction } from "@/lib/reactions-client";
import { useAuth } from "@/contexts/auth-context";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import type { DirectMessage } from "@/lib/types";

type ParentMessageResponse = {
    $id: string;
    conversationId: string;
    senderId: string;
    senderDisplayName?: string;
    senderAvatarUrl?: string;
    senderAvatarFramePreset?: string;
    senderAvatarFrameUrl?: string;
    senderPronouns?: string;
    text: string;
    imageFileId?: string;
    imageUrl?: string;
    attachments?: unknown;
    replyToId?: string;
    replyTo?: {
        text: string;
        senderDisplayName?: string;
    };
    threadId?: string;
    threadMessageCount?: number;
    threadParticipants?: string[];
    lastThreadReplyAt?: string;
    mentions?: string[];
    reactions?: unknown[];
    isPinned?: boolean;
    pinnedAt?: string;
    pinnedBy?: string;
    $createdAt: string;
    editedAt?: string;
    removedAt?: string;
    removedBy?: string;
    receiverId?: string;
};

export default function DmThreadPage() {
    const params = useParams();
    const router = useRouter();
    const { userData } = useAuth();
    const { customEmojis } = useCustomEmojis();

    const conversationId = params.conversationId as string;
    const messageId = params.messageId as string;
    const currentUserId = userData?.userId ?? null;

    const [parentMessage, setParentMessage] = useState<DirectMessage | null>(
        null,
    );
    const [threadMessages, setThreadMessages] = useState<DirectMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [threadLoading, setThreadLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [sendingReply, setSendingReply] = useState(false);

    // Load parent message and thread replies
    useEffect(() => {
        let cancelled = false;

        async function loadThread() {
            if (!messageId || !conversationId) {
                return;
            }

            setLoading(true);
            setError(null);

            try {
                // Fetch parent message
                const parentRes = await fetch(
                    `/api/direct-messages/${encodeURIComponent(messageId)}`,
                );
                if (!parentRes.ok) {
                    throw new Error("Failed to load parent message");
                }
                const parentData =
                    (await parentRes.json()) as ParentMessageResponse;

                if (cancelled) {
                    return;
                }

                // Normalize the parent message into a DirectMessage shape
                const normalizedParent: DirectMessage = {
                    $id: parentData.$id,
                    conversationId: parentData.conversationId,
                    senderId: parentData.senderId,
                    senderDisplayName: parentData.senderDisplayName,
                    senderAvatarUrl: parentData.senderAvatarUrl,
                    senderAvatarFramePreset:
                        parentData.senderAvatarFramePreset,
                    senderAvatarFrameUrl: parentData.senderAvatarFrameUrl,
                    senderPronouns: parentData.senderPronouns,
                    text: parentData.text,
                    imageFileId: parentData.imageFileId,
                    imageUrl: parentData.imageUrl,
                    attachments:
                        typeof parentData.attachments === "string"
                            ? JSON.parse(parentData.attachments)
                            : parentData.attachments,
                    replyToId: parentData.replyToId,
                    replyTo: parentData.replyTo,
                    threadId: parentData.threadId,
                    threadMessageCount: parentData.threadMessageCount,
                    threadParticipants: parentData.threadParticipants,
                    lastThreadReplyAt: parentData.lastThreadReplyAt,
                    mentions: parentData.mentions,
                    reactions: parentData.reactions as DirectMessage["reactions"],
                    isPinned: parentData.isPinned,
                    pinnedAt: parentData.pinnedAt,
                    pinnedBy: parentData.pinnedBy,
                    $createdAt: parentData.$createdAt,
                    editedAt: parentData.editedAt,
                    removedAt: parentData.removedAt,
                    removedBy: parentData.removedBy,
                    receiverId: parentData.receiverId,
                };

                setParentMessage(normalizedParent);

                // Fetch thread replies
                setThreadLoading(true);
                const replies = await listDMThreadMessages(messageId);
                if (!cancelled) {
                    setThreadMessages(replies);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load thread",
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setThreadLoading(false);
                }
            }
        }

        void loadThread();

        return () => {
            cancelled = true;
        };
    }, [messageId, conversationId]);

    const handleSendReply = useCallback(async () => {
        const value = replyText.trim();
        if (!value || !parentMessage || sendingReply) {
            return;
        }

        setSendingReply(true);
        try {
            const reply = await createDMThreadReply(messageId, {
                text: value,
            });
            setThreadMessages((prev) => [...prev, reply]);
            setReplyText("");
        } catch (err) {
            console.error("Failed to send thread reply:", err);
        } finally {
            setSendingReply(false);
        }
    }, [replyText, parentMessage, sendingReply, messageId]);

    const handleToggleReaction = useCallback(
        async (targetMessageId: string, emoji: string, isAdding: boolean) => {
            await toggleReaction(targetMessageId, emoji, isAdding, true);
        },
        [],
    );

    // Convert to ChatSurfaceMessage for the shared component
    const parentSurfaceMessage = useMemo(
        () =>
            parentMessage ? fromDirectMessage(parentMessage) : null,
        [parentMessage],
    );

    const threadSurfaceMessages = useMemo(
        () => adaptDirectMessages(threadMessages),
        [threadMessages],
    );

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Loading thread...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button onClick={() => router.back()} variant="outline">
                    Go Back
                </Button>
            </div>
        );
    }

    if (!parentMessage) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
                <p className="text-sm text-muted-foreground">
                    Thread not found.
                </p>
                <Button onClick={() => router.back()} variant="outline">
                    Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-background">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/60 bg-background/80 px-6 py-4 shadow-sm">
                <Button
                    onClick={() => router.back()}
                    size="sm"
                    variant="ghost"
                >
                    <ArrowLeft className="size-4" />
                </Button>
                <h1 className="text-lg font-semibold">Thread</h1>
            </div>

            {/* Thread content area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Main thread panel */}
                <div className="flex flex-1 flex-col p-6">
                    <ChatThreadContent
                        currentUserId={currentUserId}
                        customEmojis={customEmojis}
                        loading={threadLoading}
                        onReplyTextChange={setReplyText}
                        onSendReply={
                            parentMessage && !parentMessage.removedAt
                                ? handleSendReply
                                : undefined
                        }
                        onToggleReaction={handleToggleReaction}
                        parentMessage={parentSurfaceMessage}
                        replies={threadSurfaceMessages}
                        replyDisabled={Boolean(parentMessage.removedAt)}
                        replyPlaceholder={
                            parentMessage.removedAt
                                ? "Cannot reply to a removed message"
                                : "Reply in thread"
                        }
                        sendingReply={sendingReply}
                        replyText={replyText}
                    />
                </div>
            </div>
        </div>
    );
}
