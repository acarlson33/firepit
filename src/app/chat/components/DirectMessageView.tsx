"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    Loader2,
    ArrowLeft,
    MessageSquare,
    Reply,
    Pencil,
    Trash2,
    Image as ImageIcon,
    X,
    Users,
    Pin,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import { ImageViewer } from "@/components/image-viewer";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";
import { EmojiPicker } from "@/components/emoji-picker";
import { ChatInput } from "@/components/chat-input";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionPicker } from "@/components/reaction-picker";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { MentionHelpTooltip } from "@/components/mention-help-tooltip";
import { FileUploadButton, FilePreview } from "@/components/file-upload-button";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { VirtualizedDMList } from "@/components/virtualized-dm-list";
import type {
    DirectMessage,
    Conversation,
    FileAttachment,
    Message,
} from "@/lib/types";
import { formatMessageTimestamp } from "@/lib/utils";
import { uploadImage } from "@/lib/appwrite-dms-client";
import { toggleReaction } from "@/lib/reactions-client";
import { toast } from "sonner";

// Use virtual scrolling when message count exceeds this threshold
const VIRTUALIZATION_THRESHOLD = 50;

type DirectMessageViewProps = {
    conversation: Conversation;
    messages: DirectMessage[];
    loading: boolean;
    sending: boolean;
    currentUserId: string;
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
    pinnedMessageIds?: string[];
    onTogglePinMessage?: (_message: DirectMessage) => Promise<void>;
    onOpenThread?: (_message: DirectMessage) => Promise<void>;
    activeThreadParent?: DirectMessage | null;
    threadMessages?: DirectMessage[];
    threadLoading?: boolean;
    onCloseThread?: () => void;
    onSendThreadReply?: (_text: string) => Promise<void> | void;
};

