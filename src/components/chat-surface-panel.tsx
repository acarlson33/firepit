"use client";

import { useEffect, useRef, useState } from "react";
import type {
    ClipboardEvent,
    FormEvent,
    KeyboardEvent,
    RefObject,
} from "react";

import { Image as ImageIcon, Loader2, MessageSquare, X } from "lucide-react";

import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import type { CustomEmoji, FileAttachment } from "@/lib/types";
import { ChatInput } from "@/components/chat-input";
import { ChatSurfaceMessageItem } from "@/components/chat-surface-message-item";
import { EmojiPicker } from "@/components/emoji-picker";
import { FileUploadButton, FilePreview } from "@/components/file-upload-button";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import {
    MESSAGE_LIST_VIEWPORT_HEIGHT,
    type VirtualizedScrollBehavior,
} from "@/components/virtualized-message-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type TypingUser = {
    userId: string;
    userName?: string;
    updatedAt: string;
};

type ChatSurfacePanelProps = {
    showSurface?: boolean;
    surfaceMessages: ChatSurfaceMessage[];
    loading: boolean;
    emptyTitle: string;
    emptyDescription: string;
    placeholderTitle?: string;
    placeholderDescription?: string;
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
    onOpenImageViewer: (imageUrl: string) => void;
    onOpenProfileModal?: (
        userId: string,
        userName?: string,
        displayName?: string,
        avatarUrl?: string,
    ) => void;
    onOpenThread?: (message: ChatSurfaceMessage) => Promise<void> | void;
    onTogglePin?: (message: ChatSurfaceMessage) => Promise<void>;
    customEmojis?: CustomEmoji[];
    onUploadCustomEmoji?: (file: File, name: string) => Promise<void>;
    shouldShowLoadOlder?: boolean;
    onLoadOlder?: () => void;
    pinnedMessageIds?: string[];
    canManageMessages?: boolean;
    messageDensity?: "compact" | "cozy";
    knownNames?: string[];
    typingUsers?: Record<string, TypingUser>;
    messageContainerRef?: RefObject<HTMLDivElement | null>;
    virtualizationThreshold?: number;
    composer?: {
        text: string;
        onTextChange: (text: string) => void;
        onSubmit: () => Promise<void> | void;
        onCancelEdit?: () => void;
        replyingTo?: {
            authorLabel: string;
            text: string;
        } | null;
        onCancelReply?: () => void;
        readOnly?: boolean;
        readOnlyMessage?: string;
        selectedImagePreview?: string | null;
        onSelectImageFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
        onRemoveImage?: () => void;
        fileAttachments: FileAttachment[];
        onRemoveFileAttachment: (index: number) => void;
        onFileAttachmentSelect: (attachment: FileAttachment) => void;
        onEmojiSelect: (emoji: string) => void;
        fileInputRef: RefObject<HTMLInputElement | null>;
        placeholder: string;
        disabled?: boolean;
        sending?: boolean;
        uploadingImage?: boolean;
        onPaste?: (event: ClipboardEvent) => void;
        onMentionsChange?: (names: string[]) => void;
    };
    unreadAnchorMessageId?: string | null;
    unreadSummaryLabel?: string | null;
    onCatchUpUnread?: () => void;
    onJumpToUnread?: () => void;
};

function UnreadBoundary() {
    return (
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-px flex-1 bg-primary/30" />
            First unread
            <span className="h-px flex-1 bg-primary/30" />
        </div>
    );
}

