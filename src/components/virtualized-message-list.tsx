"use client";
import { Virtuoso } from "react-virtuoso";
import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import type { CustomEmoji } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChatSurfaceMessageItem } from "@/components/chat-surface-message-item";

type VirtualizedMessageListProps = {
    messages: ChatSurfaceMessage[];
    userId: string | null;
    userIdSlice: number;
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
    // Threading props
    onOpenThread?: (message: ChatSurfaceMessage) => void;
    // Pinning props
    onTogglePin?: (message: ChatSurfaceMessage) => Promise<void>;
    onPinMessage?: (messageId: string) => Promise<void>;
    onUnpinMessage?: (messageId: string) => Promise<void>;
    canManageMessages?: boolean;
    messageDensity?: "compact" | "cozy";
    pinnedMessageIds?: string[];
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
    onOpenThread,
    onTogglePin,
    onPinMessage,
    onUnpinMessage,
    canManageMessages = false,
    messageDensity = "compact",
    pinnedMessageIds,
}: VirtualizedMessageListProps) {
    const isCompact = messageDensity === "compact";

    return (
        <Virtuoso
            className={`h-[60vh] ${
                isCompact ? "rounded-2xl p-3" : "rounded-3xl p-4"
            } border border-border/60 bg-background/70 shadow-inner`}
            computeItemKey={(_, message) => message.id}
            data={messages}
            followOutput="smooth"
            initialTopMostItemIndex={messages.length - 1}
            itemContent={(_, message) => (
                <div className={isCompact ? "mx-4 mb-3" : "mx-4 mb-4"}>
                    <ChatSurfaceMessageItem
                        canManageMessages={canManageMessages}
                        currentUserId={userId}
                        customEmojis={customEmojis}
                        deleteConfirmId={deleteConfirmId}
                        editingMessageId={editingMessageId}
                        message={message}
                        messageDensity={messageDensity}
                        onOpenImageViewer={onOpenImageViewer}
                        onOpenProfileModal={onOpenProfileModal}
                        onOpenThread={onOpenThread}
                        onRemove={onRemove}
                        onStartEdit={onStartEdit}
                        onStartReply={onStartReply}
                        onTogglePin={onTogglePin ? onTogglePin : undefined}
                        onToggleReaction={onToggleReaction}
                        onUploadCustomEmoji={onUploadCustomEmoji}
                        pinnedMessageIds={pinnedMessageIds}
                        setDeleteConfirmId={setDeleteConfirmId}
                        userIdSlice={userIdSlice}
                    />
                </div>
            )}
            components={{
                Header: shouldShowLoadOlder
                    ? () => (
                          <div className="flex justify-center p-4">
                              <Button
                                  onClick={onLoadOlder}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                              >
                                  Load older messages
                              </Button>
                          </div>
                      )
                    : undefined,
            }}
        />
    );
}