export function DirectMessageView({
    conversation,
    messages,
    loading,
    sending,
    currentUserId,
    messageDensity = "compact",
    onSend,
    onEdit,
    onDelete,
    onBack,
    typingUsers = {},
    onTypingChange,
    pinnedMessageIds,
    onTogglePinMessage,
    onOpenThread,
    activeThreadParent,
    threadMessages = [],
    threadLoading = false,
    onCloseThread,
    onSendThreadReply,
}: DirectMessageViewProps) {
    const compactMessages = messageDensity === "compact";
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
    const messagesEndRef = useRef<HTMLDivElement>(null);
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

    // Use virtual scrolling for large message lists (better performance)
    const useVirtualScrolling = messages.length > VIRTUALIZATION_THRESHOLD;

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
        if (!Array.isArray(pinnedMessageIds) || pinnedMessageIds.length === 0) {
            return [] as DirectMessage[];
        }

        const byId = new Map(messages.map((message) => [message.$id, message]));
        return pinnedMessageIds
            .map((messageId) => byId.get(messageId))
            .filter((message): message is DirectMessage => Boolean(message));
    }, [messages, pinnedMessageIds]);

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

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
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

    const confirmDelete = (messageId: string) => {
        setDeleteConfirmId(messageId);
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
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                    {/* Messages */}
                    <div
                        ref={messagesContainerRef}
                        className="h-[60vh] space-y-3 overflow-y-auto rounded-3xl border border-border/60 bg-background/70 p-4 shadow-inner"
                    >
                        {loading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div className="flex gap-3" key={i}>
                                        <Skeleton className="size-8 rounded-full" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-16 w-full" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
                                <MessageSquare className="mb-2 size-12 text-muted-foreground" />
                                <p className="font-medium text-muted-foreground text-sm">
                                    No messages yet
                                </p>
                                <p className="max-w-xs text-muted-foreground/70 text-xs">
                                    Start the conversation! Send a message to
                                    begin chatting.
                                </p>
                            </div>
                        ) : useVirtualScrolling ? (
                            <VirtualizedDMList
                                messages={messages}
                                userId={currentUserId}
                                userIdSlice={6}
                                editingMessageId={editingMessageId}
                                deleteConfirmId={deleteConfirmId}
                                setDeleteConfirmId={setDeleteConfirmId}
                                messageDensity={messageDensity}
                                onStartEdit={(msg: Message) => {
                                    const dmMessage = messages.find(
                                        (m) => m.$id === msg.$id,
                                    );
                                    if (dmMessage) {
                                        startEdit(dmMessage);
                                    }
                                }}
                                onStartReply={(msg: Message) => {
                                    const dmMessage = messages.find(
                                        (m) => m.$id === msg.$id,
                                    );
                                    if (dmMessage) {
                                        startReply(dmMessage);
                                    }
                                }}
                                onRemove={(id: string) => {
                                    void onDelete(id);
                                    setDeleteConfirmId(null);
                                }}
                                onTogglePin={
                                    onTogglePinMessage
                                        ? async (msg: Message) => {
                                              const dmMessage = messages.find(
                                                  (m) => m.$id === msg.$id,
                                              );
                                              if (dmMessage) {
                                                  await onTogglePinMessage(
                                                      dmMessage,
                                                  );
                                              }
                                          }
                                        : undefined
                                }
                                onOpenThread={
                                    onOpenThread
                                        ? async (msg: Message) => {
                                              const dmMessage = messages.find(
                                                  (m) => m.$id === msg.$id,
                                              );
                                              if (dmMessage) {
                                                  await onOpenThread(dmMessage);
                                              }
                                          }
                                        : undefined
                                }
                                onToggleReaction={async (
                                    messageId: string,
                                    emoji: string,
                                ) => {
                                    const message = messages.find(
                                        (m) => m.$id === messageId,
                                    );
                                    const hasReacted = message?.reactions?.some(
                                        (r) =>
                                            r.emoji === emoji &&
                                            r.userIds.includes(currentUserId),
                                    );
                                    await toggleReaction(
                                        messageId,
                                        emoji,
                                        !hasReacted,
                                        true,
                                    );
                                }}
                                onOpenProfileModal={(
                                    _userId: string,
                                    _userName?: string,
                                    _displayName?: string,
                                    _avatarUrl?: string,
                                ) => {
                                    // Profile modal handler - can be implemented later
                                }}
                                onOpenImageViewer={(imageUrl: string) => {
                                    setViewingImage({
                                        url: imageUrl,
                                        alt: "Direct message image",
                                    });
                                }}
                                customEmojis={customEmojis}
                                onUploadCustomEmoji={uploadEmoji}
                                shouldShowLoadOlder={false}
                                onLoadOlder={() => {
                                    // Load older messages handler - implement if pagination is added
                                }}
                                conversationId={conversation.$id}
                                pinnedMessageIds={pinnedMessageIds}
                            />
                        ) : (
                            <>
                                {messages.map((message) => {
                                    const isMine =
                                        message.senderId === currentUserId;
                                    const isEditing =
                                        editingMessageId === message.$id;
                                    const isDeleting =
                                        deleteConfirmId === message.$id;
                                    const removed = Boolean(message.removedAt);
                                    const isPinned =
                                        Array.isArray(pinnedMessageIds) &&
                                        pinnedMessageIds.includes(message.$id);
                                    const msgDisplayName =
                                        message.senderDisplayName ||
                                        message.senderId;

                                    return (
                                        <div
                                            data-message-id={message.$id}
                                            className={`group flex ${
                                                isEditing
                                                    ? "rounded-lg bg-blue-50 ring-2 ring-blue-500/50 dark:bg-blue-950/20"
                                                    : ""
                                            } ${compactMessages ? "gap-2 p-2" : "gap-3 p-3"}`}
                                            key={message.$id}
                                        >
                                            <Avatar
                                                alt={msgDisplayName}
                                                fallback={msgDisplayName}
                                                size="sm"
                                                src={message.senderAvatarUrl}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div
                                                    className={`flex flex-wrap items-baseline gap-2 text-muted-foreground ${
                                                        compactMessages
                                                            ? "text-[11px]"
                                                            : "text-xs"
                                                    }`}
                                                >
                                                    <span className="font-medium text-foreground">
                                                        {msgDisplayName}
                                                    </span>
                                                    {message.senderPronouns && (
                                                        <span className="italic">
                                                            (
                                                            {
                                                                message.senderPronouns
                                                            }
                                                            )
                                                        </span>
                                                    )}
                                                    <span>
                                                        {formatMessageTimestamp(
                                                            message.$createdAt,
                                                        )}
                                                    </span>
                                                    {message.editedAt && (
                                                        <span className="italic">
                                                            (edited)
                                                        </span>
                                                    )}
                                                    {removed && (
                                                        <span className="text-destructive">
                                                            (removed)
                                                        </span>
                                                    )}
                                                    {isPinned && (
                                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                            <Pin className="h-3 w-3" />
                                                            Pinned
                                                        </span>
                                                    )}
                                                    {isEditing && (
                                                        <span className="font-medium text-blue-600 dark:text-blue-400">
                                                            Editing...
                                                        </span>
                                                    )}
                                                </div>
                                                {message.replyTo && (
                                                    <div
                                                        className={`mt-1 rounded-lg border-l-2 border-muted-foreground/40 bg-muted/30 ${
                                                            compactMessages
                                                                ? "px-2 py-1 text-[11px]"
                                                                : "px-3 py-1.5 text-xs"
                                                        }`}
                                                    >
                                                        <div className="font-medium text-muted-foreground">
                                                            Replying to{" "}
                                                            {message.replyTo
                                                                .senderDisplayName ||
                                                                "Unknown"}
                                                        </div>
                                                        <div className="line-clamp-1 text-muted-foreground/80">
                                                            {
                                                                message.replyTo
                                                                    .text
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-start gap-2">
                                                    <div
                                                        className={`flex-1 wrap-break-word ${
                                                            compactMessages
                                                                ? "space-y-1 text-xs"
                                                                : "space-y-2 text-sm"
                                                        }`}
                                                    >
                                                        {message.imageUrl &&
                                                            !removed && (
                                                                <div className="mt-1">
                                                                    <ImageWithSkeleton
                                                                        alt="Uploaded image"
                                                                        className="max-h-96 cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
                                                                        onClick={() => {
                                                                            if (
                                                                                message.imageUrl
                                                                            ) {
                                                                                setViewingImage(
                                                                                    {
                                                                                        url: message.imageUrl,
                                                                                        alt: `Image from ${msgDisplayName}`,
                                                                                    },
                                                                                );
                                                                            }
                                                                        }}
                                                                        onKeyDown={(
                                                                            e,
                                                                        ) => {
                                                                            if (
                                                                                e.key ===
                                                                                    "Enter" ||
                                                                                e.key ===
                                                                                    " "
                                                                            ) {
                                                                                e.preventDefault();
                                                                                if (
                                                                                    message.imageUrl
                                                                                ) {
                                                                                    setViewingImage(
                                                                                        {
                                                                                            url: message.imageUrl,
                                                                                            alt: `Image from ${msgDisplayName}`,
                                                                                        },
                                                                                    );
                                                                                }
                                                                            }
                                                                        }}
                                                                        role="button"
                                                                        src={
                                                                            message.imageUrl
                                                                        }
                                                                        tabIndex={
                                                                            0
                                                                        }
                                                                    />
                                                                </div>
                                                            )}
                                                        {message.attachments &&
                                                            message.attachments
                                                                .length > 0 &&
                                                            !removed && (
                                                                <div className="mt-1 space-y-2">
                                                                    {message.attachments.map(
                                                                        (
                                                                            attachment,
                                                                            idx,
                                                                        ) => (
                                                                            <FileAttachmentDisplay
                                                                                key={`${message.$id}-${attachment.fileId}-${idx}`}
                                                                                attachment={
                                                                                    attachment
                                                                                }
                                                                            />
                                                                        ),
                                                                    )}
                                                                </div>
                                                            )}
                                                        {removed ? (
                                                            <span className="italic opacity-70">
                                                                Message removed
                                                            </span>
                                                        ) : message.text ? (
                                                            <p
                                                                className={
                                                                    compactMessages
                                                                        ? "text-xs"
                                                                        : "text-sm"
                                                                }
                                                            >
                                                                <MessageWithMentions
                                                                    text={
                                                                        message.text
                                                                    }
                                                                    mentions={
                                                                        message.mentions
                                                                    }
                                                                    knownNames={
                                                                        knownDisplayNames
                                                                    }
                                                                    currentUserId={
                                                                        currentUserId
                                                                    }
                                                                    customEmojis={
                                                                        customEmojis
                                                                    }
                                                                />
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                {!removed &&
                                                    message.reactions &&
                                                    message.reactions.length >
                                                        0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {message.reactions.map(
                                                                (reaction) => (
                                                                    <ReactionButton
                                                                        key={
                                                                            reaction.emoji
                                                                        }
                                                                        currentUserId={
                                                                            currentUserId
                                                                        }
                                                                        reaction={
                                                                            reaction
                                                                        }
                                                                        customEmojis={
                                                                            customEmojis
                                                                        }
                                                                        onToggle={async (
                                                                            emoji,
                                                                            isAdding,
                                                                        ) => {
                                                                            try {
                                                                                await toggleReaction(
                                                                                    message.$id,
                                                                                    emoji,
                                                                                    isAdding,
                                                                                    true,
                                                                                );
                                                                            } catch (error) {
                                                                                if (
                                                                                    process
                                                                                        .env
                                                                                        .NODE_ENV ===
                                                                                    "development"
                                                                                ) {
                                                                                    console.error(
                                                                                        "Failed to toggle DM reaction:",
                                                                                        error,
                                                                                    );
                                                                                }
                                                                            }
                                                                        }}
                                                                    />
                                                                ),
                                                            )}
                                                        </div>
                                                    )}

                                                {typeof message.threadMessageCount ===
                                                    "number" &&
                                                    message.threadMessageCount >
                                                        0 &&
                                                    onOpenThread && (
                                                        <button
                                                            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                                            onClick={() => {
                                                                void onOpenThread(
                                                                    message,
                                                                );
                                                            }}
                                                            type="button"
                                                        >
                                                            <MessageSquare className="h-3 w-3" />
                                                            {
                                                                message.threadMessageCount
                                                            }{" "}
                                                            {message.threadMessageCount ===
                                                            1
                                                                ? "reply"
                                                                : "replies"}
                                                        </button>
                                                    )}

                                                {!removed && (
                                                    <div
                                                        className={`mt-1 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${isMine ? "justify-end" : ""}`}
                                                    >
                                                        <ReactionPicker
                                                            customEmojis={
                                                                customEmojis
                                                            }
                                                            onUploadCustomEmoji={
                                                                uploadEmoji
                                                            }
                                                            onSelectEmoji={async (
                                                                emoji,
                                                            ) => {
                                                                try {
                                                                    await toggleReaction(
                                                                        message.$id,
                                                                        emoji,
                                                                        true,
                                                                        true,
                                                                    );
                                                                } catch (error) {
                                                                    if (
                                                                        process
                                                                            .env
                                                                            .NODE_ENV ===
                                                                        "development"
                                                                    ) {
                                                                        console.error(
                                                                            "Failed to add DM reaction:",
                                                                            error,
                                                                        );
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                        <Button
                                                            aria-label="Reply"
                                                            onClick={() =>
                                                                startReply(
                                                                    message,
                                                                )
                                                            }
                                                            size="sm"
                                                            type="button"
                                                            variant="ghost"
                                                        >
                                                            <Reply className="h-4 w-4" />
                                                        </Button>
                                                        {onOpenThread && (
                                                            <Button
                                                                aria-label="Start thread"
                                                                onClick={() => {
                                                                    void onOpenThread(
                                                                        message,
                                                                    );
                                                                }}
                                                                size="sm"
                                                                type="button"
                                                                variant="ghost"
                                                            >
                                                                <MessageSquare className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        {onTogglePinMessage && (
                                                            <Button
                                                                aria-label={isPinned ? "Unpin message" : "Pin message"}
                                                                onClick={() => {
                                                                    void onTogglePinMessage(
                                                                        message,
                                                                    );
                                                                }}
                                                                size="sm"
                                                                type="button"
                                                                variant="ghost"
                                                            >
                                                                <Pin
                                                                    className={`h-4 w-4 ${isPinned ? "text-amber-600 dark:text-amber-400" : ""}`}
                                                                />
                                                            </Button>
                                                        )}
                                                        {isMine && (
                                                            <>
                                                                <Button
                                                                    onClick={() =>
                                                                        startEdit(
                                                                            message,
                                                                        )
                                                                    }
                                                                    size="sm"
                                                                    type="button"
                                                                    variant="ghost"
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                                {isDeleting ? (
                                                                    <>
                                                                        <Button
                                                                            onClick={() => {
                                                                                void handleDelete(
                                                                                    message.$id,
                                                                                );
                                                                            }}
                                                                            size="sm"
                                                                            type="button"
                                                                            variant="destructive"
                                                                        >
                                                                            Confirm
                                                                        </Button>
                                                                        <Button
                                                                            onClick={() =>
                                                                                setDeleteConfirmId(
                                                                                    null,
                                                                                )
                                                                            }
                                                                            size="sm"
                                                                            type="button"
                                                                            variant="ghost"
                                                                        >
                                                                            Cancel
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <Button
                                                                        onClick={() =>
                                                                            confirmDelete(
                                                                                message.$id,
                                                                            )
                                                                        }
                                                                        size="sm"
                                                                        type="button"
                                                                        variant="ghost"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                {isDeleting && (
                                                    <div className="mt-2 flex items-center gap-2 rounded border border-destructive bg-destructive/10 p-2">
                                                        <span className="flex-1 text-sm">
                                                            Delete this message?
                                                        </span>
                                                        <Button
                                                            onClick={() =>
                                                                void handleDelete(
                                                                    message.$id,
                                                                )
                                                            }
                                                            size="sm"
                                                            variant="destructive"
                                                        >
                                                            Delete
                                                        </Button>
                                                        <Button
                                                            onClick={() =>
                                                                setDeleteConfirmId(
                                                                    null,
                                                                )
                                                            }
                                                            size="sm"
                                                            variant="outline"
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-all duration-300 ${Object.values(typingUsers).length > 0 ? "bg-muted/50 opacity-100" : "pointer-events-none opacity-0"}`} aria-live="polite">
                                    <span
                                        className="inline-flex size-2 shrink-0 animate-pulse rounded-full bg-primary"
                                        aria-hidden="true"
                                    />
                                    <span className="truncate">
                                        {Object.values(typingUsers)
                                            .map(
                                                (t) =>
                                                    t.userName ||
                                                    t.userId.slice(0, 6),
                                            )
                                            .join(", ")}{" "}
                                        {Object.values(typingUsers).length >
                                        1
                                            ? "are"
                                            : "is"}{" "}
                                        typing...
                                    </span>
                                </div>
                            </>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="space-y-3">
                        <MentionHelpTooltip />
                        {replyingToMessage && (
                            <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
                                <div className="flex-1">
                                    <div className="font-medium">
                                        Replying to{" "}
                                        {replyingToMessage.senderDisplayName ||
                                            "Unknown"}
                                    </div>
                                    <div className="line-clamp-1 text-xs text-muted-foreground">
                                        {replyingToMessage.text}
                                    </div>
                                </div>
                                <Button
                                    onClick={cancelReply}
                                    size="sm"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                            </div>
                        )}
                        {editingMessageId && (
                            <div className="flex items-center justify-between rounded-2xl border border-blue-200/60 bg-blue-50/60 px-4 py-3 text-sm dark:border-blue-500/40 dark:bg-blue-950/30">
                                <span className="text-blue-700 dark:text-blue-300">
                                    Editing message
                                </span>
                                <Button
                                    onClick={cancelEdit}
                                    size="sm"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                            </div>
                        )}
                        {imagePreview && (
                            <div className="relative mb-2 inline-block">
                                <img
                                    alt="Upload preview"
                                    className="h-32 rounded-lg object-cover"
                                    src={imagePreview}
                                />
                                <Button
                                    className="absolute -right-2 -top-2"
                                    onClick={removeImage}
                                    size="icon"
                                    type="button"
                                    variant="destructive"
                                >
                                    <X className="size-4" />
                                </Button>
                            </div>
                        )}
                        {fileAttachments.length > 0 && (
                            <div className="flex flex-col gap-2 mb-2">
                                {fileAttachments.map((attachment, index) => (
                                    <FilePreview
                                        key={`${attachment.fileId}-${index}`}
                                        attachment={attachment}
                                        onRemove={() =>
                                            removeFileAttachment(index)
                                        }
                                    />
                                ))}
                            </div>
                        )}
                        <form
                            className="flex flex-col gap-3 sm:flex-row sm:items-center"
                            onSubmit={handleSend}
                        >
                            <input
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageSelect}
                                ref={fileInputRef}
                                type="file"
                            />
                            <Button
                                disabled={
                                    sending ||
                                    uploadingImage ||
                                    Boolean(editingMessageId)
                                }
                                onClick={() => fileInputRef.current?.click()}
                                size="icon"
                                type="button"
                                variant="outline"
                                className="shrink-0"
                            >
                                <ImageIcon className="size-4" />
                            </Button>
                            <FileUploadButton
                                onFileSelect={handleFileAttachmentSelect}
                                disabled={
                                    sending ||
                                    uploadingImage ||
                                    Boolean(editingMessageId)
                                }
                                className="shrink-0"
                            />
                            <EmojiPicker
                                onEmojiSelect={handleEmojiSelect}
                                customEmojis={customEmojis}
                                onUploadCustomEmoji={uploadEmoji}
                            />
                            <ChatInput
                                aria-label={
                                    editingMessageId
                                        ? "Edit message"
                                        : "Message"
                                }
                                disabled={sending || uploadingImage}
                                onChange={(newValue) => {
                                    setText(newValue);
                                    if (onTypingChange) {
                                        onTypingChange(newValue);
                                    }
                                }}
                                placeholder="Type a message..."
                                value={text}
                                className="flex-1 rounded-2xl border-border/60"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void handleSend(
                                            e as unknown as React.FormEvent,
                                        );
                                    }
                                    if (e.key === "Escape") {
                                        cancelEdit();
                                    }
                                }}
                            />
                            <Button
                                disabled={
                                    sending ||
                                    uploadingImage ||
                                    (!text.trim() &&
                                        !selectedImage &&
                                        fileAttachments.length === 0)
                                }
                                type="submit"
                                className="rounded-2xl shrink-0"
                            >
                                {sending || uploadingImage ? (
                                    <>
                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                        {uploadingImage
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
                </div>

                <aside className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                            <Pin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            Pinned Messages
                        </div>
                        {pinnedMessages.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No pinned messages yet.
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {pinnedMessages.slice(0, 10).map((message) => (
                                    <button
                                        className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                                        key={message.$id}
                                        onClick={() => {
                                            const target = document.querySelector<HTMLElement>(
                                                `[data-message-id="${message.$id}"]`,
                                            );
                                            if (target) {
                                                target.scrollIntoView({
                                                    behavior: "smooth",
                                                    block: "center",
                                                });
                                                target.classList.add(
                                                    "ring-2",
                                                    "ring-amber-400",
                                                );
                                                window.setTimeout(() => {
                                                    if (target.isConnected) {
                                                        target.classList.remove(
                                                            "ring-2",
                                                            "ring-amber-400",
                                                        );
                                                    }
                                                }, 2000);
                                            }
                                        }}
                                        type="button"
                                    >
                                        {message.text || "(attachment)"}
                                    </button>
                                ))}
                            </div>
                        )}
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
                            <div className="space-y-3">
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {activeThreadParent.text || "(attachment)"}
                                </p>
                                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/50 bg-background/60 p-2">
                                    {threadLoading ? (
                                        <p className="text-xs text-muted-foreground">
                                            Loading thread...
                                        </p>
                                    ) : threadMessages.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            No replies yet.
                                        </p>
                                    ) : (
                                        threadMessages.map((threadMessage) => (
                                            <div
                                                className="rounded-md bg-background/80 px-2 py-1.5"
                                                key={threadMessage.$id}
                                            >
                                                <div className="mb-1 text-[11px] text-muted-foreground">
                                                    {threadMessage.senderDisplayName ||
                                                        threadMessage.senderId}
                                                </div>
                                                <div className="text-xs">
                                                    {threadMessage.text ||
                                                        "(attachment)"}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                {onSendThreadReply && (
                                    <div className="flex gap-2">
                                        <ChatInput
                                            onChange={setThreadReplyText}
                                            placeholder="Reply in thread"
                                            value={threadReplyText}
                                        />
                                        <Button
                                            disabled={!threadReplyText.trim()}
                                            onClick={() => {
                                                const value = threadReplyText;
                                                setThreadReplyText("");
                                                void onSendThreadReply(value);
                                            }}
                                            type="button"
                                        >
                                            Reply
                                        </Button>
                                    </div>
                                )}
                            </div>
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
