"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Lock, ArrowLeft, Users, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/status-indicator";
import { ImageViewer } from "@/components/image-viewer";
import { ChatPinnedMessagesContent } from "@/components/chat-pinned-messages-content";
import { ChatSurfacePanel } from "@/components/chat-surface-panel";
import { ChatThreadContent } from "@/components/chat-thread-content";
import { MentionHelpTooltip } from "@/components/mention-help-tooltip";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import {
    adaptDirectMessages,
    fromDirectMessage,
    type ChatSurfaceMessage,
} from "@/lib/chat-surface";
import { jumpToMessage } from "@/lib/message-navigation";
import type { DirectMessage, Conversation, FileAttachment } from "@/lib/types";
import { useChatSurfaceController } from "@/app/chat/hooks/useChatSurfaceController";
import { uploadImage } from "@/lib/appwrite-dms-client";
import { toggleReaction } from "@/lib/reactions-client";
import { toast } from "sonner";

// Use virtual scrolling when message count exceeds this threshold
const VIRTUALIZATION_THRESHOLD = 50;

type DirectMessageViewProps = {
    conversation: Conversation;
    messages: DirectMessage[];
    surfaceMessages: ChatSurfaceMessage[];
    loading: boolean;
    sending: boolean;
    currentUserId: string;
    readOnly?: boolean;
    readOnlyReason?: string | null;
    messageDensity?: "compact" | "cozy";
    onSend: (
        _text: string,
        _imageFileId?: string,
        _imageUrl?: string,
        _replyToId?: string,
        _attachments?: unknown[],
    ) => Promise<void>;
    onEdit: (_messageId: string, _newText: string) => Promise<void>;
    onDelete: (_messageId: string) => Promise<void>;
    onBack?: () => void;
    typingUsers?: Record<
        string,
        { userId: string; userName?: string; updatedAt: string }
    >;
    onTypingChange?: (_text: string) => void;
    pinnedMessages?: DirectMessage[];
    pinnedMessageIds?: string[];
    onTogglePinMessage?: (_message: DirectMessage) => Promise<void>;
    onOpenThread?: (_message: DirectMessage) => Promise<void>;
    activeThreadParent?: DirectMessage | null;
    threadMessages?: DirectMessage[];
    threadLoading?: boolean;
    onCloseThread?: () => void;
    onSendThreadReply?: (_text: string) => Promise<void> | void;
    onOpenProfileModal?: (
        userId: string,
        userName?: string,
        displayName?: string,
        avatarUrl?: string,
    ) => void;
};

