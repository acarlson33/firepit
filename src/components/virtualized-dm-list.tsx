"use client";

import { useMemo } from "react";
import {
    adaptDirectMessages,
    type ChatSurfaceMessage,
} from "@/lib/chat-surface";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import type { DirectMessage, CustomEmoji } from "@/lib/types";

type VirtualizedDMListProps = {
    messages: DirectMessage[];
    userId: string | null;
    userIdSlice: number;
    editingMessageId: string | null;
    deleteConfirmId: string | null;
    setDeleteConfirmId: (id: string | null) => void;
    onStartEdit: (message: ChatSurfaceMessage) => void;
    onStartReply: (message: ChatSurfaceMessage) => void;
    onRemove: (id: string) => void;
    onTogglePin?: (message: ChatSurfaceMessage) => Promise<void>;
    onOpenThread?: (message: ChatSurfaceMessage) => Promise<void>;
    onToggleReaction: (
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) => Promise<void>;
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
 * Adapter component that projects DirectMessage[] into the shared
 * chat-surface contract for use with VirtualizedMessageList.
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
    const adaptedMessages = useMemo(
        () =>
            adaptDirectMessages(messages, {
                kind: "dm",
                conversationId,
            }),
        [messages, conversationId],
    );

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
