"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
    AtSign,
    BellOff,
    Check,
    Clock3,
    Inbox,
    Loader2,
    MessageSquare,
    MoreVertical,
    Plus,
    UserMinus,
    Users,
    X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import { useFriends } from "@/hooks/useFriends";
import { getOrCreateConversation } from "@/lib/appwrite-dms-client";
import { listInboxWithFilters } from "@/lib/inbox-client";
import {
    buildChatMessageHref,
    type ChatMessageDestination,
} from "@/lib/message-navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Conversation, InboxItem, InboxListResponse } from "@/lib/types";
import { toast } from "sonner";

type SidebarMode = "chats" | "inbox" | "mentions";

type InboxFilter = "all" | "mentions" | "direct" | "server";

type MentionItem = {
    authorAvatarUrl?: string;
    authorLabel: string;
    createdAt: string;
    destination: ChatMessageDestination;
    id: string;
    kind: "mention" | "thread";
    muted: boolean;
    text: string;
    unreadCount: number;
};

type InboxFilterQuery = {
    kinds?: Array<"mention" | "thread">;
    scope?: "all" | "direct" | "server";
};

function filterInboxItems(
    items: MentionItem[],
    filter: InboxFilter,
): MentionItem[] {
    if (filter === "mentions") {
        return items.filter((item) => item.kind === "mention");
    }

    if (filter === "direct") {
        return items.filter((item) => item.destination.kind === "dm");
    }

    if (filter === "server") {
        return items.filter((item) => item.destination.kind === "channel");
    }

    return items;
}

type ConversationUnreadState = {
    count: number;
    muted: boolean;
};

type ConversationListProps = {
    conversations: Conversation[];
    currentUserId?: string;
    loading: boolean;
    selectedConversationId: string | null;
    onConversationCreated?: (conversation: Conversation) => void;
    onSelectConversation: (conversation: Conversation) => void;
    onNewConversation: () => void;
    onMuteConversation?: (
        conversationId: string,
        conversationName: string,
    ) => void;
    inboxItems?: InboxItem[];
    inboxLoading?: boolean;
    inboxContractVersion?: InboxListResponse["contractVersion"];
    conversationUnreadStateById?: Record<string, ConversationUnreadState>;
};