export function DirectMessageView({
    conversation,
    messages,
    surfaceMessages,
    loading,
    sending,
    currentUserId,
    readOnly = false,
    readOnlyReason,
    messageDensity = "compact",
    onSend,
    onEdit,
    onDelete,
    onBack,
    typingUsers = {},
    onTypingChange,
    pinnedMessages: providedPinnedMessages,
    pinnedMessageIds,
    onTogglePinMessage,
    onOpenThread,
    activeThreadParent,
    threadMessages = [],
    threadLoading = false,
    onCloseThread,
    onSendThreadReply,
    onOpenProfileModal,
}: DirectMessageViewProps) {
    const [text, setText] = useState("");
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [replyingToMessage, setReplyingToMessage] =
        useState<DirectMessage | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [viewingImage, setViewingImage] = useState<{
        url: string;
        alt: string;
    } | null>(null);
    const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>(
        [],
    );
    const [threadReplyText, setThreadReplyText] = useState("");
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isGroup =
        conversation.isGroup || conversation.participants.length > 2;
    const otherUser = conversation.otherUser;
    const displayName = isGroup
        ? conversation.name || "Group DM"
        : otherUser?.displayName || otherUser?.userId || "Unknown User";
    const participantCount =
        conversation.participantCount ?? conversation.participants.length;
    const subtitle = isGroup
        ? `${participantCount} participant${participantCount === 1 ? "" : "s"}`
        : otherUser?.status;
    const composerDisabled = readOnly || sending || uploadingImage;
    const readOnlyMessage = readOnlyReason || "This conversation is read-only.";

    // Custom emojis
    const { customEmojis, uploadEmoji } = useCustomEmojis();

    // Collect all display names from visible DM messages so mentions with
    // spaces (like "avery <3") can be highlighted for old messages.
    const knownDisplayNames = useMemo(
        () => [
            ...new Set(
                messages
                    .map((m) => m.senderDisplayName)
                    .filter((n): n is string => Boolean(n)),
            ),
        ],
        [messages],
    );

    const pinnedMessages = useMemo(() => {
        if (providedPinnedMessages) {
            return providedPinnedMessages;
        }

        if (!Array.isArray(pinnedMessageIds) || pinnedMessageIds.length === 0) {
            return [] as DirectMessage[];
        }

        const byId = new Map(messages.map((message) => [message.$id, message]));
        return pinnedMessageIds
            .map((messageId) => byId.get(messageId))
            .filter((message): message is DirectMessage => Boolean(message));
    }, [messages, pinnedMessageIds, providedPinnedMessages]);
    const pinnedSurfaceMessages = useMemo(
        () => adaptDirectMessages(pinnedMessages),
        [pinnedMessages],
    );
    const threadParentSurfaceMessage = useMemo(
        () =>
            activeThreadParent ? fromDirectMessage(activeThreadParent) : null,
        [activeThreadParent],
    );
    const threadSurfaceMessages = useMemo(
        () => adaptDirectMessages(threadMessages),
        [threadMessages],
    );
    useEffect(() => {
        setThreadReplyText("");
    }, [activeThreadParent?.$id]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messagesContainerRef.current) {
            // Scroll the container, not the entire page
            messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
        }
    }, [messages.length]); // Only scroll when message count changes, not on every update

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (
            (!text.trim() && !selectedImage && fileAttachments.length === 0) ||
            sending
        ) {
            return;
        }

        const messageText = text;
        const replyToId = replyingToMessage?.$id;
        let imageFileId: string | undefined;
        let imageUrl: string | undefined;

        // Upload image if selected
        if (selectedImage) {
            try {
                setUploadingImage(true);
                const result = await uploadImage(selectedImage);
                imageFileId = result.fileId;
                imageUrl = result.url;
            } catch (error) {
                if (process.env.NODE_ENV === "development") {
                    console.error("Failed to upload image:", error);
                }
                setUploadingImage(false);
                return;
            } finally {
                setUploadingImage(false);
            }
        }

        // Prepare attachments
        const attachmentsToSend =
            fileAttachments.length > 0 ? [...fileAttachments] : undefined;

        setText("");
        setSelectedImage(null);
        setImagePreview(null);
        setReplyingToMessage(null);
        setFileAttachments([]);

        try {
            if (editingMessageId) {
                await onEdit(editingMessageId, messageText);
                setEditingMessageId(null);
            } else {
                await onSend(
                    messageText,
                    imageFileId,
                    imageUrl,
                    replyToId,
                    attachmentsToSend,
                );
            }
        } catch {
            // Re-set text on error so user can retry
            setText(messageText);
        }
    };
    const startEdit = (message: DirectMessage) => {
        setEditingMessageId(message.$id);
        setText(message.text);
        setReplyingToMessage(null);
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setText("");
    };

    const startReply = (message: DirectMessage) => {
        setReplyingToMessage(message);
        setEditingMessageId(null);
    };

    const cancelReply = () => {
        setReplyingToMessage(null);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        // Validate file type
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image must be less than 5MB");
            return;
        }

        setSelectedImage(file);

        // Create preview
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            setImagePreview(reader.result as string);
        });
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDelete = async (messageId: string) => {
        try {
            await onDelete(messageId);
            setDeleteConfirmId(null);
        } catch {
            // Error handled by parent
        }
    };

    const handleEmojiSelect = useCallback((emoji: string) => {
        setText((prev) => prev + emoji);
    }, []);

    const handleFileAttachmentSelect = useCallback(
        (attachment: FileAttachment) => {
            setFileAttachments((prev) => [...prev, attachment]);
        },
        [],
    );

    const removeFileAttachment = useCallback((index: number) => {
        setFileAttachments((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const surfaceController = useChatSurfaceController({
        rawMessages: messages,
        onStartEditRaw: startEdit,
        onStartReplyRaw: startReply,
        onRemove: (messageId) => {
            void handleDelete(messageId);
        },
        onToggleReaction: async (messageId, emoji, isAdding) => {
            await toggleReaction(messageId, emoji, isAdding, true);
        },
        onOpenThreadRaw: onOpenThread,
        onTogglePinRaw: onTogglePinMessage,
    });

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
                {onBack && (
                    <Button onClick={onBack} size="sm" variant="ghost">
                        <ArrowLeft className="size-4" />
                    </Button>
                )}
                <div className="relative">
                    <Avatar
                        alt={displayName}
                        fallback={displayName}
                        size="sm"
                        src={
                            isGroup
                                ? conversation.avatarUrl
                                : otherUser?.avatarUrl
                        }
                    />
                    {!isGroup && otherUser?.status && (
                        <div className="absolute -bottom-0.5 -right-0.5">
                            <StatusIndicator
                                size="sm"
                                status={
                                    otherUser.status as
                                        | "online"
                                        | "away"
                                        | "busy"
                                        | "offline"
                                }
                            />
                        </div>
                    )}
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-sm">{displayName}</h3>
                    {subtitle && (
                        <p className="text-muted-foreground text-xs capitalize flex items-center gap-1">
                            {isGroup && <Users className="size-3" />}
                            {subtitle}
                        </p>
                    )}
                    {readOnly ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <Lock className="size-3" />
                            Read only
                        </p>
                    ) : null}
                </div>
            </div>

            {readOnly ? (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
                    <Lock className="mt-0.5 size-4 shrink-0" />
                    <div>
                        <p className="font-medium">Messaging disabled</p>
                        <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
                            {readOnlyMessage}
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                    <MentionHelpTooltip />
                    <ChatSurfacePanel
                        currentUserId={currentUserId}
                        customEmojis={customEmojis}
                        deleteConfirmId={deleteConfirmId}
                        editingMessageId={editingMessageId}
                        emptyDescription="Start the conversation! Send a message to begin chatting."
                        emptyTitle="No messages yet"
                        knownNames={knownDisplayNames}
                        loading={loading}
                        messageContainerRef={messagesContainerRef}
                        messageDensity={messageDensity}
                        onOpenImageViewer={(imageUrl) => {
                            setViewingImage({
                                url: imageUrl,
                                alt: "Direct message image",
                            });
                        }}
                        onOpenProfileModal={onOpenProfileModal}
                        onOpenThread={surfaceController.onOpenThread}
                        onRemove={surfaceController.onRemove}
                        onStartEdit={surfaceController.onStartEdit}
                        onStartReply={surfaceController.onStartReply}
                        onTogglePin={surfaceController.onTogglePin}
                        onToggleReaction={surfaceController.onToggleReaction}
                        onUploadCustomEmoji={uploadEmoji}
                        pinnedMessageIds={pinnedMessageIds}
                        setDeleteConfirmId={setDeleteConfirmId}
                        surfaceMessages={surfaceMessages}
                        typingUsers={typingUsers}
                        userIdSlice={6}
                        virtualizationThreshold={VIRTUALIZATION_THRESHOLD}
                        composer={{
                            disabled: composerDisabled,
                            fileAttachments,
                            fileInputRef,
                            onCancelEdit: cancelEdit,
                            onCancelReply: cancelReply,
                            onEmojiSelect: handleEmojiSelect,
                            onFileAttachmentSelect: handleFileAttachmentSelect,
                            onMentionsChange: undefined,
                            onRemoveFileAttachment: removeFileAttachment,
                            onRemoveImage: removeImage,
                            onSelectImageFile: handleImageSelect,
                            onSubmit: handleSend,
                            onTextChange: (newValue) => {
                                setText(newValue);
                                onTypingChange?.(newValue);
                            },
                            placeholder: readOnly
                                ? readOnlyMessage
                                : "Type a message...",
                            readOnly,
                            readOnlyMessage,
                            replyingTo: replyingToMessage
                                ? {
                                      authorLabel:
                                          replyingToMessage.senderDisplayName ||
                                          "Unknown",
                                      text: replyingToMessage.text,
                                  }
                                : null,
                            selectedImagePreview: imagePreview,
                            sending,
                            text,
                            uploadingImage,
                        }}
                    />
                </div>

                <aside className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                            <Pin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            Pinned Messages
                        </div>
                        <ChatPinnedMessagesContent
                            canManageMessages={Boolean(onTogglePinMessage)}
                            messages={pinnedSurfaceMessages}
                            onJumpToMessage={jumpToMessage}
                            onUnpin={
                                onTogglePinMessage
                                    ? async (surfaceMessage) => {
                                          const rawMessage =
                                              pinnedMessages.find(
                                                  (message) =>
                                                      message.$id ===
                                                      surfaceMessage.id,
                                              );
                                          if (rawMessage) {
                                              await onTogglePinMessage(
                                                  rawMessage,
                                              );
                                          }
                                      }
                                    : undefined
                            }
                        />
                    </div>

                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="font-medium text-sm">Thread</h3>
                            {activeThreadParent && onCloseThread && (
                                <Button
                                    onClick={onCloseThread}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    Close
                                </Button>
                            )}
                        </div>
                        {!activeThreadParent ? (
                            <p className="text-xs text-muted-foreground">
                                Open a message thread to view replies here.
                            </p>
                        ) : (
                            <ChatThreadContent
                                currentUserId={currentUserId}
                                customEmojis={customEmojis}
                                loading={threadLoading}
                                onReplyTextChange={
                                    onSendThreadReply
                                        ? setThreadReplyText
                                        : undefined
                                }
                                onSendReply={
                                    onSendThreadReply
                                        ? async () => {
                                              const value = threadReplyText;
                                              setThreadReplyText("");
                                              await onSendThreadReply(value);
                                          }
                                        : undefined
                                }
                                onToggleReaction={
                                    surfaceController.onToggleReaction
                                }
                                parentMessage={threadParentSurfaceMessage}
                                replies={threadSurfaceMessages}
                                replyDisabled={readOnly}
                                replyPlaceholder={
                                    readOnly
                                        ? readOnlyMessage
                                        : "Reply in thread"
                                }
                                replyText={threadReplyText}
                            />
                        )}
                    </div>
                </aside>
            </div>
            {viewingImage && (
                <ImageViewer
                    alt={viewingImage.alt}
                    onClose={() => {
                        setViewingImage(null);
                    }}
                    src={viewingImage.url}
                />
            )}
        </div>
    );
}
