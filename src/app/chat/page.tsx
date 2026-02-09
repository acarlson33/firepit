"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import {
    MessageSquare,
    Hash,
    Image as ImageIcon,
    X,
    Settings,
    Shield,
    Pencil,
    Trash2,
    BellOff,
    MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Loader from "@/components/loader";
import type { Channel, FileAttachment } from "@/lib/types";
import { ChatInput } from "@/components/chat-input";
import { MentionHelpTooltip } from "@/components/mention-help-tooltip";
import { FileUploadButton, FilePreview } from "@/components/file-upload-button";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { ReactionButton } from "@/components/reaction-button";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { formatMessageTimestamp } from "@/lib/utils";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import { ReactionPicker } from "@/components/reaction-picker";
import { ConversationList } from "./components/ConversationList";
import { DirectMessageView } from "./components/DirectMessageView";
import { useAuth } from "@/contexts/auth-context";
import { useChannels } from "./hooks/useChannels";
import { useMessages } from "./hooks/useMessages";
import { useServers } from "./hooks/useServers";
import { useConversations } from "./hooks/useConversations";
import { useDirectMessages } from "./hooks/useDirectMessages";
import { uploadImage } from "@/lib/appwrite-dms-client";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import { useNotifications } from "@/hooks/useNotifications";
import { apiCache } from "@/lib/cache-utils";
import { toggleReaction } from "@/lib/reactions-client";
import { toast } from "sonner";

// Lazy load heavy components
const ServerBrowser = dynamic(
    () =>
        import("./components/ServerBrowser").then((mod) => ({
            default: mod.ServerBrowser,
        })),
    {
        ssr: false,
    },
);
const UserProfileModal = dynamic(
    () =>
        import("@/components/user-profile-modal").then((mod) => ({
            default: mod.UserProfileModal,
        })),
    {
        ssr: false,
    },
);
const NewConversationDialog = dynamic(
    () =>
        import("./components/NewConversationDialog").then((mod) => ({
            default: mod.NewConversationDialog,
        })),
    {
        ssr: false,
    },
);
const RoleSettingsDialog = dynamic(
    () =>
        import("@/components/role-settings-dialog").then((mod) => ({
            default: mod.RoleSettingsDialog,
        })),
    {
        ssr: false,
    },
);
const ChannelPermissionsEditor = dynamic(
    () =>
        import("@/components/channel-permissions-editor").then((mod) => ({
            default: mod.ChannelPermissionsEditor,
        })),
    {
        ssr: false,
    },
);
const ServerAdminPanel = dynamic(
    () =>
        import("@/components/server-admin-panel").then((mod) => ({
            default: mod.ServerAdminPanel,
        })),
    {
        ssr: false,
    },
);
const CreateServerDialog = dynamic(
    () =>
        import("@/components/create-server-dialog").then((mod) => ({
            default: mod.CreateServerDialog,
        })),
    {
        ssr: false,
    },
);
const MuteDialog = dynamic(
    () =>
        import("@/components/mute-dialog").then((mod) => ({
            default: mod.MuteDialog,
        })),
    {
        ssr: false,
    },
);

// Lazy load interactive components that aren't always visible (Performance Optimization)
const EmojiPicker = dynamic(
    () =>
        import("@/components/emoji-picker").then((mod) => ({
            default: mod.EmojiPicker,
        })),
    {
        ssr: false,
        loading: () => <div className="h-96 w-96" />, // Placeholder to prevent layout shift
    },
);
const ImageViewer = dynamic(
    () =>
        import("@/components/image-viewer").then((mod) => ({
            default: mod.ImageViewer,
        })),
    {
        ssr: false,
        loading: () => (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
                <Skeleton className="h-3/4 w-3/4" />
            </div>
        ),
    },
);

// Lazy load dialogs and modals only when needed