export function ConversationList({
    conversations,
    currentUserId,
    loading,
    selectedConversationId,
    onConversationCreated,
    onSelectConversation,
    onNewConversation,
    onMuteConversation,
    inboxItems = [],
    inboxLoading = false,
    inboxContractVersion = "thread_v1",
    conversationUnreadStateById = {},
}: ConversationListProps) {
    const router = useRouter();
    const {
        friends,
        incoming,
        loading: friendsLoading,
        actionLoading,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriendship,
    } = useFriends(Boolean(currentUserId));
    const [openingConversationUserId, setOpeningConversationUserId] = useState<
        string | null
    >(null);
    const [sidebarMode, setSidebarMode] = useState<SidebarMode>("chats");
    const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
    const isMessageContract = inboxContractVersion === "message_v2";

    const getConversationUnreadCount = useCallback(
        (conversation: Conversation) => {
            const inboxCount =
                conversationUnreadStateById[conversation.$id]?.count;
            if (typeof inboxCount === "number") {
                return inboxCount;
            }

            if (isMessageContract) {
                return 0;
            }

            return conversation.unreadThreadCount ?? 0;
        },
        [conversationUnreadStateById, isMessageContract],
    );

    const favoriteFriends = useMemo(() => friends.slice(0, 4), [friends]);
    const incomingRequests = useMemo(() => incoming.slice(0, 3), [incoming]);
    const unreadConversations = useMemo(
        () =>
            conversations.filter(
                (conversation) => getConversationUnreadCount(conversation) > 0,
            ),
        [conversations, getConversationUnreadCount],
    );
    const sidebarItems = useMemo(
        () =>
            inboxItems.map((item) => {
                const destination: ChatMessageDestination =
                    item.contextKind === "channel"
                        ? {
                              kind: "channel",
                              channelId: item.contextId,
                              messageId: item.messageId,
                              serverId: item.serverId,
                          }
                        : {
                              kind: "dm",
                              conversationId: item.contextId,
                              messageId: item.messageId,
                          };

                return {
                    authorAvatarUrl: item.authorAvatarUrl,
                    authorLabel: item.authorLabel,
                    createdAt: item.latestActivityAt,
                    destination,
                    id: item.id,
                    kind: item.kind,
                    muted: item.muted,
                    text: item.previewText,
                    unreadCount: item.unreadCount,
                } satisfies MentionItem;
            }),
        [inboxItems],
    );
    const mentionItems = useMemo(
        () => sidebarItems.filter((item) => item.kind === "mention"),
        [sidebarItems],
    );

    const [serverFilteredInboxItems, setServerFilteredInboxItems] = useState<
        MentionItem[]
    >([]);
    const [serverFilteredInboxLoading, setServerFilteredInboxLoading] =
        useState(false);

    const inboxFilterQuery = useMemo<InboxFilterQuery>(() => {
        if (inboxFilter === "mentions") {
            return { kinds: ["mention"] };
        }

        if (inboxFilter === "direct") {
            return { scope: "direct" };
        }

        if (inboxFilter === "server") {
            return { scope: "server" };
        }

        return { scope: "all" };
    }, [inboxFilter]);

    const inboxFilterCacheKey = useMemo(
        () =>
            JSON.stringify({
                kinds: inboxFilterQuery.kinds ?? [],
                scope: inboxFilterQuery.scope ?? "all",
            }),
        [inboxFilterQuery.kinds, inboxFilterQuery.scope],
    );

    const sidebarItemsRef = useRef<MentionItem[]>(sidebarItems);
    const prevSidebarItemsRef = useRef<MentionItem[]>(sidebarItems);
    const inboxFilterRef = useRef<InboxFilter>(inboxFilter);
    const inboxFilterQueryRef = useRef<InboxFilterQuery>(inboxFilterQuery);

    useEffect(() => {
        sidebarItemsRef.current = sidebarItems;
    }, [sidebarItems]);

    useEffect(() => {
        inboxFilterRef.current = inboxFilter;
    }, [inboxFilter]);

    useEffect(() => {
        inboxFilterQueryRef.current = inboxFilterQuery;
    }, [inboxFilterQuery]);

    useEffect(() => {
        if (sidebarMode !== "inbox") {
            return;
        }

        let cancelled = false;
        const fallbackItems = filterInboxItems(
            sidebarItemsRef.current,
            inboxFilterRef.current,
        );
        setServerFilteredInboxLoading(true);
        setServerFilteredInboxItems(fallbackItems);

        void listInboxWithFilters({
            kinds: inboxFilterQueryRef.current.kinds,
            scope: inboxFilterQueryRef.current.scope,
        })
            .then((response) => {
                if (cancelled) {
                    return;
                }

                const nextItems = response.items.map((item) => {
                    const destination: ChatMessageDestination =
                        item.contextKind === "channel"
                            ? {
                                  kind: "channel",
                                  channelId: item.contextId,
                                  messageId: item.messageId,
                                  serverId: item.serverId,
                              }
                            : {
                                  kind: "dm",
                                  conversationId: item.contextId,
                                  messageId: item.messageId,
                              };

                    return {
                        authorAvatarUrl: item.authorAvatarUrl,
                        authorLabel: item.authorLabel,
                        createdAt: item.latestActivityAt,
                        destination,
                        id: item.id,
                        kind: item.kind,
                        muted: item.muted,
                        text: item.previewText,
                        unreadCount: item.unreadCount,
                    } satisfies MentionItem;
                });

                setServerFilteredInboxItems(nextItems);
            })
            .catch(() => {
                if (!cancelled) {
                    // Local filtering remains as a fallback for transient failures.
                    setServerFilteredInboxItems(fallbackItems);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setServerFilteredInboxLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [inboxFilterCacheKey, sidebarMode]);

    useEffect(() => {
        if (
            sidebarMode !== "inbox" ||
            serverFilteredInboxLoading ||
            prevSidebarItemsRef.current === sidebarItemsRef.current
        ) {
            return;
        }

        setServerFilteredInboxItems(
            filterInboxItems(sidebarItemsRef.current, inboxFilterRef.current),
        );
        prevSidebarItemsRef.current = sidebarItemsRef.current;
    }, [sidebarItems, sidebarMode]);

    const displayedInboxItems =
        sidebarMode === "inbox" ? serverFilteredInboxItems : sidebarItems;
    const inboxUnreadCount = useMemo(
        () =>
            sidebarItems.reduce(
                (total, item) => total + Math.max(0, item.unreadCount),
                0,
            ),
        [sidebarItems],
    );
    const activeConversationList =
        unreadConversations.length > 0 ? unreadConversations : conversations;
    const showInboxLoading =
        sidebarMode === "inbox" && (inboxLoading || serverFilteredInboxLoading);
    const activeList =
        sidebarMode === "inbox" ? displayedInboxItems : activeConversationList;
    const isEmpty = activeList.length === 0;
    const mentionUnreadCount = useMemo(
        () =>
            mentionItems.reduce(
                (total, item) => total + Math.max(0, item.unreadCount),
                0,
            ),
        [mentionItems],
    );

    function renderUnreadBadge(count: number | undefined, muted = false) {
        if (!count || count <= 0) {
            return null;
        }

        return (
            <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    muted
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground"
                }`}
            >
                {count}
            </span>
        );
    }

    function renderConversationRow(conversation: Conversation) {
        const isSelected = conversation.$id === selectedConversationId;
        const isGroup =
            conversation.isGroup ||
            (conversation.participants?.length ?? 0) > 2;
        const otherUser = conversation.otherUser;
        const participantCount =
            conversation.participantCount ?? conversation.participants.length;
        const displayName = isGroup
            ? conversation.name || "Group DM"
            : otherUser?.displayName || otherUser?.userId || "Unknown User";
        const subtitle = isGroup
            ? `${participantCount} participants`
            : otherUser?.status
              ? otherUser.status
              : undefined;
        const secondaryLine = conversation.readOnly
            ? conversation.readOnlyReason || "Read only"
            : conversation.lastMessage?.text || subtitle;
        const unreadState = conversationUnreadStateById[conversation.$id];
        const secondaryLineClassName = conversation.readOnly
            ? "truncate text-amber-700 dark:text-amber-300 text-xs"
            : "truncate text-muted-foreground text-xs";

        return (
            <div
                className="group relative flex items-center gap-1"
                key={conversation.$id}
            >
                <button
                    className={`flex flex-1 items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                        isSelected ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                    onClick={() => onSelectConversation(conversation)}
                    type="button"
                >
                    <div className="relative">
                        <Avatar
                            alt={displayName}
                            fallback={displayName}
                            size="md"
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
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate font-medium text-sm">
                                    {displayName}
                                </p>
                                {renderUnreadBadge(
                                    unreadState?.count ??
                                        getConversationUnreadCount(
                                            conversation,
                                        ),
                                    unreadState?.muted ?? false,
                                )}
                            </div>
                            {conversation.lastMessageAt && (
                                <span className="text-muted-foreground text-xs">
                                    {new Date(
                                        conversation.lastMessageAt,
                                    ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            )}
                        </div>
                        {secondaryLine && (
                            <p className={secondaryLineClassName}>
                                {secondaryLine}
                            </p>
                        )}
                    </div>
                </button>
                {onMuteConversation && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                                size="icon"
                                type="button"
                                variant="ghost"
                            >
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">
                                    Conversation options
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() =>
                                    onMuteConversation(
                                        conversation.$id,
                                        displayName,
                                    )
                                }
                            >
                                <BellOff className="mr-2 h-4 w-4" />
                                Mute Conversation
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        );
    }

    async function handleOpenFriendConversation(friendUserId: string) {
        if (!currentUserId) {
            return;
        }

        const existingConversation = conversations.find((conversation) => {
            if (conversation.isGroup) {
                return false;
            }

            return conversation.otherUser?.userId === friendUserId;
        });

        if (existingConversation) {
            onSelectConversation(existingConversation);
            return;
        }

        setOpeningConversationUserId(friendUserId);
        try {
            const conversation = await getOrCreateConversation(
                currentUserId,
                friendUserId,
            );
            if (onConversationCreated) {
                onConversationCreated(conversation);
                return;
            }

            onSelectConversation(conversation);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to start direct message",
            );
        } finally {
            setOpeningConversationUserId(null);
        }
    }

    async function handleAction(
        action: () => Promise<boolean>,
        successMessage: string,
    ) {
        const succeeded = await action();
        if (succeeded) {
            toast.success(successMessage);
        }
    }

    if (loading) {
        return (
            <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div className="flex items-center gap-3 p-2" key={i}>
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-border border-b p-3">
                <h3 className="flex items-center gap-2 font-semibold text-sm">
                    <MessageSquare className="size-4" />
                    Direct Messages
                </h3>
                <Button
                    onClick={onNewConversation}
                    size="sm"
                    title="New conversation"
                    variant="ghost"
                >
                    <Plus className="size-4" />
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-1 border-border border-b p-2">
                <Button
                    className="justify-start gap-2 rounded-lg"
                    onClick={() => setSidebarMode("chats")}
                    size="sm"
                    type="button"
                    variant={sidebarMode === "chats" ? "default" : "ghost"}
                >
                    <MessageSquare className="size-3.5" />
                    Chats
                </Button>
                <Button
                    className="justify-between gap-2 rounded-lg"
                    onClick={() => setSidebarMode("inbox")}
                    size="sm"
                    type="button"
                    variant={sidebarMode === "inbox" ? "default" : "ghost"}
                >
                    <span className="flex items-center gap-2">
                        <Inbox className="size-3.5" />
                        Inbox
                    </span>
                    {renderUnreadBadge(inboxUnreadCount)}
                </Button>
                <Button
                    className="justify-between gap-2 rounded-lg"
                    onClick={() => setSidebarMode("mentions")}
                    size="sm"
                    type="button"
                    variant={sidebarMode === "mentions" ? "default" : "ghost"}
                >
                    <span className="flex items-center gap-2">
                        <AtSign className="size-3.5" />
                        Mentions
                    </span>
                    {renderUnreadBadge(mentionUnreadCount)}
                </Button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto">
                {sidebarMode === "inbox" ? (
                    <fieldset className="grid grid-cols-4 gap-1 border-0 border-border border-b p-2">
                        <legend className="sr-only">Inbox filter</legend>
                        <Button
                            aria-pressed={inboxFilter === "all"}
                            className="rounded-lg"
                            onClick={() => setInboxFilter("all")}
                            size="sm"
                            type="button"
                            variant={
                                inboxFilter === "all" ? "default" : "ghost"
                            }
                        >
                            All
                        </Button>
                        <Button
                            aria-pressed={inboxFilter === "mentions"}
                            className="rounded-lg"
                            onClick={() => setInboxFilter("mentions")}
                            size="sm"
                            type="button"
                            variant={
                                inboxFilter === "mentions" ? "default" : "ghost"
                            }
                        >
                            Mentions
                        </Button>
                        <Button
                            aria-pressed={inboxFilter === "direct"}
                            className="rounded-lg"
                            onClick={() => setInboxFilter("direct")}
                            size="sm"
                            type="button"
                            variant={
                                inboxFilter === "direct" ? "default" : "ghost"
                            }
                        >
                            Direct
                        </Button>
                        <Button
                            aria-pressed={inboxFilter === "server"}
                            className="rounded-lg"
                            onClick={() => setInboxFilter("server")}
                            size="sm"
                            type="button"
                            variant={
                                inboxFilter === "server" ? "default" : "ghost"
                            }
                        >
                            Servers
                        </Button>
                    </fieldset>
                ) : null}

                {sidebarMode === "chats" &&
                currentUserId &&
                (friendsLoading ||
                    incomingRequests.length > 0 ||
                    favoriteFriends.length > 0) ? (
                    <div className="space-y-4 border-border/60 border-b p-3">
                        {incomingRequests.length > 0 ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Clock3 className="size-3.5" />
                                    Pending Requests
                                </div>
                                <div className="space-y-2">
                                    {incomingRequests.map((entry) => {
                                        const displayName =
                                            entry.user.displayName ??
                                            entry.user.userId;

                                        return (
                                            <div
                                                className="rounded-xl border border-border/60 bg-background/70 p-2"
                                                key={entry.friendship.$id}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Avatar
                                                        alt={displayName}
                                                        fallback={displayName}
                                                        size="sm"
                                                        src={
                                                            entry.user.avatarUrl
                                                        }
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {displayName}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            wants to connect
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <Button
                                                        className="flex-1"
                                                        disabled={
                                                            actionLoading ===
                                                            `accept:${entry.user.userId}`
                                                        }
                                                        onClick={() =>
                                                            void handleAction(
                                                                () =>
                                                                    acceptFriendRequest(
                                                                        entry
                                                                            .user
                                                                            .userId,
                                                                    ),
                                                                `You are now friends with ${displayName}`,
                                                            )
                                                        }
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        <Check className="mr-2 size-3.5" />
                                                        Accept
                                                    </Button>
                                                    <Button
                                                        className="flex-1"
                                                        disabled={
                                                            actionLoading ===
                                                            `decline:${entry.user.userId}`
                                                        }
                                                        onClick={() =>
                                                            void handleAction(
                                                                () =>
                                                                    declineFriendRequest(
                                                                        entry
                                                                            .user
                                                                            .userId,
                                                                    ),
                                                                `Declined request from ${displayName}`,
                                                            )
                                                        }
                                                        size="sm"
                                                        type="button"
                                                        variant="outline"
                                                    >
                                                        <X className="mr-2 size-3.5" />
                                                        Decline
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Users className="size-3.5" />
                                Friends
                            </div>
                            {friendsLoading ? (
                                <div className="space-y-2">
                                    {Array.from({ length: 2 }).map(
                                        (_, index) => (
                                            <div
                                                className="flex items-center gap-2"
                                                key={index}
                                            >
                                                <Skeleton className="size-8 rounded-full" />
                                                <Skeleton className="h-4 flex-1" />
                                            </div>
                                        ),
                                    )}
                                </div>
                            ) : favoriteFriends.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Add friends from profiles or search to keep
                                    them close.
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {favoriteFriends.map((entry) => {
                                        const displayName =
                                            entry.user.displayName ??
                                            entry.user.userId;
                                        const isOpening =
                                            openingConversationUserId ===
                                            entry.user.userId;

                                        return (
                                            <div
                                                className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/50"
                                                key={entry.friendship.$id}
                                            >
                                                <button
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                    onClick={() =>
                                                        void handleOpenFriendConversation(
                                                            entry.user.userId,
                                                        )
                                                    }
                                                    type="button"
                                                >
                                                    <Avatar
                                                        alt={displayName}
                                                        fallback={displayName}
                                                        size="sm"
                                                        src={
                                                            entry.user.avatarUrl
                                                        }
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {displayName}
                                                        </p>
                                                        {entry.user.pronouns ? (
                                                            <p className="truncate text-xs text-muted-foreground">
                                                                {
                                                                    entry.user
                                                                        .pronouns
                                                                }
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    {isOpening ? (
                                                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                                    ) : null}
                                                </button>
                                                <Button
                                                    className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:opacity-100"
                                                    disabled={
                                                        actionLoading ===
                                                        `remove:${entry.user.userId}`
                                                    }
                                                    onClick={() =>
                                                        void handleAction(
                                                            () =>
                                                                removeFriendship(
                                                                    entry.user
                                                                        .userId,
                                                                ),
                                                            `Removed ${displayName} from friends`,
                                                        )
                                                    }
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    <UserMinus className="size-4" />
                                                    <span className="sr-only">
                                                        Remove {displayName}{" "}
                                                        from friends
                                                    </span>
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {sidebarMode === "mentions" ? (
                    <div className="space-y-1 p-2">
                        {inboxLoading ? (
                            <div className="space-y-2 p-2">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                        className="rounded-lg border border-border/60 p-3"
                                        key={index}
                                    >
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="mt-2 h-3 w-full" />
                                    </div>
                                ))}
                            </div>
                        ) : mentionItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-6 text-center">
                                <AtSign className="mb-2 size-8 text-muted-foreground" />
                                <p className="text-muted-foreground text-sm">
                                    No recent mentions
                                </p>
                            </div>
                        ) : (
                            mentionItems.map((mention) => (
                                <button
                                    className="flex w-full items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition hover:bg-accent/40"
                                    key={mention.id}
                                    onClick={() =>
                                        router.push(
                                            buildChatMessageHref(
                                                mention.destination,
                                                { entry: "unread" },
                                            ) as Route,
                                        )
                                    }
                                    type="button"
                                >
                                    <Avatar
                                        alt={mention.authorLabel}
                                        fallback={mention.authorLabel}
                                        size="sm"
                                        src={mention.authorAvatarUrl}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate font-medium text-sm">
                                                {mention.authorLabel}
                                            </p>
                                            <span className="text-muted-foreground text-xs">
                                                {new Date(
                                                    mention.createdAt,
                                                ).toLocaleDateString([], {
                                                    day: "numeric",
                                                    month: "short",
                                                })}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                            <span>
                                                {mention.kind === "mention"
                                                    ? "Mention"
                                                    : "Thread"}
                                            </span>
                                            {mention.muted ? (
                                                <span>Muted</span>
                                            ) : null}
                                        </div>
                                        <p className="line-clamp-2 text-muted-foreground text-xs">
                                            {mention.text}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                ) : showInboxLoading ? (
                    <div className="space-y-2 p-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div
                                className="rounded-lg border border-border/60 p-3"
                                key={index}
                            >
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="mt-2 h-3 w-full" />
                            </div>
                        ))}
                    </div>
                ) : isEmpty ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                        {sidebarMode === "inbox" ? (
                            <Inbox className="mb-2 size-8 text-muted-foreground" />
                        ) : (
                            <MessageSquare className="mb-2 size-8 text-muted-foreground" />
                        )}
                        <p className="text-muted-foreground text-sm">
                            {sidebarMode === "inbox"
                                ? serverFilteredInboxLoading
                                    ? "Loading inbox items..."
                                    : "No unread items for this filter"
                                : "No conversations yet"}
                        </p>
                        {sidebarMode === "chats" ? (
                            <Button
                                className="mt-3"
                                onClick={onNewConversation}
                                size="sm"
                                variant="outline"
                            >
                                Start a conversation
                            </Button>
                        ) : null}
                    </div>
                ) : (
                    <div className="space-y-1 p-2">
                        {sidebarMode === "inbox"
                            ? displayedInboxItems.map((item) => (
                                  <button
                                      className="flex w-full items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition hover:bg-accent/40"
                                      key={item.id}
                                      onClick={() =>
                                          router.push(
                                              buildChatMessageHref(
                                                  item.destination,
                                                  { entry: "unread" },
                                              ) as Route,
                                          )
                                      }
                                      type="button"
                                  >
                                      <Avatar
                                          alt={item.authorLabel}
                                          fallback={item.authorLabel}
                                          size="sm"
                                          src={item.authorAvatarUrl}
                                      />
                                      <div className="min-w-0 flex-1">
                                          <div className="flex items-center justify-between gap-2">
                                              <p className="truncate font-medium text-sm">
                                                  {item.authorLabel}
                                              </p>
                                              <span className="text-muted-foreground text-xs">
                                                  {new Date(
                                                      item.createdAt,
                                                  ).toLocaleDateString([], {
                                                      day: "numeric",
                                                      month: "short",
                                                  })}
                                              </span>
                                          </div>
                                          <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                              <span>
                                                  {item.kind === "mention"
                                                      ? "Mention"
                                                      : "Thread"}
                                              </span>
                                              <span>
                                                  {item.destination.kind ===
                                                  "channel"
                                                      ? "Channel"
                                                      : "Direct message"}
                                              </span>
                                              {item.muted ? (
                                                  <span>Muted</span>
                                              ) : null}
                                          </div>
                                          <p className="line-clamp-2 text-muted-foreground text-xs">
                                              {item.text}
                                          </p>
                                      </div>
                                  </button>
                              ))
                            : activeConversationList.map((conversation) =>
                                  renderConversationRow(conversation),
                              )}
                    </div>
                )}
            </div>
        </div>
    );
}
