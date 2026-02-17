"use client";

import { useMemo } from "react";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import type { DirectMessage, Message, CustomEmoji } from "@/lib/types";

type VirtualizedDMListProps = {
    messages: DirectMessage[];
    userId: string | null;
    userIdSlice: number;
    editingMessageId: string | null;
    deleteConfirmId: string | null;
    setDeleteConfirmId: (id: string | null) => void;
    onStartEdit: (message: Message) => void;
    onStartReply: (message: Message) => void;
    onRemove: (id: string) => void;
    onTogglePin?: (message: Message) => Promise<void>;
    onOpenThread?: (message: Message) => Promise<void>;
    onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
    onOpenProfileModal: (
        userId: string,
        userName?: string,
        displayName?: string,
        avatarUrl?: string,
    ) => void;
    onOpenImageViewer: (imageUrl: string) => void;
    customEmojis?: CustomEmoji[];
    onUploadCustomEmoji?: (file: File, name: string) => Promise<void>;
    shouldShowLoadOlder: boolean;
    onLoadOlder: () => void;
    conversationId: string;
    messageDensity?: "compact" | "cozy";
    pinnedMessageIds?: string[];
};

/**
 * Adapter component that converts DirectMessage[] to Message[] format
 * for use with VirtualizedMessageList
 *
 * This bridges the type incompatibility between DirectMessage (DM-specific)
 * and Message (channel-specific) to enable virtual scrolling in DMs.
 *
 * Key mappings:
 * - senderId → userId
 * - conversationId → channelId
 * - senderDisplayName → userName/displayName
 */
export function VirtualizedDMList({
    messages,
    userId,
    userIdSlice,
    editingMessageId,
    deleteConfirmId,
    setDeleteConfirmId,
    onStartEdit,
    onStartReply,
    onRemove,
    onTogglePin,
    onOpenThread,
    onToggleReaction,
    onOpenProfileModal,
    onOpenImageViewer,
    customEmojis,
    onUploadCustomEmoji,
    shouldShowLoadOlder,
    onLoadOlder,
    conversationId,
    messageDensity = "compact",
    pinnedMessageIds,
}: VirtualizedDMListProps) {
    // Convert DirectMessage[] to Message[] format
    const adaptedMessages = useMemo<Message[]>(() => {
        return messages.map((dm) => ({
            $id: dm.$id,
            // Map senderId to userId (VirtualizedMessageList expects userId)
            userId: dm.senderId,
            userName: dm.senderDisplayName || dm.senderId,
            text: dm.text,
            $createdAt: dm.$createdAt,
            // Use conversationId as channelId for compatibility
            channelId: conversationId,
            // No serverId for DMs
            serverId: undefined,
            editedAt: dm.editedAt,
            removedAt: dm.removedAt,
            removedBy: dm.removedBy,
            imageFileId: dm.imageFileId,
            imageUrl: dm.imageUrl,
            attachments: dm.attachments,
            replyToId: dm.replyToId,
            threadId: dm.threadId,
            threadMessageCount: dm.threadMessageCount,
            threadParticipants: dm.threadParticipants,
            lastThreadReplyAt: dm.lastThreadReplyAt,
            mentions: dm.mentions,
            reactions: dm.reactions,
            // Map enriched profile data
            displayName: dm.senderDisplayName,
            pronouns: dm.senderPronouns,
            avatarUrl: dm.senderAvatarUrl,
            // Map reply context
            replyTo: dm.replyTo
                ? {
                      text: dm.replyTo.text,
                      userName: dm.replyTo.senderDisplayName,
                      displayName: dm.replyTo.senderDisplayName,
                  }
                : undefined,
        }));
    }, [messages, conversationId]);

    return (
        <VirtualizedMessageList
            customEmojis={customEmojis}
            deleteConfirmId={deleteConfirmId}
            editingMessageId={editingMessageId}
            messages={adaptedMessages}
            messageDensity={messageDensity}
            onLoadOlder={onLoadOlder}
            onOpenImageViewer={onOpenImageViewer}
            onOpenProfileModal={onOpenProfileModal}
            onRemove={onRemove}
            onTogglePin={onTogglePin}
            onOpenThread={onOpenThread}
            onStartEdit={onStartEdit}
            onStartReply={onStartReply}
            onToggleReaction={onToggleReaction}
            onUploadCustomEmoji={onUploadCustomEmoji}
            setDeleteConfirmId={setDeleteConfirmId}
            shouldShowLoadOlder={shouldShowLoadOlder}
            userId={userId}
            userIdSlice={userIdSlice}
            pinnedMessageIds={pinnedMessageIds}
        />
    );
}
