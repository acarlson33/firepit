"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import {
    MessageSquare,
    Hash,
    Settings,
    Shield,
    BellOff,
    MoreVertical,
    Pin,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPinnedMessagesContent } from "@/components/chat-pinned-messages-content";
import { ChatSurfacePanel } from "@/components/chat-surface-panel";
import { ChatThreadContent } from "@/components/chat-thread-content";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Loader from "@/components/loader";
import { adaptChannelMessages, fromChannelMessage } from "@/lib/chat-surface";
import {
    jumpToMessage,
    jumpToMessageWhenReady,
} from "@/lib/message-navigation";
import type {
    Channel,
    FileAttachment,
    InboxContextKind,
    InboxItem,
} from "@/lib/types";
import { ConversationList } from "./components/ConversationList";
import { DirectMessageView } from "./components/DirectMessageView";
import { useAuth } from "@/contexts/auth-context";
import { useChannels } from "./hooks/useChannels";
import { useCategories } from "./hooks/useCategories";
import { useMessages } from "./hooks/useMessages";
import { useServers } from "./hooks/useServers";
import { useConversations } from "./hooks/useConversations";
import { useDirectMessages } from "./hooks/useDirectMessages";
import { useInbox } from "./hooks/useInbox";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { uploadImage } from "@/lib/appwrite-dms-client";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import { useNotifications } from "@/hooks/useNotifications";
import { apiCache, CACHE_TTL } from "@/lib/cache-utils";
import { listInboxWithFilters } from "@/lib/inbox-client";
import { useChatSurfaceController } from "./hooks/useChatSurfaceController";
import { toast } from "sonner";

// Lazy load heavy components
const _ServerBrowser = dynamic(
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

function sortSidebarChannels(channels: Channel[]) {
    return [...channels].sort((left, right) => {
        const leftPosition = left.position ?? 0;
        const rightPosition = right.position ?? 0;
        if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
        }

        return left.name.localeCompare(right.name);
    });
}

function getFirstUnreadItem(items: InboxItem[]) {
    if (items.length === 0) {
        return null;
    }

    return [...items].sort((left, right) => {
        const activityOrder = left.latestActivityAt.localeCompare(
            right.latestActivityAt,
        );
        if (activityOrder !== 0) {
            return activityOrder;
        }

        return left.id.localeCompare(right.id);
    })[0];
}