export default function ChatPage() {
    const { userData, loading: _authLoading } = useAuth();
    const userId = userData?.userId ?? null;
    const userName = userData?.name ?? null;
    const searchParams = useSearchParams();
    const router = useRouter();

    // Automatic status tracking removed to preserve manual status settings
    // Users can manually set their status via the profile/settings UI
    const membershipEnabled = Boolean(
        process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
    );
    const [viewMode, setViewMode] = useState<"channels" | "dms">("channels");
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [selectedConversationId, setSelectedConversationId] = useState<
        string | null
    >(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [newConversationOpen, setNewConversationOpen] = useState(false);
    const [roleSettingsOpen, setRoleSettingsOpen] = useState(false);
    const [channelPermissionsOpen, setChannelPermissionsOpen] = useState(false);
    const [adminPanelOpen, setAdminPanelOpen] = useState(false);
    const [allowUserServers, setAllowUserServers] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<{
        userId: string;
        userName?: string;
        displayName?: string;
        avatarUrl?: string;
    } | null>(null);
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
    const [muteDialogState, setMuteDialogState] = useState<{
        open: boolean;
        type: "server" | "channel" | "conversation";
        id: string;
        name: string;
    }>({ open: false, type: "channel", id: "", name: "" });
    const _messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isWindowFocused, setIsWindowFocused] = useState(true);

    // Custom emojis
    const { customEmojis, uploadEmoji } = useCustomEmojis();

    const openProfileModal = (
        profileUserId: string,
        profileUserName?: string,
        profileDisplayName?: string,
        profileAvatarUrl?: string,
    ) => {
        setSelectedProfile({
            userId: profileUserId,
            userName: profileUserName,
            displayName: profileDisplayName,
            avatarUrl: profileAvatarUrl,
        });
        setProfileModalOpen(true);
    };
    // Check if user server creation is enabled
    useEffect(() => {
        if (userId) {
            fetch("/api/feature-flags/allow-user-servers")
                .then((res) => res.json())
                .then((data: { enabled: boolean }) => {
                    console.log(
                        "Feature flag allow-user-servers:",
                        data.enabled,
                    );
                    setAllowUserServers(data.enabled);
                })
                .catch((error) => {
                    console.error("Failed to fetch feature flag:", error);
                    setAllowUserServers(false);
                });
        }
    }, [userId]);

    // Auto-join server via invite code from query param
    useEffect(() => {
        const inviteCode = searchParams.get("invite");
        if (inviteCode && userId) {
            // Only auto-join once per code
            const joinedKey = `invite_joined_${inviteCode}`;
            if (sessionStorage.getItem(joinedKey)) {
                // Clear the query param
                const newParams = new URLSearchParams(searchParams);
                newParams.delete("invite");
                router.replace(`/chat?${newParams.toString()}`);
                return;
            }

            // Attempt to join via invite
            fetch(`/api/invites/${inviteCode}/join`, {
                method: "POST",
            })
                .then(async (res) => {
                    if (res.ok) {
                        await res.json(); // intentionally unused: response data not needed
                        sessionStorage.setItem(joinedKey, "true");
                        toast.success("Successfully joined server via invite!");

                        // Clear the query param
                        const newParams = new URLSearchParams(searchParams);
                        newParams.delete("invite");
                        router.replace(`/chat?${newParams.toString()}`);

                        // Optionally select the server (if serversApi is available)
                        // This will be handled by the servers hook automatically
                    } else {
                        const error = await res.json();
                        toast.error(error.error || "Failed to join server");

                        // Clear the query param on error too
                        const newParams = new URLSearchParams(searchParams);
                        newParams.delete("invite");
                        router.replace(`/chat?${newParams.toString()}`);
                    }
                })
                .catch((error) => {
                    console.error("Failed to join via invite:", error);
                    toast.error("Failed to join server");

                    // Clear the query param
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete("invite");
                    router.replace(`/chat?${newParams.toString()}`);
                });
        }
    }, [searchParams, userId, router]);

    const serversApi = useServers({ userId, membershipEnabled });
    const channelsApi = useChannels({
        selectedServer: serversApi.selectedServer,
        userId,
        servers: serversApi.servers,
    });
    const messagesApi = useMessages({
        channelId:
            channelsApi.channels.find((c) => c.$id === selectedChannel)?.$id ||
            selectedChannel,
        serverId: serversApi.selectedServer,
        userId,
        userName,
    });

    const {
        messages,
        loading: messagesLoading,
        text,
        editingMessageId,
        replyingToMessage,
        typingUsers: _typingUsers,
        loadOlder,
        shouldShowLoadOlder,
        startEdit,
        cancelEdit,
        startReply,
        cancelReply,
        applyEdit: _applyEdit,
        remove: removeMessage,
        onChangeText,
        send,
        userIdSlice,
        maxTypingDisplay: _maxTypingDisplay,
        setMentionedNames,
    } = messagesApi;

    // Collect all display names visible in the chat so mentions with spaces
    // (like "avery <3") can be highlighted even for old messages that don't
    // have the correct mentions array stored in the database.
    const knownDisplayNames = useMemo(
        () => [
            ...new Set(
                messages
                    .map((m) => m.displayName)
                    .filter((n): n is string => Boolean(n)),
            ),
        ],
        [messages],
    );

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messagesContainerRef.current) {
            // Scroll the container, not the entire page
            messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
        }
    }, [messages.length]); // Only scroll when message count changes, not on every update

    // DM hooks
    const conversationsApi = useConversations(userId);
    const selectedConversation = useMemo(
        () =>
            conversationsApi.conversations.find(
                (c) => c.$id === selectedConversationId,
            ),
        [conversationsApi.conversations, selectedConversationId],
    );
    const receiverId = selectedConversation?.otherUser?.userId;

    const dmApi = useDirectMessages({
        conversationId: selectedConversationId || "",
        userId,
        receiverId: receiverId || "",
        userName,
    });

    // Notifications - listens for incoming messages and triggers notifications
    const { requestPermission: requestNotificationPermission } =
        useNotifications({
            userId,
            isWindowFocused,
            channelId: selectedChannel,
            serverId: serversApi.selectedServer,
            conversationId: selectedConversationId,
        });

    // Track window focus for notification suppression
    useEffect(() => {
        const handleFocus = () => setIsWindowFocused(true);
        const handleBlur = () => setIsWindowFocused(false);

        window.addEventListener("focus", handleFocus);
        window.addEventListener("blur", handleBlur);

        // Set initial focus state
        setIsWindowFocused(document.hasFocus());

        return () => {
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    // Request notification permission on first interaction
    useEffect(() => {
        if (
            userId &&
            typeof window !== "undefined" &&
            "Notification" in window
        ) {
            if (Notification.permission === "default") {
                // Add a one-time click handler to request permission
                const handleInteraction = () => {
                    void requestNotificationPermission();
                    document.removeEventListener("click", handleInteraction);
                };
                document.addEventListener("click", handleInteraction, {
                    once: true,
                });
                return () =>
                    document.removeEventListener("click", handleInteraction);
            }
        }
    }, [userId, requestNotificationPermission]);

    // Handlers -----------------
    const selectChannel = useCallback((c: Channel) => {
        setSelectedChannel(c.$id);
        setViewMode("channels");
        setSelectedConversationId(null);
    }, []);

    const selectConversation = useCallback((conversation: { $id: string }) => {
        setSelectedConversationId(conversation.$id);
        setViewMode("dms");
        setSelectedChannel(null);
    }, []);

    const _confirmDelete = useCallback((messageId: string) => {
        setDeleteConfirmId(messageId);
    }, []);

    const handleDelete = useCallback(async () => {
        if (!deleteConfirmId) {
            return;
        }
        await removeMessage(deleteConfirmId);
        setDeleteConfirmId(null);
    }, [deleteConfirmId, removeMessage]);

    const handleImageSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) {
                return;
            }

            // Validate file type
            if (!file.type.startsWith("image/")) {
                alert("Please select an image file");
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert("Image must be less than 5MB");
                return;
            }

            setSelectedImage(file);

            // Create preview
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                setImagePreview(reader.result as string);
            });
            reader.readAsDataURL(file);
        },
        [],
    );

    const removeImage = useCallback(() => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    const handleSendWithImage = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

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

            // Clear image state
            setSelectedImage(null);
            setImagePreview(null);

            // Prepare attachments (file attachments already uploaded via FileUploadButton)
            const attachmentsToSend =
                fileAttachments.length > 0 ? [...fileAttachments] : undefined;

            // Clear file attachments state
            setFileAttachments([]);

            // Send message with image data and file attachments
            await send(e, imageFileId, imageUrl, attachmentsToSend);
        },
        [selectedImage, fileAttachments, send],
    );

    const handleEmojiSelect = useCallback(
        (emoji: string) => {
            onChangeText({
                target: { value: text + emoji },
            } as React.ChangeEvent<HTMLInputElement>);
        },
        [text, onChangeText],
    );

    const handleFileAttachmentSelect = useCallback(
        (attachment: FileAttachment) => {
            setFileAttachments((prev) => [...prev, attachment]);
        },
        [],
    );

    const removeFileAttachment = useCallback((index: number) => {
        setFileAttachments((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }

        // Look for image items in clipboard
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
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
                }
                break;
            }
        }
    }, []);

    // Derived helpers
    const showChat = useMemo(
        () => Boolean(selectedChannel) || Boolean(selectedConversationId),
        [selectedChannel, selectedConversationId],
    );

    function renderServers() {
        const selectedServerData = serversApi.servers.find(
            (s) => s.$id === serversApi.selectedServer,
        );
        const isOwner = selectedServerData?.ownerId === userId;

        return (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">
                        Servers
                    </h2>
                    <div className="flex items-center gap-2">
                        {serversApi.selectedServer && isOwner && (
                            <>
                                <Button
                                    onClick={() => setAdminPanelOpen(true)}
                                    size="sm"
                                    variant="ghost"
                                    title="Admin Panel"
                                >
                                    <Shield className="h-4 w-4" />
                                </Button>
                                <Button
                                    onClick={() => setRoleSettingsOpen(true)}
                                    size="sm"
                                    variant="ghost"
                                    title="Server Settings"
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                        {userId && (
                            <>
                                {allowUserServers ? (
                                    <CreateServerDialog
                                        onServerCreated={() => {
                                            // Reload servers after creation
                                            void serversApi.refresh();
                                        }}
                                    />
                                ) : (
                                    <span
                                        className="text-xs text-muted-foreground"
                                        title="Server creation is disabled"
                                    >
                                        {/* Feature disabled */}
                                    </span>
                                )}
                            </>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {serversApi.servers.length} total
                        </span>
                    </div>
                </div>
                <ul className="space-y-2">
                    {serversApi.servers.map((s) => {
                        const active = s.$id === serversApi.selectedServer;
                        return (
                            <li key={s.$id} className="group relative">
                                <div className="flex items-center gap-1">
                                    <Button
                                        aria-pressed={active}
                                        className={`flex-1 justify-between rounded-xl transition-colors ${
                                            active
                                                ? ""
                                                : "border border-border/60 bg-background"
                                        }`}
                                        onClick={() => {
                                            serversApi.setSelectedServer(s.$id);
                                            setSelectedChannel(null);
                                        }}
                                        type="button"
                                        variant={active ? "default" : "outline"}
                                    >
                                        <span className="truncate text-left font-medium">
                                            {s.name}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {s.memberCount !== undefined && (
                                                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                                                    {s.memberCount}{" "}
                                                    {s.memberCount === 1
                                                        ? "member"
                                                        : "members"}
                                                </span>
                                            )}
                                        </div>
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                className="h-9 w-9 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                                size="icon"
                                                type="button"
                                                variant="ghost"
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                                <span className="sr-only">
                                                    Server options
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setMuteDialogState({
                                                        open: true,
                                                        type: "server",
                                                        id: s.$id,
                                                        name: s.name,
                                                    })
                                                }
                                            >
                                                <BellOff className="mr-2 h-4 w-4" />
                                                Mute Server
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {serversApi.cursor && (
                    <div className="pt-2">
                        <Button
                            disabled={serversApi.loading}
                            onClick={serversApi.loadMore}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            {serversApi.loading ? "Loading..." : "Load more"}
                        </Button>
                    </div>
                )}
                {serversApi.membershipEnabled && (
                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        <span>Your Memberships</span>
                        <span className="font-medium text-foreground">
                            {serversApi.memberships.length}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    function renderChannels() {
        if (!serversApi.selectedServer) {
            return (
                <p className="rounded-2xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
                    Select a server to view its channels or create a new space.
                </p>
            );
        }
        return (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
                <ul className="space-y-2">
                    {channelsApi.channels.map((c) => {
                        const active = c.$id === selectedChannel;
                        return (
                            <li key={c.$id} className="group relative">
                                <div className="flex items-center gap-1">
                                    <Button
                                        aria-pressed={active}
                                        className={`flex-1 justify-between rounded-xl transition-colors ${
                                            active
                                                ? ""
                                                : "border border-border/60 bg-background"
                                        }`}
                                        onClick={() => selectChannel(c)}
                                        type="button"
                                        variant={active ? "default" : "outline"}
                                    >
                                        <span className="truncate text-left font-medium">
                                            {c.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            #{c.$id.slice(0, 4)}
                                        </span>
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                className="h-9 w-9 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                                size="icon"
                                                type="button"
                                                variant="ghost"
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                                <span className="sr-only">
                                                    Channel options
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setMuteDialogState({
                                                        open: true,
                                                        type: "channel",
                                                        id: c.$id,
                                                        name: c.name,
                                                    })
                                                }
                                            >
                                                <BellOff className="mr-2 h-4 w-4" />
                                                Mute Channel
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {channelsApi.cursor && (
                    <div className="pt-2">
                        <Button
                            disabled={channelsApi.loading}
                            onClick={channelsApi.loadMore}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            {channelsApi.loading ? "Loading..." : "Load more"}
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    function renderMessages() {
        if (!showChat) {
            return (
                <div className="flex h-[60vh] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-background/60 p-10 text-center text-sm text-muted-foreground">
                    Pick a channel or direct conversation to get started. Your
                    messages will appear here.
                </div>
            );
        }

        // Show loading spinner when switching channels
        if (messagesLoading) {
            return (
                <div className="flex h-[60vh] items-center justify-center rounded-3xl border border-border/60 bg-background/70 p-10">
                    <Loader />
                </div>
            );
        }

        // Use virtual scrolling only for large message lists (50+ messages)
        // This avoids scrolling issues with small lists
        const useVirtualScrolling = messages.length >= 50;

        if (useVirtualScrolling) {
            return (
                <VirtualizedMessageList
                    customEmojis={customEmojis}
                    deleteConfirmId={deleteConfirmId}
                    editingMessageId={editingMessageId}
                    messages={messages}
                    onLoadOlder={loadOlder}
                    onOpenImageViewer={(imageUrl: string) => {
                        setViewingImage({
                            url: imageUrl,
                            alt: "Image",
                        });
                    }}
                    onOpenProfileModal={openProfileModal}
                    onRemove={handleDelete}
                    onStartEdit={startEdit}
                    onStartReply={startReply}
                    onToggleReaction={async (
                        messageId: string,
                        emoji: string,
                        isAdding: boolean,
                    ) => {
                        try {
                            await toggleReaction(
                                messageId,
                                emoji,
                                isAdding,
                                false,
                            );
                        } catch (error) {
                            // Error already logged by reaction handler
                        }
                    }}
                    onUploadCustomEmoji={uploadEmoji}
                    setDeleteConfirmId={setDeleteConfirmId}
                    shouldShowLoadOlder={shouldShowLoadOlder()}
                    userId={userId}
                    userIdSlice={userIdSlice}
                />
            );
        }

        // Regular rendering for smaller lists
        return (
            <div
                className="h-[60vh] space-y-3 overflow-y-auto rounded-3xl border border-border/60 bg-background/70 p-4 shadow-inner"
                ref={messagesContainerRef}
            >
                {shouldShowLoadOlder() && (
                    <div className="flex justify-center pb-4">
                        <Button
                            onClick={loadOlder}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            Load older messages
                        </Button>
                    </div>
                )}
                {messages.map((m) => {
                    const mine = m.userId === userId;
                    const isEditing = editingMessageId === m.$id;
                    const removed = Boolean(m.removedAt);
                    const isDeleting = deleteConfirmId === m.$id;
                    const displayName =
                        m.displayName ||
                        m.userName ||
                        m.userId.slice(0, userIdSlice);

                    return (
                        <div
                            className={`group flex gap-3 rounded-2xl border border-transparent bg-background/60 p-3 transition-colors ${
                                mine
                                    ? "ml-auto max-w-[85%] flex-row-reverse text-right"
                                    : "mr-auto max-w-[85%]"
                            } ${
                                isEditing
                                    ? "border-blue-400/50 bg-blue-50/40 dark:border-blue-500/40 dark:bg-blue-950/30"
                                    : "hover:border-border/80"
                            }`}
                            key={m.$id}
                        >
                            <button
                                className="shrink-0 cursor-pointer rounded-full border border-transparent transition hover:border-border"
                                onClick={() =>
                                    openProfileModal(
                                        m.userId,
                                        m.userName,
                                        m.displayName,
                                        m.avatarUrl,
                                    )
                                }
                                type="button"
                            >
                                <Avatar
                                    alt={displayName}
                                    fallback={displayName}
                                    size="md"
                                    src={m.avatarUrl}
                                />
                            </button>
                            <div className="min-w-0 flex-1 space-y-2">
                                <div
                                    className={`flex flex-wrap items-baseline gap-2 text-xs ${mine ? "justify-end" : ""} text-muted-foreground`}
                                >
                                    <span className="font-medium text-foreground">
                                        {displayName}
                                    </span>
                                    {m.pronouns && (
                                        <span className="italic text-muted-foreground">
                                            ({m.pronouns})
                                        </span>
                                    )}
                                    <span>
                                        {formatMessageTimestamp(m.$createdAt)}
                                    </span>
                                    {m.editedAt && (
                                        <span className="italic">(edited)</span>
                                    )}
                                    {removed && (
                                        <span className="text-destructive">
                                            (removed)
                                        </span>
                                    )}
                                </div>

                                {m.replyTo && (
                                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs">
                                        <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <span className="font-medium text-foreground">
                                                {m.replyTo.displayName ||
                                                    m.replyTo.userName ||
                                                    "User"}
                                            </span>
                                            <span className="ml-1 text-muted-foreground">
                                                {m.replyTo.text?.length > 50
                                                    ? `${m.replyTo.text.slice(0, 50)}...`
                                                    : m.replyTo.text}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {!removed && (
                                    <div className="wrap-break-word text-sm">
                                        <MessageWithMentions text={m.text} />
                                    </div>
                                )}
                                {removed && m.removedBy && (
                                    <div className="text-xs italic text-muted-foreground">
                                        Removed by moderator
                                    </div>
                                )}

                                {m.imageUrl && !removed && (
                                    <div className="mt-2">
                                        <button
                                            className="overflow-hidden rounded-lg border border-border transition hover:opacity-90"
                                            onClick={() => {
                                                if (m.imageUrl) {
                                                    setViewingImage({
                                                        url: m.imageUrl,
                                                        alt: "Attached image",
                                                    });
                                                }
                                            }}
                                            type="button"
                                        >
                                            <img
                                                alt="Attached"
                                                className="max-h-64 w-auto"
                                                decoding="async"
                                                loading="lazy"
                                                src={m.imageUrl}
                                            />
                                        </button>
                                    </div>
                                )}

                                {m.attachments &&
                                    m.attachments.length > 0 &&
                                    !removed && (
                                        <div className="mt-2 space-y-2">
                                            {m.attachments.map(
                                                (attachment, idx) => (
                                                    <FileAttachmentDisplay
                                                        key={`${m.$id}-${attachment.fileId}-${idx}`}
                                                        attachment={attachment}
                                                    />
                                                ),
                                            )}
                                        </div>
                                    )}

                                {m.reactions && m.reactions.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {m.reactions.map((reaction) => {
                                            return (
                                                <ReactionButton
                                                    currentUserId={userId}
                                                    customEmojis={customEmojis}
                                                    key={`${m.$id}-${reaction.emoji}`}
                                                    onToggle={async (
                                                        e: string,
                                                        isAdding: boolean,
                                                    ) => {
                                                        await toggleReaction(
                                                            m.$id,
                                                            e,
                                                            isAdding,
                                                            false,
                                                        );
                                                    }}
                                                    reaction={reaction}
                                                />
                                            );
                                        })}
                                    </div>
                                )}

                                {!removed && (
                                    <div
                                        className={`flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${mine ? "justify-end" : ""}`}
                                    >
                                        <ReactionPicker
                                            customEmojis={customEmojis}
                                            onSelectEmoji={async (emoji) => {
                                                await toggleReaction(
                                                    m.$id,
                                                    emoji,
                                                    true,
                                                    false,
                                                );
                                            }}
                                            onUploadCustomEmoji={uploadEmoji}
                                        />
                                        <Button
                                            onClick={() => startReply(m)}
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <MessageSquare className="h-4 w-4" />
                                        </Button>
                                        {mine && (
                                            <>
                                                <Button
                                                    onClick={() => startEdit(m)}
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
                                                                void handleDelete();
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
                                                            setDeleteConfirmId(
                                                                m.$id,
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
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // Show loader during initial load
    if (serversApi.initialLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-6 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-lg">
                    {/* View Mode Toggle */}
                    <div className="rounded-2xl bg-muted/40 p-1">
                        <div className="grid grid-cols-2 gap-1">
                            <Button
                                aria-pressed={viewMode === "channels"}
                                className="rounded-xl"
                                onClick={() => {
                                    setViewMode("channels");
                                    setSelectedConversationId(null);
                                }}
                                size="sm"
                                type="button"
                                variant={
                                    viewMode === "channels"
                                        ? "default"
                                        : "ghost"
                                }
                            >
                                <Hash className="mr-2 h-4 w-4" />
                                Channels
                            </Button>
                            <Button
                                aria-pressed={viewMode === "dms"}
                                className="rounded-xl"
                                onClick={() => {
                                    setViewMode("dms");
                                    setSelectedChannel(null);
                                }}
                                size="sm"
                                type="button"
                                variant={
                                    viewMode === "dms" ? "default" : "ghost"
                                }
                            >
                                <MessageSquare className="mr-2 h-4 w-4" />
                                DMs
                            </Button>
                        </div>
                    </div>

                    {viewMode === "channels" ? (
                        <div className="space-y-4">
                            {renderServers()}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-sm font-semibold tracking-tight">
                                        Channels
                                    </h2>
                                    {selectedChannel && (
                                        <span className="rounded-full bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                                            Active
                                        </span>
                                    )}
                                </div>
                                {renderChannels()}
                            </div>
                            <ServerBrowser
                                membershipEnabled={membershipEnabled}
                                userId={userId}
                                joinedServerIds={serversApi.servers.map(
                                    (s) => s.$id,
                                )}
                                onServerJoined={() => {
                                    // Clear membership cache to ensure fresh data after reload
                                    if (userId) {
                                        apiCache.clear(`memberships:${userId}`);
                                        apiCache.clear(
                                            `servers:initial:${userId}`,
                                        );
                                    }
                                    // Reload the page to refresh server list
                                    window.location.reload();
                                }}
                            />
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-border/60 bg-background/60 p-2 shadow-sm">
                            <ConversationList
                                conversations={conversationsApi.conversations}
                                loading={conversationsApi.loading}
                                onMuteConversation={(
                                    conversationId,
                                    conversationName,
                                ) => {
                                    setMuteDialogState({
                                        open: true,
                                        type: "conversation",
                                        id: conversationId,
                                        name: conversationName,
                                    });
                                }}
                                onNewConversation={() =>
                                    setNewConversationOpen(true)
                                }
                                onSelectConversation={selectConversation}
                                selectedConversationId={selectedConversationId}
                            />
                        </div>
                    )}
                </aside>

                <div className="space-y-4 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-xl">
                    {viewMode === "dms" && selectedConversation && userId ? (
                        <DirectMessageView
                            conversation={selectedConversation}
                            currentUserId={userId}
                            loading={dmApi.loading}
                            messages={dmApi.messages}
                            onDelete={dmApi.deleteMsg}
                            onEdit={dmApi.edit}
                            onSend={dmApi.send}
                            sending={dmApi.sending}
                            typingUsers={dmApi.typingUsers}
                            onTypingChange={dmApi.handleTypingChange}
                        />
                    ) : (
                        <>
                            {/* Channel Header */}
                            {selectedChannel && (
                                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Hash className="h-5 w-5 text-muted-foreground" />
                                        <h2 className="font-semibold">
                                            {channelsApi.channels.find(
                                                (c) =>
                                                    c.$id === selectedChannel,
                                            )?.name || "Channel"}
                                        </h2>
                                    </div>
                                    {serversApi.selectedServer &&
                                        serversApi.servers.find(
                                            (s) =>
                                                s.$id ===
                                                serversApi.selectedServer,
                                        )?.ownerId === userId && (
                                            <Button
                                                onClick={() =>
                                                    setChannelPermissionsOpen(
                                                        true,
                                                    )
                                                }
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                            >
                                                <Settings className="h-4 w-4" />
                                                <span className="ml-2">
                                                    Channel Permissions
                                                </span>
                                            </Button>
                                        )}
                                </div>
                            )}
                            {renderMessages()}
                            {/* Chat Input */}
                            {!selectedConversationId && (
                                <div className="space-y-3">
                                    <MentionHelpTooltip />
                                    {replyingToMessage && (
                                        <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
                                            <div className="flex-1">
                                                <div className="font-medium">
                                                    Replying to{" "}
                                                    {replyingToMessage.displayName ||
                                                        replyingToMessage.userName ||
                                                        "Unknown"}
                                                </div>
                                                <div className="line-clamp-1 text-xs text-muted-foreground">
                                                    {replyingToMessage.text}
                                                </div>
                                            </div>
                                            <Button
                                                onClick={cancelReply}
                                                size="sm"
                                                type="button"
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
                                                type="button"
                                                variant="ghost"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                    {editingMessageId ? (
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                            <Input
                                                aria-label="Edit message"
                                                className="flex-1 rounded-2xl border-border/60 ring-2 ring-blue-500/40"
                                                onChange={onChangeText}
                                                placeholder="Edit your message..."
                                                value={text}
                                                onKeyDown={(e) => {
                                                    if (
                                                        e.key === "Enter" &&
                                                        !e.shiftKey
                                                    ) {
                                                        e.preventDefault();
                                                        void send(e);
                                                    }
                                                    if (e.key === "Escape") {
                                                        cancelEdit();
                                                    }
                                                }}
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={(e) => {
                                                        void send(e);
                                                    }}
                                                    type="button"
                                                    variant="default"
                                                >
                                                    Save
                                                </Button>
                                                <Button
                                                    onClick={cancelEdit}
                                                    type="button"
                                                    variant="outline"
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {imagePreview && (
                                                <div className="relative inline-block">
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
                                                <div className="flex flex-col gap-2">
                                                    {fileAttachments.map(
                                                        (attachment, index) => (
                                                            <FilePreview
                                                                key={`${attachment.fileId}-${index}`}
                                                                attachment={
                                                                    attachment
                                                                }
                                                                onRemove={() =>
                                                                    removeFileAttachment(
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
                                                onSubmit={handleSendWithImage}
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
                                                        !showChat ||
                                                        uploadingImage ||
                                                        Boolean(
                                                            editingMessageId,
                                                        )
                                                    }
                                                    onClick={() =>
                                                        fileInputRef.current?.click()
                                                    }
                                                    size="icon"
                                                    type="button"
                                                    variant="outline"
                                                    className="shrink-0"
                                                >
                                                    <ImageIcon className="size-4" />
                                                </Button>
                                                <FileUploadButton
                                                    onFileSelect={
                                                        handleFileAttachmentSelect
                                                    }
                                                    disabled={
                                                        !showChat ||
                                                        uploadingImage ||
                                                        Boolean(
                                                            editingMessageId,
                                                        )
                                                    }
                                                    className="shrink-0"
                                                />
                                                <EmojiPicker
                                                    onEmojiSelect={
                                                        handleEmojiSelect
                                                    }
                                                    customEmojis={customEmojis}
                                                    onUploadCustomEmoji={
                                                        uploadEmoji
                                                    }
                                                />
                                                <ChatInput
                                                    aria-label="Message"
                                                    disabled={
                                                        !showChat ||
                                                        uploadingImage
                                                    }
                                                    onChange={(newValue) => {
                                                        onChangeText({
                                                            target: {
                                                                value: newValue,
                                                            },
                                                        } as React.ChangeEvent<HTMLInputElement>);
                                                    }}
                                                    placeholder={
                                                        showChat
                                                            ? "Type a message"
                                                            : "Select a channel"
                                                    }
                                                    value={text}
                                                    className="flex-1 rounded-2xl border-border/60"
                                                    onKeyDown={(e) => {
                                                        if (
                                                            e.key === "Enter" &&
                                                            !e.shiftKey
                                                        ) {
                                                            e.preventDefault();
                                                            void handleSendWithImage(
                                                                e as unknown as React.FormEvent,
                                                            );
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    className="rounded-2xl shrink-0"
                                                    disabled={
                                                        !showChat ||
                                                        uploadingImage ||
                                                        (!text.trim() &&
                                                            !selectedImage &&
                                                            fileAttachments.length ===
                                                                0)
                                                    }
                                                    type="submit"
                                                >
                                                    {uploadingImage
                                                        ? "Uploading..."
                                                        : "Send"}
                                                </Button>
                                            </form>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>{" "}
            {/* User Profile Modal */}
            {selectedProfile && (
                <UserProfileModal
                    avatarUrl={selectedProfile.avatarUrl}
                    displayName={selectedProfile.displayName}
                    onOpenChange={setProfileModalOpen}
                    open={profileModalOpen}
                    userId={selectedProfile.userId}
                    userName={selectedProfile.userName}
                    onStartDM={(conversationId) => {
                        setSelectedConversationId(conversationId);
                        setViewMode("dms");
                        setSelectedChannel(null);
                        setProfileModalOpen(false);
                    }}
                />
            )}
            {/* New Conversation Dialog */}
            {userId && (
                <NewConversationDialog
                    currentUserId={userId}
                    onConversationCreated={(conversation) => {
                        setSelectedConversationId(conversation.$id);
                        setViewMode("dms");
                        setSelectedChannel(null);
                        setNewConversationOpen(false);
                    }}
                    onOpenChange={setNewConversationOpen}
                    open={newConversationOpen}
                />
            )}
            {/* Image Viewer Modal */}
            {viewingImage && (
                <ImageViewer
                    alt={viewingImage.alt}
                    onClose={() => {
                        setViewingImage(null);
                    }}
                    src={viewingImage.url}
                />
            )}
            {/* Role Settings Dialog */}
            {serversApi.selectedServer && (
                <RoleSettingsDialog
                    open={roleSettingsOpen}
                    onOpenChange={setRoleSettingsOpen}
                    serverId={serversApi.selectedServer}
                    serverName={
                        serversApi.servers.find(
                            (s) => s.$id === serversApi.selectedServer,
                        )?.name || "Server"
                    }
                    isOwner={
                        serversApi.servers.find(
                            (s) => s.$id === serversApi.selectedServer,
                        )?.ownerId === userId
                    }
                />
            )}
            {/* Channel Permissions Editor */}
            {selectedChannel && serversApi.selectedServer && (
                <ChannelPermissionsEditor
                    open={channelPermissionsOpen}
                    onOpenChange={setChannelPermissionsOpen}
                    channelId={selectedChannel}
                    channelName={
                        channelsApi.channels.find(
                            (c) => c.$id === selectedChannel,
                        )?.name || "Channel"
                    }
                    serverId={serversApi.selectedServer}
                />
            )}
            {/* Server Admin Panel */}
            {serversApi.selectedServer && (
                <ServerAdminPanel
                    open={adminPanelOpen}
                    onOpenChange={setAdminPanelOpen}
                    serverId={serversApi.selectedServer}
                    serverName={
                        serversApi.servers.find(
                            (s) => s.$id === serversApi.selectedServer,
                        )?.name || "Server"
                    }
                    isOwner={
                        serversApi.servers.find(
                            (s) => s.$id === serversApi.selectedServer,
                        )?.ownerId === userId
                    }
                />
            )}
            {/* Mute Dialog */}
            <MuteDialog
                open={muteDialogState.open}
                onOpenChange={(open) =>
                    setMuteDialogState((prev) => ({ ...prev, open }))
                }
                targetType={muteDialogState.type}
                targetId={muteDialogState.id}
                targetName={muteDialogState.name}
            />
        </div>
    );
}