export function ChatSurfacePanel({
    showSurface = true,
    surfaceMessages,
    loading,
    emptyTitle,
    emptyDescription,
    placeholderTitle = "Pick a conversation",
    placeholderDescription = "Your messages will appear here.",
    currentUserId,
    userIdSlice = 6,
    editingMessageId,
    deleteConfirmId,
    setDeleteConfirmId,
    onStartEdit,
    onStartReply,
    onRemove,
    onToggleReaction,
    onOpenImageViewer,
    onOpenProfileModal,
    onOpenThread,
    onTogglePin,
    customEmojis,
    onUploadCustomEmoji,
    shouldShowLoadOlder = false,
    onLoadOlder,
    pinnedMessageIds,
    canManageMessages = false,
    messageDensity = "compact",
    knownNames,
    typingUsers,
    messageContainerRef,
    virtualizationThreshold = 20,
    composer,
    unreadAnchorMessageId,
    unreadSummaryLabel,
    onCatchUpUnread,
    onJumpToUnread,
}: ChatSurfacePanelProps) {
    const compactMessages = messageDensity === "compact";
    const showLoadingOverlay = loading && surfaceMessages.length > 0;
    const composerContainerRef = useRef<HTMLDivElement>(null);
    const previousSendingRef = useRef(false);
    const shouldScrollAfterSubmitRef = useRef(false);
    const previousLoadingRef = useRef(loading);
    const previousMessageCountRef = useRef(surfaceMessages.length);
    const mediaSettlingDeadlineRef = useRef(0);
    const [virtualScrollRequest, setVirtualScrollRequest] = useState<{
        behavior: VirtualizedScrollBehavior;
        id: number;
    } | null>(null);
    const typingUserList = Object.values(typingUsers ?? {});
    const typingLabel = typingUserList
        .map(
            (typingUser) =>
                typingUser.userName || typingUser.userId.slice(0, 6),
        )
        .join(", ");
    const useVirtualScrolling =
        showSurface && surfaceMessages.length >= virtualizationThreshold;

    function requestMessageListBottomScroll(
        behavior: VirtualizedScrollBehavior = "smooth",
    ) {
        mediaSettlingDeadlineRef.current = Date.now() + 4_000;

        if (useVirtualScrolling) {
            setVirtualScrollRequest((current) => ({
                behavior,
                id: (current?.id ?? 0) + 1,
            }));
            return;
        }

        if (messageContainerRef?.current) {
            messageContainerRef.current.scrollTop =
                messageContainerRef.current.scrollHeight;
        }
    }

    function handleMessageMediaLoad(message: ChatSurfaceMessage) {
        if (Date.now() > mediaSettlingDeadlineRef.current) {
            return;
        }

        const trailingMessages = surfaceMessages.slice(-3);
        const isTrailingMessage = trailingMessages.some(
            (surfaceMessage) => surfaceMessage.id === message.id,
        );

        if (!isTrailingMessage) {
            return;
        }

        requestAnimationFrame(() => {
            requestMessageListBottomScroll("auto");
        });
    }

    function scrollComposerIntoView(behavior: ScrollBehavior = "smooth") {
        composerContainerRef.current?.scrollIntoView({
            behavior,
            block: "nearest",
            inline: "nearest",
        });
    }

    useEffect(() => {
        if (!composer) {
            return;
        }

        if (
            composer.selectedImagePreview ||
            composer.fileAttachments.length > 0
        ) {
            requestAnimationFrame(() => {
                scrollComposerIntoView();
            });
        }
    }, [
        composer,
        composer?.fileAttachments.length,
        composer?.selectedImagePreview,
    ]);

    useEffect(() => {
        if (!shouldScrollAfterSubmitRef.current) {
            return;
        }

        shouldScrollAfterSubmitRef.current = false;
        requestAnimationFrame(() => {
            requestMessageListBottomScroll();
            scrollComposerIntoView();
        });
    }, [surfaceMessages.length]);

    useEffect(() => {
        const wasLoading = previousLoadingRef.current;
        const previousMessageCount = previousMessageCountRef.current;

        previousLoadingRef.current = loading;
        previousMessageCountRef.current = surfaceMessages.length;

        if (!showSurface || loading || surfaceMessages.length === 0) {
            return;
        }

        if (!wasLoading && previousMessageCount > 0) {
            return;
        }

        requestAnimationFrame(() => {
            requestMessageListBottomScroll("auto");
        });
    }, [loading, showSurface, surfaceMessages.length, useVirtualScrolling]);

    useEffect(() => {
        const isSending = Boolean(
            composer?.sending || composer?.uploadingImage,
        );
        const wasSending = previousSendingRef.current;

        previousSendingRef.current = isSending;

        if (!wasSending || isSending) {
            return;
        }

        requestAnimationFrame(() => {
            requestMessageListBottomScroll();
            scrollComposerIntoView();
        });
    }, [composer?.sending, composer?.uploadingImage]);

    async function handleSubmit(event?: FormEvent | KeyboardEvent) {
        event?.preventDefault?.();
        if (!composer) {
            return;
        }

        shouldScrollAfterSubmitRef.current = true;
        await composer.onSubmit();

        requestAnimationFrame(() => {
            requestMessageListBottomScroll();
            scrollComposerIntoView();
        });
    }

    if (!showSurface) {
        return (
            <div className="flex h-[60vh] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-background/60 p-10 text-center text-sm text-muted-foreground">
                <div>
                    <p className="font-medium text-foreground">
                        {placeholderTitle}
                    </p>
                    <p>{placeholderDescription}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {unreadAnchorMessageId && (onJumpToUnread || onCatchUpUnread) ? (
                <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                    <div>
                        <p className="font-medium text-foreground">
                            Unread activity available
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {unreadSummaryLabel ||
                                "Jump to the first unread item or catch up from the latest messages."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {onJumpToUnread ? (
                            <Button
                                onClick={onJumpToUnread}
                                size="sm"
                                type="button"
                            >
                                Jump to unread
                            </Button>
                        ) : null}
                        {onCatchUpUnread ? (
                            <Button
                                onClick={onCatchUpUnread}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                Catch up
                            </Button>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <div
                className={
                    useVirtualScrolling
                        ? "relative min-w-0 w-full"
                        : `relative min-w-0 w-full overflow-y-auto rounded-3xl border border-border/60 bg-background/70 shadow-inner ${
                              compactMessages
                                  ? "space-y-2 p-3"
                                  : "space-y-3 p-4"
                          }`
                }
                style={
                    useVirtualScrolling
                        ? undefined
                        : { height: MESSAGE_LIST_VIEWPORT_HEIGHT }
                }
                data-message-scroll-container="true"
                ref={messageContainerRef}
            >
                {loading && surfaceMessages.length === 0 ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <div className="flex gap-3" key={index}>
                                <Skeleton className="size-8 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-16 w-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : surfaceMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
                        <MessageSquare className="mb-2 size-12 text-muted-foreground" />
                        <p className="font-medium text-muted-foreground text-sm">
                            {emptyTitle}
                        </p>
                        <p className="max-w-xs text-muted-foreground/70 text-xs">
                            {emptyDescription}
                        </p>
                    </div>
                ) : useVirtualScrolling ? (
                    <VirtualizedMessageList
                        canManageMessages={canManageMessages}
                        customEmojis={customEmojis}
                        deleteConfirmId={deleteConfirmId}
                        editingMessageId={editingMessageId}
                        messageDensity={messageDensity}
                        messages={surfaceMessages}
                        onLoadOlder={onLoadOlder || (() => {})}
                        onOpenImageViewer={onOpenImageViewer}
                        onOpenProfileModal={
                            onOpenProfileModal || (() => undefined)
                        }
                        onOpenThread={onOpenThread}
                        onMediaLoad={handleMessageMediaLoad}
                        onRemove={onRemove}
                        onStartEdit={onStartEdit}
                        onStartReply={onStartReply}
                        onTogglePin={onTogglePin}
                        onToggleReaction={onToggleReaction}
                        onUploadCustomEmoji={onUploadCustomEmoji}
                        pinnedMessageIds={pinnedMessageIds}
                        setDeleteConfirmId={setDeleteConfirmId}
                        scrollToBottomRequest={virtualScrollRequest}
                        shouldShowLoadOlder={shouldShowLoadOlder}
                        unreadAnchorMessageId={unreadAnchorMessageId}
                        userId={currentUserId}
                        userIdSlice={userIdSlice}
                    />
                ) : (
                    <>
                        {shouldShowLoadOlder && onLoadOlder && (
                            <div className="flex justify-center pb-4">
                                <Button
                                    onClick={onLoadOlder}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                >
                                    Load older messages
                                </Button>
                            </div>
                        )}
                        {surfaceMessages.map((message) => (
                            <div key={message.id}>
                                {unreadAnchorMessageId === message.id ? (
                                    <UnreadBoundary />
                                ) : null}
                                <ChatSurfaceMessageItem
                                    canManageMessages={canManageMessages}
                                    currentUserId={currentUserId}
                                    customEmojis={customEmojis}
                                    deleteConfirmId={deleteConfirmId}
                                    editingMessageId={editingMessageId}
                                    knownNames={knownNames}
                                    message={message}
                                    messageDensity={messageDensity}
                                    onOpenImageViewer={onOpenImageViewer}
                                    onOpenProfileModal={onOpenProfileModal}
                                    onOpenThread={onOpenThread}
                                    onMediaLoad={handleMessageMediaLoad}
                                    onRemove={onRemove}
                                    onStartEdit={onStartEdit}
                                    onStartReply={onStartReply}
                                    onTogglePin={onTogglePin}
                                    onToggleReaction={onToggleReaction}
                                    onUploadCustomEmoji={onUploadCustomEmoji}
                                    pinnedMessageIds={pinnedMessageIds}
                                    setDeleteConfirmId={setDeleteConfirmId}
                                    userIdSlice={userIdSlice}
                                />
                            </div>
                        ))}
                    </>
                )}
                {showLoadingOverlay ? (
                    <div className="pointer-events-none absolute inset-0 rounded-3xl bg-background/80 backdrop-blur-[1px]">
                        <div className="flex h-full items-start justify-center pt-6">
                            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                                <Loader2 className="size-3.5 animate-spin" />
                                Updating messages...
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {typingUserList.length > 0 && (
                <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                    <span
                        aria-hidden="true"
                        className="inline-flex size-2 animate-pulse rounded-full bg-primary"
                    />
                    <span>
                        {typingLabel} {typingUserList.length > 1 ? "are" : "is"}{" "}
                        typing...
                    </span>
                </div>
            )}

            {composer && (
                <div
                    className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-4"
                    ref={composerContainerRef}
                >
                    {composer.replyingTo && (
                        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
                            <div className="truncate">
                                Replying to{" "}
                                <span className="font-medium">
                                    {composer.replyingTo.authorLabel}
                                </span>
                            </div>
                            {composer.onCancelReply && (
                                <Button
                                    onClick={composer.onCancelReply}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                            )}
                        </div>
                    )}

                    {editingMessageId && composer.onCancelEdit && (
                        <div className="flex items-center justify-between rounded-2xl border border-blue-200/60 bg-blue-50/60 px-4 py-3 text-sm dark:border-blue-500/40 dark:bg-blue-950/30">
                            <span className="text-blue-700 dark:text-blue-300">
                                Editing message
                            </span>
                            <Button
                                onClick={composer.onCancelEdit}
                                size="sm"
                                type="button"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                        </div>
                    )}

                    {composer.selectedImagePreview && (
                        <div className="relative inline-block">
                            <img
                                alt="Upload preview"
                                className="h-32 rounded-lg object-cover"
                                src={composer.selectedImagePreview}
                            />
                            {composer.onRemoveImage && (
                                <Button
                                    className="absolute -right-2 -top-2"
                                    onClick={composer.onRemoveImage}
                                    size="icon"
                                    type="button"
                                    variant="destructive"
                                >
                                    <X className="size-4" />
                                </Button>
                            )}
                        </div>
                    )}

                    {composer.fileAttachments.length > 0 && (
                        <div className="mb-2 flex flex-col gap-2">
                            {composer.fileAttachments.map(
                                (attachment, index) => (
                                    <FilePreview
                                        key={`${attachment.fileId}-${index}`}
                                        attachment={attachment}
                                        onRemove={() =>
                                            composer.onRemoveFileAttachment(
                                                index,
                                            )
                                        }
                                    />
                                ),
                            )}
                        </div>
                    )}

                    <form
                        className="flex flex-col gap-3 sm:flex-row sm:items-center"
                        onSubmit={(event) => {
                            void handleSubmit(event);
                        }}
                    >
                        <input
                            accept="image/*"
                            className="hidden"
                            onChange={composer.onSelectImageFile}
                            ref={composer.fileInputRef}
                            type="file"
                        />
                        <div className="flex items-center gap-2">
                            <Button
                                className="shrink-0"
                                disabled={
                                    composer.disabled ||
                                    Boolean(editingMessageId)
                                }
                                onClick={() =>
                                    composer.fileInputRef.current?.click()
                                }
                                size="icon"
                                type="button"
                                variant="outline"
                            >
                                <ImageIcon className="size-4" />
                            </Button>
                            <FileUploadButton
                                className="shrink-0"
                                disabled={
                                    composer.disabled ||
                                    Boolean(editingMessageId)
                                }
                                onFileSelect={composer.onFileAttachmentSelect}
                            />
                            <EmojiPicker
                                customEmojis={customEmojis}
                                onEmojiSelect={composer.onEmojiSelect}
                                onUploadCustomEmoji={onUploadCustomEmoji}
                            />
                        </div>
                        <ChatInput
                            aria-label={
                                editingMessageId ? "Edit message" : "Message"
                            }
                            className="flex-1 rounded-2xl border-border/60"
                            disabled={composer.disabled}
                            onChange={composer.onTextChange}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    void handleSubmit(event);
                                }
                                if (
                                    event.key === "Escape" &&
                                    composer.onCancelEdit
                                ) {
                                    composer.onCancelEdit();
                                }
                            }}
                            onMentionsChange={composer.onMentionsChange}
                            onPaste={composer.onPaste}
                            placeholder={composer.placeholder}
                            value={composer.text}
                        />
                        <Button
                            className="shrink-0 rounded-2xl"
                            disabled={
                                composer.disabled ||
                                (!composer.text.trim() &&
                                    !composer.selectedImagePreview &&
                                    composer.fileAttachments.length === 0)
                            }
                            type="submit"
                        >
                            {composer.sending || composer.uploadingImage ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    {composer.uploadingImage
                                        ? "Uploading..."
                                        : "Sending..."}
                                </>
                            ) : editingMessageId ? (
                                "Save"
                            ) : (
                                "Send"
                            )}
                        </Button>
                    </form>
                </div>
            )}
        </div>
    );
}