export default function ChatPage() {
    const { userData, loading: _authLoading } = useAuth();
    const userId = userData?.userId ?? null;
    const userName = userData?.name ?? null;
    const searchParams = useSearchParams();
    const searchParamsString = searchParams.toString();
    const router = useRouter();
    const routeServerId = searchParams.get("server");
    const routeChannelId = searchParams.get("channel");
    const routeConversationId = searchParams.get("conversation");
    const routeHighlightMessageId = searchParams.get("highlight");
    const routeUnreadMessageId = searchParams.get("unread");

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
    const messageDensity = "compact";
    const [muteDialogState, setMuteDialogState] = useState<{
        open: boolean;
        type: "server" | "channel" | "conversation";
        id: string;
        name: string;
    }>({ open: false, type: "channel", id: "", name: "" });
    const [canManageMessages, setCanManageMessages] = useState(false);
    const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<string[]>(
        [],
    );
    const [threadReplyText, setThreadReplyText] = useState("");
    const [activeUnreadAnchor, setActiveUnreadAnchor] = useState<{
        contextKey: string;
        messageId: string;
    } | null>(null);
    const [activeContextInboxItems, setActiveContextInboxItems] = useState<
        InboxItem[] | null | undefined
    >(null);
    const _messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isWindowFocused, setIsWindowFocused] = useState(true);
    const loadingOlderUnreadRef = useRef(false);

    // Custom emojis
    const { customEmojis, uploadEmoji } = useCustomEmojis();
    const notificationSettingsApi = useNotificationSettings();
    const inboxApi = useInbox(userId);
    const conversationsApi = useConversations(
        userId,
        viewMode === "dms" ||
            newConversationOpen ||
            Boolean(selectedConversationId),
    );
    const selectedConversation = useMemo(
        () =>
            conversationsApi.conversations.find(
                (conversation) => conversation.$id === selectedConversationId,
            ) || null,
        [conversationsApi.conversations, selectedConversationId],
    );
    const unreadChannelCount = useMemo(
        () =>
            inboxApi.summaries
                .filter((summary) => summary.contextKind === "channel")
                .reduce((total, summary) => total + summary.totalCount, 0),
        [inboxApi.summaries],
    );
    const unreadDirectMessageCount = useMemo(
        () =>
            inboxApi.summaries
                .filter((summary) => summary.contextKind === "conversation")
                .reduce((total, summary) => total + summary.totalCount, 0),
        [inboxApi.summaries],
    );
    const conversationUnreadStateById = useMemo(
        () =>
            inboxApi.summaries
                .filter((summary) => summary.contextKind === "conversation")
                .reduce<Record<string, { count: number; muted: boolean }>>(
                    (accumulator, summary) => {
                        accumulator[summary.contextId] = {
                            count: summary.totalCount,
                            muted: summary.muted,
                        };
                        return accumulator;
                    },
                    {},
                ),
        [inboxApi.summaries],
    );
    const unreadSummaryUnitLabel =
        inboxApi.contractVersion === "message_v2" ? "message" : "item";
    const channelUnreadStateById = useMemo(
        () =>
            inboxApi.summaries
                .filter((summary) => summary.contextKind === "channel")
                .reduce<Record<string, { count: number; muted: boolean }>>(
                    (accumulator, summary) => {
                        accumulator[summary.contextId] = {
                            count: summary.totalCount,
                            muted: summary.muted,
                        };
                        return accumulator;
                    },
                    {},
                ),
        [inboxApi.summaries],
    );
    const activeMuteOverride = useMemo(() => {
        const settings = notificationSettingsApi.settings;
        if (!settings || !muteDialogState.id) {
            return undefined;
        }

        switch (muteDialogState.type) {
            case "server": {
                return settings.serverOverrides?.[muteDialogState.id];
            }
            case "channel": {
                return settings.channelOverrides?.[muteDialogState.id];
            }
            case "conversation": {
                return settings.conversationOverrides?.[muteDialogState.id];
            }
        }
    }, [
        muteDialogState.id,
        muteDialogState.type,
        notificationSettingsApi.settings,
    ]);

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

    useEffect(() => {
        if (searchParams.get("compose") !== "1") {
            return;
        }

        setViewMode("dms");
        setSelectedChannel(null);
        setNewConversationOpen(true);

        const params = new URLSearchParams(searchParams.toString());
        params.delete("compose");
        const query = params.toString();
        router.replace(query ? `/chat?${query}` : "/chat");
    }, [router, searchParams]);

    // Check if user server creation is enabled (cached + abortable)
    useEffect(() => {
        if (!userId) {
            setAllowUserServers(false);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();
        const cacheKey = "feature-flag:allow-user-servers";

        apiCache
            .dedupe(
                cacheKey,
                async () => {
                    const res = await fetch(
                        "/api/feature-flags/allow-user-servers",
                        { signal: controller.signal },
                    );

                    if (!res.ok) {
                        throw new Error("Failed to fetch feature flag");
                    }

                    return (await res.json()) as { enabled: boolean };
                },
                CACHE_TTL.SERVERS,
            )
            .then((data) => {
                if (!cancelled) {
                    setAllowUserServers(Boolean(data.enabled));
                }
            })
            .catch((error: unknown) => {
                if (
                    error instanceof DOMException &&
                    error.name === "AbortError"
                ) {
                    return;
                }
                setAllowUserServers(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [userId]);

    const serversApi = useServers({ userId, membershipEnabled });
    const channelsApi = useChannels({
        selectedServer: serversApi.selectedServer,
        userId,
        servers: serversApi.servers,
    });
    const categoriesApi = useCategories(serversApi.selectedServer);
    const currentContextKey = selectedChannel
        ? `channel:${selectedChannel}`
        : selectedConversationId
          ? `conversation:${selectedConversationId}`
          : null;
    const currentContextSummary = useMemo(() => {
        if (selectedChannel) {
            return inboxApi.getContextSummary("channel", selectedChannel);
        }

        if (selectedConversationId) {
            return inboxApi.getContextSummary(
                "conversation",
                selectedConversationId,
            );
        }

        return null;
    }, [inboxApi, selectedChannel, selectedConversationId]);
    const activeContext = useMemo<{
        contextId: string;
        contextKind: InboxContextKind;
    } | null>(() => {
        if (selectedChannel) {
            return {
                contextId: selectedChannel,
                contextKind: "channel",
            };
        }

        if (selectedConversationId) {
            return {
                contextId: selectedConversationId,
                contextKind: "conversation",
            };
        }

        return null;
    }, [selectedChannel, selectedConversationId]);

    useEffect(() => {
        if (!userId || !activeContext) {
            setActiveContextInboxItems(null);
            return;
        }

        let cancelled = false;
        setActiveContextInboxItems(undefined);
        void listInboxWithFilters({
            contextId: activeContext.contextId,
            contextKind: activeContext.contextKind,
        })
            .then((data) => {
                if (!cancelled) {
                    setActiveContextInboxItems(
                        data.items.length > 0 ? data.items : null,
                    );
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setActiveContextInboxItems(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        activeContext,
        currentContextSummary?.firstUnreadItem?.id,
        currentContextSummary?.totalCount,
        userId,
    ]);

    const scopedFirstUnreadItem = useMemo(
        () =>
            Array.isArray(activeContextInboxItems)
                ? getFirstUnreadItem(activeContextInboxItems)
                : null,
        [activeContextInboxItems],
    );
    const scopedUnreadCount = useMemo(
        () =>
            Array.isArray(activeContextInboxItems)
                ? activeContextInboxItems.reduce(
                      (total, item) => total + item.unreadCount,
                      0,
                  )
                : 0,
        [activeContextInboxItems],
    );
    const currentContextFirstUnreadMessageId =
        activeContextInboxItems === null
            ? (currentContextSummary?.firstUnreadItem?.messageId ?? null)
            : (scopedFirstUnreadItem?.messageId ?? null);
    const currentContextUnreadCount =
        activeContextInboxItems === null
            ? (currentContextSummary?.totalCount ?? 0)
            : scopedUnreadCount;
    const currentContextKind =
        activeContext?.contextKind ?? currentContextSummary?.contextKind;

    useEffect(() => {
        if (routeConversationId) {
            setViewMode("dms");
            setSelectedConversationId((currentValue) =>
                currentValue === routeConversationId
                    ? currentValue
                    : routeConversationId,
            );
            setSelectedChannel(null);
            return;
        }

        if (!routeChannelId) {
            return;
        }

        setViewMode("channels");
        setSelectedConversationId(null);
        if (routeServerId && serversApi.selectedServer !== routeServerId) {
            serversApi.setSelectedServer(routeServerId);
        }
        setSelectedChannel((currentValue) =>
            currentValue === routeChannelId ? currentValue : routeChannelId,
        );
    }, [
        routeChannelId,
        routeConversationId,
        routeServerId,
        serversApi.selectedServer,
        serversApi.setSelectedServer,
    ]);

    const messagesApi = useMessages({
        channelId: viewMode === "channels" ? selectedChannel : null,
        serverId: serversApi.selectedServer,
        userId,
        userName,
    });

    const dmApi = useDirectMessages({
        conversationId: viewMode === "dms" ? selectedConversationId : null,
        userId,
        userName,
    });

    const loadOlderAroundUnread = useCallback(async () => {
        if (loadingOlderUnreadRef.current) {
            return;
        }

        loadingOlderUnreadRef.current = true;
        try {
            if (selectedChannel) {
                if (messagesApi.shouldShowLoadOlder()) {
                    await messagesApi.loadOlder();
                }
                return;
            }

            if (selectedConversationId && dmApi.shouldShowLoadOlder) {
                await dmApi.loadOlder();
            }
        } finally {
            loadingOlderUnreadRef.current = false;
        }
    }, [
        dmApi.loadOlder,
        dmApi.shouldShowLoadOlder,
        messagesApi,
        selectedChannel,
        selectedConversationId,
    ]);

    const jumpToUnreadEntry = useCallback(
        (messageId: string) => {
            return jumpToMessageWhenReady(messageId, {
                retryAttempts: 12,
                retryDelayMs: 200,
                onRetry: () => {
                    void loadOlderAroundUnread();
                },
                onComplete: (found) => {
                    if (found) {
                        return;
                    }

                    setActiveUnreadAnchor((currentValue) =>
                        currentValue?.messageId === messageId
                            ? null
                            : currentValue,
                    );
                    void inboxApi.refresh();
                },
            });
        },
        [inboxApi, loadOlderAroundUnread],
    );

    useEffect(() => {
        if (!routeHighlightMessageId && !routeUnreadMessageId) {
            return;
        }

        const channelReady =
            Boolean(routeChannelId) &&
            viewMode === "channels" &&
            selectedChannel === routeChannelId &&
            (!routeServerId || serversApi.selectedServer === routeServerId);
        const conversationReady =
            Boolean(routeConversationId) &&
            viewMode === "dms" &&
            selectedConversationId === routeConversationId;

        if (!channelReady && !conversationReady) {
            return;
        }

        const targetMessageId = routeUnreadMessageId || routeHighlightMessageId;
        if (!targetMessageId) {
            return;
        }

        return jumpToMessageWhenReady(targetMessageId, {
            retryAttempts: 12,
            retryDelayMs: 200,
            onRetry: () => {
                if (routeUnreadMessageId) {
                    void loadOlderAroundUnread();
                }
            },
            onComplete: (found) => {
                if (!found) {
                    return;
                }

                const params = new URLSearchParams(searchParamsString);
                params.delete("highlight");
                params.delete("unread");
                const query = params.toString();
                window.history.replaceState(
                    null,
                    "",
                    query ? `/chat?${query}` : "/chat",
                );
            },
        });
    }, [
        routeChannelId,
        routeConversationId,
        routeHighlightMessageId,
        routeUnreadMessageId,
        routeServerId,
        loadOlderAroundUnread,
        searchParamsString,
        selectedChannel,
        selectedConversationId,
        serversApi.selectedServer,
        viewMode,
    ]);

    useEffect(() => {
        if (!currentContextKey) {
            setActiveUnreadAnchor(null);
            return;
        }

        setActiveUnreadAnchor((currentValue) => {
            const nextMessageId = currentContextFirstUnreadMessageId;

            if (!nextMessageId) {
                return null;
            }

            if (
                currentValue?.contextKey === currentContextKey &&
                currentValue.messageId === nextMessageId
            ) {
                return currentValue;
            }

            return {
                contextKey: currentContextKey,
                messageId: nextMessageId,
            };
        });
    }, [currentContextFirstUnreadMessageId, currentContextKey]);

    useEffect(() => {
        if (
            !currentContextKey ||
            !activeContext ||
            currentContextUnreadCount < 1
        ) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void inboxApi.markContextRead(
                activeContext.contextKind,
                activeContext.contextId,
            );
        }, 800);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activeContext, currentContextKey, currentContextUnreadCount, inboxApi]);

    useEffect(() => {
        if (!serversApi.selectedServer) {
            setCollapsedCategoryIds([]);
            return;
        }

        try {
            const storedValue = window.localStorage.getItem(
                `firepit:collapsed-categories:${serversApi.selectedServer}`,
            );
            if (!storedValue) {
                setCollapsedCategoryIds([]);
                return;
            }

            const parsedValue = JSON.parse(storedValue) as unknown;
            setCollapsedCategoryIds(
                Array.isArray(parsedValue)
                    ? parsedValue.filter(
                          (value): value is string => typeof value === "string",
                      )
                    : [],
            );
        } catch {
            setCollapsedCategoryIds([]);
        }
    }, [serversApi.selectedServer]);

    useEffect(() => {
        if (!serversApi.selectedServer) {
            return;
        }

        window.localStorage.setItem(
            `firepit:collapsed-categories:${serversApi.selectedServer}`,
            JSON.stringify(collapsedCategoryIds),
        );
    }, [collapsedCategoryIds, serversApi.selectedServer]);

    const groupedChannels = useMemo(() => {
        const categories = [...categoriesApi.categories].sort((left, right) => {
            if (left.position !== right.position) {
                return left.position - right.position;
            }

            return left.name.localeCompare(right.name);
        });

        return categories.map((category) => ({
            category,
            channels: sortSidebarChannels(
                channelsApi.channels.filter(
                    (channel) => channel.categoryId === category.$id,
                ),
            ),
        }));
    }, [categoriesApi.categories, channelsApi.channels]);

    const uncategorizedChannels = useMemo(
        () =>
            sortSidebarChannels(
                channelsApi.channels.filter((channel) => !channel.categoryId),
            ),
        [channelsApi.channels],
    );

    const resolvedChannelId = useMemo(
        () =>
            channelsApi.channels.some(
                (channel) => channel.$id === selectedChannel,
            )
                ? selectedChannel
                : null,
        [channelsApi.channels, selectedChannel],
    );

    useEffect(() => {
        if (
            selectedChannel &&
            !resolvedChannelId &&
            serversApi.selectedServer &&
            !channelsApi.initialLoading
        ) {
            setSelectedChannel(null);
        }
    }, [
        channelsApi.initialLoading,
        resolvedChannelId,
        selectedChannel,
        serversApi.selectedServer,
    ]);

    const {
        messages,
        loading: _messagesLoading,
        sending: channelSending,
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
        channelPins,
        togglePin,
        activeThreadParent,
        threadMessages: _threadMessages,
        threadLoading: _threadLoading,
        threadReplySending: _threadReplySending,
        openThread,
        closeThread,
        sendThreadReply: _sendThreadReply,
        setMentionedNames,
    } = messagesApi;

    const pinnedMessageIds = useMemo(
        () => channelPins.map((item) => item.message.$id),
        [channelPins],
    );
    const pinnedChannelMessages = useMemo(
        () => channelPins.map((item) => item.message),
        [channelPins],
    );
    const pinnedChannelSurfaceMessages = useMemo(
        () => adaptChannelMessages(pinnedChannelMessages),
        [pinnedChannelMessages],
    );
    const threadParentSurfaceMessage = useMemo(
        () =>
            activeThreadParent ? fromChannelMessage(activeThreadParent) : null,
        [activeThreadParent],
    );
    const threadSurfaceMessages = useMemo(
        () => adaptChannelMessages(_threadMessages),
        [_threadMessages],
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

    const jumpToPinnedMessage = useCallback(
        (messageId: string) => {
            return jumpToMessageWhenReady(messageId, {
                retryAttempts: 12,
                retryDelayMs: 200,
                onRetry: () => {
                    void loadOlderAroundUnread();
                },
            });
        },
        [loadOlderAroundUnread],
    );
    const handleJumpToCurrentUnread = useCallback(() => {
        const targetMessageId =
            activeUnreadAnchor?.messageId ?? currentContextFirstUnreadMessageId;
        if (!targetMessageId) {
            return;
        }

        jumpToUnreadEntry(targetMessageId);
    }, [
        activeUnreadAnchor?.messageId,
        currentContextFirstUnreadMessageId,
        jumpToUnreadEntry,
    ]);

    const handleCatchUpCurrentContext = useCallback(() => {
        setActiveUnreadAnchor(null);
        if (selectedChannel) {
            void inboxApi.markContextRead("channel", selectedChannel);
            if (messagesApi.surfaceMessages.length > 0) {
                jumpToMessage(messagesApi.surfaceMessages.at(-1)?.id || "", {
                    block: "end",
                });
            }
            return;
        }

        if (selectedConversationId && dmApi.surfaceMessages.length > 0) {
            void inboxApi.markContextRead(
                "conversation",
                selectedConversationId,
            );
            jumpToMessage(dmApi.surfaceMessages.at(-1)?.id || "", {
                block: "end",
            });
        }
    }, [
        inboxApi,
        dmApi.surfaceMessages,
        messagesApi.surfaceMessages,
        selectedChannel,
        selectedConversationId,
    ]);

    // Check manageMessages permission when channel changes
    useEffect(() => {
        async function checkPermissions() {
            if (!selectedChannel || !userId || !serversApi.selectedServer) {
                setCanManageMessages(false);
                return;
            }

            const selectedServerData = serversApi.servers.find(
                (s) => s.$id === serversApi.selectedServer,
            );
            if (selectedServerData?.ownerId === userId) {
                setCanManageMessages(true);
                return;
            }

            try {
                const res = await fetch(
                    `/api/servers/${serversApi.selectedServer}/permissions?userId=${userId}&channelId=${selectedChannel}`,
                );
                if (res.ok) {
                    const data = await res.json();
                    setCanManageMessages(data.manageMessages ?? false);
                } else {
                    setCanManageMessages(false);
                }
            } catch {
                setCanManageMessages(false);
            }
        }

        void checkPermissions();
    }, [
        selectedChannel,
        userId,
        serversApi.selectedServer,
        serversApi.servers,
    ]);

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

    const toggleCategoryCollapse = useCallback((categoryId: string) => {
        setCollapsedCategoryIds((currentValue) =>
            currentValue.includes(categoryId)
                ? currentValue.filter((value) => value !== categoryId)
                : [...currentValue, categoryId],
        );
    }, []);

    const selectConversation = useCallback((conversation: { $id: string }) => {
        setSelectedConversationId(conversation.$id);
        setViewMode("dms");
        setSelectedChannel(null);
    }, []);

    const _confirmDelete = useCallback((messageId: string) => {
        setDeleteConfirmId(messageId);
    }, []);

    const handleDelete = useCallback(
        async (messageId: string) => {
            if (!messageId) {
                return;
            }
            await removeMessage(messageId);
            setDeleteConfirmId(null);
        },
        [deleteConfirmId, removeMessage],
    );

    const handleImageSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
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
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            const submitEvent =
                e ?? ({ preventDefault() {} } as React.FormEvent);

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
            await send(submitEvent, imageFileId, imageUrl, attachmentsToSend);
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

    const surfaceController = useChatSurfaceController({
        rawMessages: messages,
        onOpenThreadRaw: openThread,
        onRemove: (messageId) => {
            void handleDelete(messageId);
        },
        onStartEditRaw: startEdit,
        onStartReplyRaw: startReply,
        onTogglePinRaw: togglePin,
        onToggleReaction: async (messageId, emoji, isAdding) => {
            try {
                await messagesApi.toggleReaction(messageId, emoji, isAdding);
            } catch {
                // Error already logged by reaction handler.
            }
        },
    });

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
                                        className={`flex-1 justify-between rounded-xl transition-colors min-w-0 overflow-hidden ${
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
                                        <div className="flex items-center gap-2 shrink-0">
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

        if (channelsApi.initialLoading || categoriesApi.initialLoading) {
            return (
                <div className="space-y-4 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
                    <div className="space-y-2">
                        <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
                        <div className="space-y-2">
                            <div className="h-10 animate-pulse rounded-xl bg-muted/70" />
                            <div className="h-10 animate-pulse rounded-xl bg-muted/70" />
                            <div className="h-10 animate-pulse rounded-xl bg-muted/70" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
                        <div className="space-y-2">
                            <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
                            <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Loading channels and categories...
                    </p>
                </div>
            );
        }

        if (
            groupedChannels.length === 0 &&
            uncategorizedChannels.length === 0 &&
            !channelsApi.loading
        ) {
            return (
                <div className="space-y-2 rounded-2xl border border-dashed border-border/60 bg-muted/30 px-4 py-4 text-center">
                    <p className="text-sm font-medium text-foreground">
                        No channels yet
                    </p>
                    <p className="text-xs text-muted-foreground">
                        This server does not have any visible channels right
                        now.
                    </p>
                </div>
            );
        }

        const renderChannelItem = (channel: Channel) => {
            const active = channel.$id === selectedChannel;
            const unreadState = channelUnreadStateById[channel.$id];

            return (
                <li key={channel.$id} className="group relative">
                    <div className="flex items-center gap-1">
                        <Button
                            aria-pressed={active}
                            className={`min-w-0 flex-1 justify-between overflow-hidden rounded-xl transition-colors ${
                                active
                                    ? ""
                                    : "border border-border/60 bg-background"
                            }`}
                            onClick={() => selectChannel(channel)}
                            type="button"
                            variant={active ? "default" : "outline"}
                        >
                            <span className="min-w-0 truncate text-left font-medium">
                                {channel.name}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                {unreadState?.count ? (
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                            unreadState.muted
                                                ? "bg-muted text-muted-foreground"
                                                : "bg-primary text-primary-foreground"
                                        }`}
                                    >
                                        {unreadState.count}
                                    </span>
                                ) : null}
                                <span className="text-xs text-muted-foreground">
                                    #{channel.$id.slice(0, 4)}
                                </span>
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
                                            id: channel.$id,
                                            name: channel.name,
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
        };

        return (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
                <div className="space-y-3">
                    {groupedChannels.map(({ category, channels }) => {
                        const collapsed = collapsedCategoryIds.includes(
                            category.$id,
                        );

                        return (
                            <section key={category.$id} className="space-y-2">
                                <button
                                    className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                    onClick={() =>
                                        toggleCategoryCollapse(category.$id)
                                    }
                                    type="button"
                                >
                                    <span className="flex items-center gap-2">
                                        {collapsed ? (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        ) : (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                        )}
                                        {category.name}
                                    </span>
                                    <span>{channels.length}</span>
                                </button>
                                {!collapsed && (
                                    <ul className="space-y-2">
                                        {channels.length > 0 ? (
                                            channels.map(renderChannelItem)
                                        ) : (
                                            <li className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                                No channels in this category
                                                yet.
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </section>
                        );
                    })}

                    {(uncategorizedChannels.length > 0 ||
                        groupedChannels.length === 0) && (
                        <section className="space-y-2">
                            <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                <span>Uncategorized</span>
                                <span>{uncategorizedChannels.length}</span>
                            </div>
                            <ul className="space-y-2">
                                {uncategorizedChannels.map(renderChannelItem)}
                            </ul>
                        </section>
                    )}
                </div>
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
        return (
            <ChatSurfacePanel
                canManageMessages={canManageMessages}
                composer={
                    selectedChannel
                        ? {
                              disabled: !showChat || uploadingImage,
                              fileAttachments,
                              fileInputRef,
                              onCancelEdit: cancelEdit,
                              onCancelReply: cancelReply,
                              onEmojiSelect: handleEmojiSelect,
                              onFileAttachmentSelect:
                                  handleFileAttachmentSelect,
                              onMentionsChange: setMentionedNames,
                              onPaste: handlePaste,
                              onRemoveFileAttachment: removeFileAttachment,
                              onRemoveImage: removeImage,
                              onSelectImageFile: handleImageSelect,
                              onSubmit: handleSendWithImage,
                              onTextChange: (newValue) => {
                                  onChangeText({
                                      target: { value: newValue },
                                  } as React.ChangeEvent<HTMLInputElement>);
                              },
                              placeholder: showChat
                                  ? "Type a message"
                                  : "Select a channel",
                              replyingTo: replyingToMessage
                                  ? {
                                        authorLabel:
                                            replyingToMessage.displayName ||
                                            replyingToMessage.userName ||
                                            "User",
                                        text: replyingToMessage.text,
                                    }
                                  : null,
                              selectedImagePreview: imagePreview,
                              sending: channelSending,
                              text,
                              uploadingImage,
                          }
                        : undefined
                }
                currentUserId={userId}
                customEmojis={customEmojis}
                deleteConfirmId={deleteConfirmId}
                editingMessageId={editingMessageId}
                emptyDescription="Start the conversation by sending a message."
                emptyTitle="No messages yet"
                loading={messagesApi.loading}
                messageContainerRef={messagesContainerRef}
                messageDensity={messageDensity}
                onLoadOlder={loadOlder}
                onOpenImageViewer={(imageUrl) => {
                    setViewingImage({
                        alt: "Attached image",
                        url: imageUrl,
                    });
                }}
                onOpenProfileModal={openProfileModal}
                onOpenThread={surfaceController.onOpenThread}
                onRemove={surfaceController.onRemove}
                onStartEdit={surfaceController.onStartEdit}
                onStartReply={surfaceController.onStartReply}
                onTogglePin={surfaceController.onTogglePin}
                onToggleReaction={surfaceController.onToggleReaction}
                onUploadCustomEmoji={uploadEmoji}
                onCatchUpUnread={handleCatchUpCurrentContext}
                onJumpToUnread={handleJumpToCurrentUnread}
                pinnedMessageIds={pinnedMessageIds}
                setDeleteConfirmId={setDeleteConfirmId}
                shouldShowLoadOlder={shouldShowLoadOlder()}
                showSurface={Boolean(selectedChannel)}
                surfaceMessages={messagesApi.surfaceMessages}
                typingUsers={_typingUsers}
                unreadAnchorMessageId={
                    activeUnreadAnchor?.contextKey === currentContextKey
                        ? activeUnreadAnchor.messageId
                        : null
                }
                unreadSummaryLabel={
                    currentContextKind && currentContextUnreadCount > 0
                        ? `${currentContextUnreadCount} unread ${unreadSummaryUnitLabel}${
                              currentContextUnreadCount === 1 ? "" : "s"
                          } in this ${
                              currentContextKind === "channel"
                                  ? "channel"
                                  : "conversation"
                          }`
                        : null
                }
                userIdSlice={userIdSlice}
            />
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
        <div className="mx-auto w-full max-w-7xl py-8 pl-6 pr-8 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-6 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-lg">
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
                                {unreadChannelCount > 0 ? (
                                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                        {unreadChannelCount}
                                    </span>
                                ) : null}
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
                                {unreadDirectMessageCount > 0 ? (
                                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                        {unreadDirectMessageCount}
                                    </span>
                                ) : null}
                            </Button>
                        </div>
                    </div>
                    {viewMode === "channels" ? (
                        <div className="space-y-4">
                            {renderServers()}
                            {renderChannels()}
                        </div>
                    ) : (
                        <ConversationList
                            conversations={conversationsApi.conversations}
                            currentUserId={userId ?? undefined}
                            inboxContractVersion={inboxApi.contractVersion}
                            loading={conversationsApi.loading}
                            inboxItems={inboxApi.items}
                            inboxLoading={inboxApi.loading}
                            inboxBulkLoading={inboxApi.bulkLoading}
                            onMarkInboxScopeRead={inboxApi.markScopeRead}
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
                            onConversationCreated={(conversation) => {
                                setSelectedConversationId(conversation.$id);
                                setViewMode("dms");
                                setSelectedChannel(null);
                            }}
                            onSelectConversation={selectConversation}
                            conversationUnreadStateById={
                                conversationUnreadStateById
                            }
                            selectedConversationId={selectedConversationId}
                        />
                    )}
                </aside>

                <div className="min-w-0 space-y-4 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-xl">
                    {viewMode === "dms" && selectedConversation && userId ? (
                        <DirectMessageView
                            conversation={selectedConversation}
                            currentUserId={userId}
                            loading={dmApi.loading}
                            messages={dmApi.messages}
                            onDelete={dmApi.deleteMsg}
                            onEdit={dmApi.edit}
                            onToggleReaction={dmApi.toggleReaction}
                            activeThreadParent={dmApi.activeThreadParent}
                            onCloseThread={dmApi.closeThread}
                            onOpenProfileModal={openProfileModal}
                            onOpenThread={dmApi.openThread}
                            onSend={dmApi.send}
                            onSendThreadReply={dmApi.sendThreadReply}
                            onTogglePinMessage={dmApi.togglePin}
                            onLoadOlder={dmApi.loadOlder}
                            pinnedMessageIds={dmApi.conversationPins.map(
                                (item) => item.message.$id,
                            )}
                            pinnedMessages={dmApi.conversationPins.map(
                                (item) => item.message,
                            )}
                            sending={dmApi.sending}
                            readOnly={dmApi.readOnly}
                            readOnlyReason={dmApi.readOnlyReason}
                            threadLoading={dmApi.threadLoading}
                            threadReplySending={dmApi.threadReplySending}
                            threadMessages={dmApi.threadMessages}
                            typingUsers={dmApi.typingUsers}
                            onTypingChange={dmApi.handleTypingChange}
                            shouldShowLoadOlder={dmApi.shouldShowLoadOlder}
                            onCatchUpUnread={handleCatchUpCurrentContext}
                            onJumpToUnread={handleJumpToCurrentUnread}
                            unreadAnchorMessageId={
                                activeUnreadAnchor?.contextKey ===
                                currentContextKey
                                    ? activeUnreadAnchor.messageId
                                    : null
                            }
                            unreadSummaryLabel={
                                currentContextKind &&
                                currentContextUnreadCount > 0
                                    ? `${currentContextUnreadCount} unread ${unreadSummaryUnitLabel}${
                                          currentContextUnreadCount === 1
                                              ? ""
                                              : "s"
                                      } in this ${
                                          currentContextKind === "channel"
                                              ? "channel"
                                              : "conversation"
                                      }`
                                    : null
                            }
                            dmEncryptionSelfEnabled={
                                dmApi.dmEncryptionSelfEnabled
                            }
                            dmEncryptionPeerEnabled={
                                dmApi.dmEncryptionPeerEnabled
                            }
                            dmEncryptionMutualEnabled={
                                dmApi.dmEncryptionMutualEnabled
                            }
                            dmEncryptionPeerPublicKey={
                                dmApi.dmEncryptionPeerPublicKey
                            }
                        />
                    ) : (
                        <>
                            {selectedChannel ? (
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <Hash className="h-5 w-5 text-muted-foreground" />
                                                <h2 className="truncate font-semibold">
                                                    {channelsApi.channels.find(
                                                        (c) =>
                                                            c.$id ===
                                                            selectedChannel,
                                                    )?.name || "Channel"}
                                                </h2>
                                            </div>
                                            <div className="flex items-center gap-2">
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
                                                            title="Channel permissions"
                                                            type="button"
                                                            variant="ghost"
                                                        >
                                                            <Settings className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                            </div>
                                        </div>
                                        {renderMessages()}
                                    </div>

                                    <aside className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
                                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                            <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                                                <Pin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                                Pinned Messages
                                            </div>
                                            <ChatPinnedMessagesContent
                                                canManageMessages={
                                                    canManageMessages
                                                }
                                                messages={
                                                    pinnedChannelSurfaceMessages
                                                }
                                                onJumpToMessage={
                                                    jumpToPinnedMessage
                                                }
                                                onUnpin={async (
                                                    surfaceMessage,
                                                ) => {
                                                    const rawMessage =
                                                        pinnedChannelMessages.find(
                                                            (message) =>
                                                                message.$id ===
                                                                surfaceMessage.sourceMessageId,
                                                        );
                                                    if (rawMessage) {
                                                        await togglePin(
                                                            rawMessage,
                                                        );
                                                    }
                                                }}
                                            />
                                        </div>

                                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <h3 className="font-medium text-sm">
                                                    Thread
                                                </h3>
                                                {activeThreadParent ? (
                                                    <Button
                                                        onClick={closeThread}
                                                        size="sm"
                                                        type="button"
                                                        variant="ghost"
                                                    >
                                                        Close
                                                    </Button>
                                                ) : null}
                                            </div>
                                            {!activeThreadParent ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Open a message thread to
                                                    view replies here.
                                                </p>
                                            ) : (
                                                <ChatThreadContent
                                                    currentUserId={userId}
                                                    customEmojis={customEmojis}
                                                    loading={_threadLoading}
                                                    onReplyTextChange={
                                                        setThreadReplyText
                                                    }
                                                    onSendReply={async () => {
                                                        const value =
                                                            threadReplyText;
                                                        setThreadReplyText("");
                                                        await _sendThreadReply(
                                                            value,
                                                        );
                                                    }}
                                                    onToggleReaction={
                                                        surfaceController.onToggleReaction
                                                    }
                                                    parentMessage={
                                                        threadParentSurfaceMessage
                                                    }
                                                    replies={
                                                        threadSurfaceMessages
                                                    }
                                                    sendingReply={
                                                        _threadReplySending
                                                    }
                                                    replyText={threadReplyText}
                                                />
                                            )}
                                        </div>
                                    </aside>
                                </div>
                            ) : (
                                renderMessages()
                            )}
                        </>
                    )}
                </div>
            </div>

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
            {viewingImage && (
                <ImageViewer
                    alt={viewingImage.alt}
                    onClose={() => {
                        setViewingImage(null);
                    }}
                    src={viewingImage.url}
                />
            )}
            <MuteDialog
                open={muteDialogState.open}
                onOpenChange={(open) =>
                    setMuteDialogState((prev) => ({ ...prev, open }))
                }
                targetId={muteDialogState.id}
                targetName={muteDialogState.name}
                targetType={muteDialogState.type}
                initialOverride={activeMuteOverride}
                onMuteComplete={() => {
                    void notificationSettingsApi.refetch();
                }}
            />
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
        </div>
    );
}
