"use client";
import { Channel, Query } from "appwrite";
import type { RealtimeResponseEvent } from "appwrite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { adaptChannelMessages } from "@/lib/chat-surface";
import { canSend, listRecentMessages } from "@/lib/appwrite-messages";
import { getEnvConfig } from "@/lib/appwrite-core";
import { enrichMessagesWithProfiles } from "@/lib/enrich-messages";
import { enrichMessagesWithPolls } from "@/lib/appwrite-polls";
import type { Message, MessagePoll } from "@/lib/types";
import { parseReactions } from "@/lib/reactions-utils";
import { toggleReaction as toggleReactionRequest } from "@/lib/reactions-client";
import { resolveMessageImageUrl } from "@/lib/message-image-url";
import {
    extractMentionedUsernames,
    extractMentionsWithKnownNames,
} from "@/lib/mention-utils";
import {
    enrichMessageWithProfile,
    enrichMessageWithReplyContext,
} from "@/lib/enrich-messages";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import {
    createChannelThreadReply,
    listChannelPins,
    listChannelThreadMessages,
    pinChannelMessage,
    unpinChannelMessage,
} from "@/lib/thread-pin-client";
import { listThreadReads, persistThreadReads } from "@/lib/thread-read-client";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";
import { useThreadPinState } from "./useThreadPinState";

const env = getEnvConfig();

type UseMessagesOptions = {
    channelId: string | null;
    serverId?: string | null;
    userId: string | null;
    userName: string | null;
    contextId?: string | null;
};

type MessageReaction = NonNullable<Message["reactions"]>[number];

function applyOptimisticPollVote(params: {
    optionId: string;
    poll: MessagePoll;
    userId: string;
}): MessagePoll {
    const { optionId, poll, userId } = params;

    return {
        ...poll,
        options: poll.options.map((option) => {
            const hasCurrentUserVote = option.voterIds.includes(userId);

            if (option.id === optionId) {
                if (hasCurrentUserVote) {
                    return option;
                }

                const voterIds = [...option.voterIds, userId];
                return {
                    ...option,
                    count: voterIds.length,
                    voterIds,
                };
            }

            if (!hasCurrentUserVote) {
                return option;
            }

            const voterIds = option.voterIds.filter(
                (voterId) => voterId !== userId,
            );
            return {
                ...option,
                count: voterIds.length,
                voterIds,
            };
        }),
    };
}

function applyOptimisticPollClose(params: {
    poll: MessagePoll;
    userId: string;
}): MessagePoll {
    const { poll, userId } = params;

    if (poll.status === "closed") {
        return poll;
    }

    return {
        ...poll,
        status: "closed",
        closedAt: new Date().toISOString(),
        closedBy: userId,
    };
}

function applyOptimisticReactionUpdate(params: {
    emoji: string;
    isAdding: boolean;
    reactions: Message["reactions"];
    userId: string;
}): MessageReaction[] {
    const { emoji, isAdding, reactions, userId } = params;
    const nextReactions = (reactions ?? []).map((reaction) => ({
        ...reaction,
        userIds: [...reaction.userIds],
    }));
    const existingIndex = nextReactions.findIndex(
        (reaction) => reaction.emoji === emoji,
    );

    if (isAdding) {
        if (existingIndex === -1) {
            return [...nextReactions, { emoji, userIds: [userId], count: 1 }];
        }

        const existingReaction = nextReactions[existingIndex];
        if (existingReaction.userIds.includes(userId)) {
            return nextReactions;
        }

        const updatedUserIds = [...existingReaction.userIds, userId];
        nextReactions[existingIndex] = {
            ...existingReaction,
            count: updatedUserIds.length,
            userIds: updatedUserIds,
        };
        return nextReactions;
    }

    if (existingIndex === -1) {
        return nextReactions;
    }

    const existingReaction = nextReactions[existingIndex];
    if (!existingReaction.userIds.includes(userId)) {
        return nextReactions;
    }

    const updatedUserIds = existingReaction.userIds.filter(
        (existingUserId) => existingUserId !== userId,
    );
    if (updatedUserIds.length === 0) {
        return nextReactions.filter((_, index) => index !== existingIndex);
    }

    nextReactions[existingIndex] = {
        ...existingReaction,
        count: updatedUserIds.length,
        userIds: updatedUserIds,
    };
    return nextReactions;
}

export function useMessages({
    channelId,
    serverId,
    userId,
    userName,
    contextId,
}: UseMessagesOptions) {
    function isTopLevelMessage(message: { threadId?: string }) {
        return !message.threadId;
    }

    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [sending, setSending] = useState<boolean>(false);
    const [oldestCursor, setOldestCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState<boolean>(false);
    const [text, setText] = useState("");
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
        null,
    );
    const [messageRealtimeDegraded, setMessageRealtimeDegraded] =
        useState(false);
    const mentionedNamesRef = useRef<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<
        Record<string, { userId: string; userName?: string; updatedAt: string }>
    >({});
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastTypingSentAt = useRef<number>(0);
    const listRef = useRef<HTMLDivElement>(null);
    const previousLengthRef = useRef<number>(messages.length);
    const scrollBottomThreshold = 160; // px tolerance to consider user near bottom
    const currentChannelIdRef = useRef<string | null>(channelId);
    const messagesRef = useRef<Message[]>(messages);

    // Update ref when channelId changes
    useEffect(() => {
        currentChannelIdRef.current = channelId;
    }, [channelId]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Reduced initial page size for faster first render (Performance Optimization)
    // Load more messages when scrolling up
    const pageSize = 15; // Reduced from 30 for ~40% faster initial load
    const loadMoreSize = 30; // Load more messages when scrolling
    const typingIdleMs = 1500; // how long until we send a "stopped" event
    const typingStartDebounceMs = 0; // fire "started" immediately on first keystroke
    const userIdSlice = 6;
    const maxTypingDisplay = 3;
    const listChannelThreadReads = useCallback(
        (currentContextId: string) =>
            listThreadReads("channel", currentContextId),
        [],
    );
    const persistChannelThreadReads = useCallback(
        ({
            contextId: currentContextId,
            reads,
        }: {
            contextId: string;
            reads: Record<string, string>;
        }) =>
            persistThreadReads({
                contextId: currentContextId,
                contextType: "channel",
                reads,
            }),
        [],
    );

    // load messages when channel changes
    useEffect(() => {
        if (!channelId) {
            setMessages([]);
            setOldestCursor(null);
            setHasMore(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        setOldestCursor(null);
        setHasMore(false);
        let cancelled = false;

        (async () => {
            try {
                const initial = await enrichMessagesWithPolls(
                    await enrichMessagesWithProfiles(
                        await listRecentMessages(pageSize, undefined, channelId),
                    ),
                );
                if (cancelled) {
                    return;
                }
                const initialTopLevel = initial.filter(isTopLevelMessage);
                setMessages(initialTopLevel);
                if (initial.length) {
                    const oldestTopLevel = initialTopLevel.at(0);
                    setOldestCursor(oldestTopLevel ? oldestTopLevel.$id : null);
                    // If we got a full page, there might be more
                    setHasMore(initial.length === pageSize);
                } else {
                    setOldestCursor(null);
                    setHasMore(false);
                }
            } catch (err) {
                if (cancelled) {
                    return;
                }
                toast.error(
                    err instanceof Error
                        ? err.message
                        : "Failed to load messages",
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })().catch(() => {
            /* error already surfaced via toast */
        });

        return () => {
            cancelled = true;
        };
    }, [channelId, pageSize]);

    // realtime subscription for messages
    useEffect(() => {
        if (!channelId) {
            return;
        }
        const databaseId = env.databaseId;
        const collectionId = env.collections.messages;
        const missing = [databaseId, collectionId].some((v) => !v);
        if (missing) {
            return;
        }

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;

        import("@/lib/realtime-pool")
            .then(async ({ getSharedRealtime, trackSubscription }) => {
                if (cancelled) {
                    return;
                }
                const realtime = getSharedRealtime();
                const messageChannel = Channel.database(databaseId)
                    .collection(collectionId)
                    .document();
                const messageChannelKey = messageChannel.toString();

                function parseBase(
                    event: RealtimeResponseEvent<Record<string, unknown>>,
                ) {
                    const p = event.payload;
                    const imageFileId = p.imageFileId as string | undefined;
                    return {
                        $id: String(p.$id),
                        userId: String(p.userId),
                        userName: p.userName as string | undefined,
                        text: String(p.text),
                        $createdAt: String(p.$createdAt),
                        editedAt: p.editedAt as string | undefined,
                        channelId: p.channelId as string | undefined,
                        removedAt: p.removedAt as string | undefined,
                        removedBy: p.removedBy as string | undefined,
                        imageFileId,
                        imageUrl: resolveMessageImageUrl({
                            imageFileId,
                            imageUrl: p.imageUrl,
                        }),
                        replyToId: p.replyToId as string | undefined,
                        threadId: p.threadId as string | undefined,
                        threadMessageCount:
                            typeof p.threadMessageCount === "number"
                                ? p.threadMessageCount
                                : undefined,
                        threadParticipants: Array.isArray(p.threadParticipants)
                            ? (p.threadParticipants as string[])
                            : undefined,
                        lastThreadReplyAt: p.lastThreadReplyAt as
                            | string
                            | undefined,
                        reactions: parseReactions(
                            p.reactions as string | undefined,
                        ),
                        mentions: Array.isArray(p.mentions)
                            ? (p.mentions as string[])
                            : undefined,
                    } as Message;
                }
                function includeMessage(
                    base: { channelId?: string },
                    activeChannelId: string | null,
                ) {
                    return base.channelId === activeChannelId;
                }
                async function applyCreate(base: Message) {
                    const activeChannelId = currentChannelIdRef.current;
                    // Enrich message with profile data before adding to state
                    const profileEnriched =
                        await enrichMessageWithProfile(base, userId);
                    if (currentChannelIdRef.current !== activeChannelId) {
                        return;
                    }
                    if (!profileEnriched) {
                        return;
                    }
                    setMessages((prev) => {
                        // Check if message already exists to prevent duplicates
                        if (prev.some((m) => m.$id === profileEnriched.$id)) {
                            return prev.map((message) =>
                                message.$id === profileEnriched.$id
                                    ? {
                                          ...message,
                                          ...profileEnriched,
                                          attachments:
                                              profileEnriched.attachments ??
                                              message.attachments,
                                          replyTo:
                                              profileEnriched.replyTo ??
                                              message.replyTo,
                                      }
                                    : message,
                            );
                        }
                        // Enrich with reply context using existing messages
                        const enriched = enrichMessageWithReplyContext(
                            profileEnriched,
                            prev,
                        );
                        return [...prev, enriched].sort((a, b) =>
                            a.$createdAt.localeCompare(b.$createdAt),
                        );
                    });
                }
                async function applyUpdate(base: Message) {
                    const activeChannelId = currentChannelIdRef.current;
                    // Enrich message with profile data before updating state
                    const profileEnriched =
                        await enrichMessageWithProfile(base, userId);
                    if (currentChannelIdRef.current !== activeChannelId) {
                        return;
                    }
                    if (!profileEnriched) {
                        setMessages((prev) =>
                            prev.filter((message) => message.$id !== base.$id),
                        );
                        return;
                    }
                    setMessages((prev) => {
                        // Enrich with reply context using existing messages
                        const enriched = enrichMessageWithReplyContext(
                            profileEnriched,
                            prev,
                        );
                        return prev.map((m) =>
                            m.$id === enriched.$id ? { ...m, ...enriched } : m,
                        );
                    });
                }
                function applyDelete(base: Message) {
                    setMessages((prev) =>
                        prev.filter((m) => m.$id !== base.$id),
                    );
                }
                function dispatchByEvents(evs: string[], base: Message) {
                    if (evs.some((e) => e.endsWith(".create"))) {
                        void applyCreate(base);
                        return;
                    }
                    if (evs.some((e) => e.endsWith(".update"))) {
                        void applyUpdate(base);
                        return;
                    }
                    if (evs.some((e) => e.endsWith(".delete"))) {
                        applyDelete(base);
                    }
                }
                try {
                    const subscription = await realtime.subscribe(
                        messageChannel,
                        (
                            event: RealtimeResponseEvent<
                                Record<string, unknown>
                            >,
                        ) => {
                            const base = parseBase(event);
                            if (!isTopLevelMessage(base)) {
                                return;
                            }
                            const activeChannelId = currentChannelIdRef.current;
                            if (!includeMessage(base, activeChannelId)) {
                                return;
                            }
                            dispatchByEvents(event.events, base);
                        },
                        [Query.equal("channelId", channelId)],
                    );

                    if (cancelled) {
                        await closeSubscriptionSafely(subscription);
                        return;
                    }

                    const untrack = trackSubscription(messageChannelKey);
                    setMessageRealtimeDegraded(false);

                    cleanupFn = () => {
                        untrack();
                        void closeSubscriptionSafely(subscription);
                    };
                } catch (error) {
                    if (cancelled) {
                        return;
                    }

                    setMessageRealtimeDegraded(true);
                    logger.error(
                        "Message realtime subscription failed",
                        error instanceof Error ? error : String(error),
                        {
                            collectionId,
                            databaseId,
                            messageChannelKey,
                        },
                    );
                    return;
                }
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                setMessageRealtimeDegraded(true);
                logger.error(
                    "Failed to initialize message realtime dependencies",
                    error instanceof Error ? error : String(error),
                    {
                        collectionId,
                        databaseId,
                        messageChannelKey: Channel.database(databaseId)
                            .collection(collectionId)
                            .document()
                            .toString(),
                    },
                );
            });

        return () => {
            cancelled = true;
            cleanupFn?.();
        };
    }, [channelId]);

    // Typing indicator subscription via Appwrite Presences API.
    useEffect(() => {
        setTypingUsers({});

        const effectiveContextId = contextId ?? channelId;
        if (!effectiveContextId) {
            return;
        }

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;

        import("@/lib/realtime-pool")
            .then(async ({ getSharedRealtime, trackSubscription }) => {
                if (cancelled) {
                    return;
                }
                const realtime = getSharedRealtime();
                // Subscribe to all presence events; filter client-side by metadata
                const presenceChannel = Channel.presences();
                const presenceChannelKey = presenceChannel.toString();

                const subscription = await realtime.subscribe(
                    presenceChannel,
                    (
                        event: RealtimeResponseEvent<Record<string, unknown>>,
                    ) => {
                        if (cancelled) {
                            return;
                        }
                        const payload = event.payload as Record<
                            string,
                            unknown
                        >;
                        const metadata = payload.metadata as
                            | Record<string, unknown>
                            | undefined;
                        const eventChannelId = String(
                            metadata?.channelId ?? "",
                        );
                        const eventUserId = String(payload.userId ?? "");
                        const eventUserName = String(
                            metadata?.userName ?? "",
                        );
                        const eventUpdatedAt = String(
                            payload.$updatedAt ?? payload.updatedAt ?? "",
                        );

                        // Only process events for the current context (channel or conversation)
                        if (eventChannelId !== effectiveContextId) {
                            return;
                        }
                        // Skip own user's presence events
                        if (eventUserId === userId || eventUserId === "") {
                            return;
                        }

                        const isDelete = event.events.some((e) =>
                            e.endsWith(".delete"),
                        );
                        const isUpsert = event.events.some(
                            (e) =>
                                e.endsWith(".upsert") ||
                                e.endsWith(".update"),
                        );

                        setTypingUsers((prev) => {
                            const next = { ...prev };
                            if (isDelete) {
                                delete next[eventUserId];
                            } else if (isUpsert) {
                                next[eventUserId] = {
                                    userId: eventUserId,
                                    userName: eventUserName || undefined,
                                    updatedAt: eventUpdatedAt,
                                };
                            }
                            return next;
                        });
                    },
                );

                if (cancelled) {
                    await closeSubscriptionSafely(subscription);
                    return;
                }

                const untrack = trackSubscription(presenceChannelKey);
                cleanupFn = () => {
                    untrack();
                    void closeSubscriptionSafely(subscription);
                };
            })
            .catch(() => {
                // Silent — realtime subscription failed
            });

        return () => {
            cancelled = true;
            cleanupFn?.();
            // Immediately stop typing presence when leaving the channel
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (typingPresenceCreatedRef.current) {
                void updateTypingPresence(false);
            }
        };
    }, [channelId, userId, contextId]);

    const {
        activeThreadParent,
        closeThread,
        isThreadUnread,
        openThread,
        pins: channelPins,
        refreshPins,
        sendThreadReply,
        threadLoading,
        threadMessages,
        threadReadByMessageId,
        threadReplySending,
        setActiveThreadParent,
        setThreadMessages,
        togglePin,
    } = useThreadPinState<Message>({
        buildOptimisticThreadReply: ({
            createdAt,
            currentUserId,
            parentMessage,
            tempId,
            text,
        }) => ({
            $createdAt: createdAt,
            $id: tempId,
            channelId: parentMessage.channelId,
            serverId: parentMessage.serverId,
            text,
            threadId: parentMessage.threadId ?? parentMessage.$id,
            userId: currentUserId ?? "unknown",
            userName: userName ?? undefined,
        }),
        contextId: channelId,
        currentUserId: userId,
        createThreadReply: createChannelThreadReply,
        listPins: listChannelPins,
        listThreadReads: listChannelThreadReads,
        listThreadMessages: listChannelThreadMessages,
        messages,
        pinContextType: "channel",
        pinMessage: pinChannelMessage,
        persistThreadReads: persistChannelThreadReads,
        setMessages,
        unpinMessage: unpinChannelMessage,
    });

    // Auto-scroll only when user is already near the bottom to avoid snapping when loading older messages
    useEffect(() => {
        const listEl = listRef.current;
        if (!listEl) {
            previousLengthRef.current = messages.length;
            return;
        }

        const prevLength = previousLengthRef.current;
        const isAppending = messages.length > prevLength;

        const distanceFromBottom =
            listEl.scrollHeight - (listEl.scrollTop + listEl.clientHeight);
        const isNearBottom = distanceFromBottom <= scrollBottomThreshold;

        if (isAppending && isNearBottom) {
            listEl.scrollTo({ top: listEl.scrollHeight });
        }

        previousLengthRef.current = messages.length;
    }, [messages, scrollBottomThreshold]);

    // Cleanup stale typing indicators
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const staleThreshold = 5000; // Remove typing indicators older than 5 seconds

            setTypingUsers((prev) => {
                const updated = { ...prev };
                let hasChanges = false;

                for (const [uid, typing] of Object.entries(updated)) {
                    const updatedTime = new Date(typing.updatedAt).getTime();
                    if (now - updatedTime > staleThreshold) {
                        delete updated[uid];
                        hasChanges = true;
                    }
                }

                return hasChanges ? updated : prev;
            });
        }, 1000); // Check every second

        return () => clearInterval(interval);
    }, []);

    async function loadOlder() {
        if (!oldestCursor) {
            return;
        }
        if (!channelId) {
            return;
        }
        try {
            // Use larger page size for "load more" to reduce number of requests
            const older = await enrichMessagesWithPolls(
                await enrichMessagesWithProfiles(
                    await listRecentMessages(loadMoreSize, oldestCursor, channelId),
                ),
            );
            const olderTopLevel = older.filter(isTopLevelMessage);
            if (older.length) {
                setMessages((prev) => [...olderTopLevel, ...prev]);
                const nextOldestTopLevel = olderTopLevel.at(0);
                setOldestCursor(
                    nextOldestTopLevel ? nextOldestTopLevel.$id : null,
                );
                // If we got less than a full page, we've reached the end
                setHasMore(older.length === loadMoreSize);
            } else {
                // No more messages
                setHasMore(false);
            }
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : "Failed to load older messages",
            );
        }
    }

    function startEdit(m: Message) {
        setText(m.text);
        setEditingMessageId(m.$id);
    }

    function cancelEdit() {
        setText("");
        setEditingMessageId(null);
    }

    function startReply(m: Message) {
        setReplyingToMessage(m);
    }

    function cancelReply() {
        setReplyingToMessage(null);
    }

    async function applyEdit(target: Message) {
        try {
            const trimmed = text.trim();
            if (trimmed.length > MAX_MESSAGE_LENGTH) {
                toast.error(MESSAGE_TOO_LONG_ERROR);
                return;
            }

            const response = await fetch(`/api/messages?id=${target.$id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: trimmed }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to edit message");
            }

            setText("");
            setEditingMessageId(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Edit failed");
        }
    }

    async function remove(id: string) {
        try {
            const response = await fetch(`/api/messages?id=${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete message");
            }

            setMessages((prev) => prev.filter((m) => m.$id !== id));

            if (activeThreadParent?.$id === id) {
                closeThread();
            }

            void refreshPins();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Delete failed");
        }
    }

    async function toggleReaction(
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) {
        if (!userId) {
            return;
        }

        const targetMessage = messages.find(
            (message) => message.$id === messageId,
        );
        const previousReactions = targetMessage?.reactions;

        if (targetMessage) {
            setMessages((prev) =>
                prev.map((message) => {
                    if (message.$id !== messageId) {
                        return message;
                    }

                    return {
                        ...message,
                        reactions: applyOptimisticReactionUpdate({
                            emoji,
                            isAdding,
                            reactions: message.reactions,
                            userId,
                        }),
                    };
                }),
            );
        }

        try {
            const result = await toggleReactionRequest(
                messageId,
                emoji,
                isAdding,
                false,
            );

            if (result.reactions && targetMessage) {
                setMessages((prev) =>
                    prev.map((message) =>
                        message.$id === messageId
                            ? { ...message, reactions: result.reactions }
                            : message,
                    ),
                );
            }
        } catch (err) {
            if (targetMessage) {
                setMessages((prev) =>
                    prev.map((message) =>
                        message.$id === messageId
                            ? { ...message, reactions: previousReactions }
                            : message,
                    ),
                );
            }

            toast.error(err instanceof Error ? err.message : "Reaction failed");
        }
    }

    const replaceMessagePoll = useCallback(
        (messageId: string, poll: MessagePoll) => {
            setMessages((prev) =>
                prev.map((message) =>
                    message.$id === messageId ? { ...message, poll } : message,
                ),
            );
        },
        [],
    );

    const replaceThreadPoll = useCallback(
        (messageId: string, poll: MessagePoll | null) => {
            setActiveThreadParent((currentValue) => {
                if (!currentValue || currentValue.$id !== messageId) {
                    return currentValue;
                }

                return {
                    ...currentValue,
                    ...(poll ? { poll } : {}),
                };
            });

            setThreadMessages((currentValue) =>
                currentValue.map((message) =>
                    message.$id === messageId
                        ? {
                              ...message,
                              ...(poll ? { poll } : {}),
                          }
                        : message,
                ),
            );
        },
        [setActiveThreadParent, setThreadMessages],
    );

    const votePoll = useCallback(
        async (messageId: string, optionId: string) => {
            if (!userId) {
                return;
            }

            const previousPoll = messagesRef.current.find(
                (message) => message.$id === messageId,
            )?.poll;

            if (!previousPoll || previousPoll.status === "closed") {
                return;
            }

            let nextOptimisticPoll: MessagePoll | null = null;
            setMessages((prev) => {
                const targetMessage = prev.find(
                    (message) => message.$id === messageId,
                );
                const poll = targetMessage?.poll;

                if (!poll || poll.status === "closed") {
                    return prev;
                }

                const optimisticPoll = applyOptimisticPollVote({
                    optionId,
                    poll,
                    userId,
                });

                nextOptimisticPoll = optimisticPoll;

                return prev.map((message) =>
                    message.$id === messageId
                        ? { ...message, poll: optimisticPoll }
                        : message,
                );
            });

            if (nextOptimisticPoll) {
                replaceThreadPoll(messageId, nextOptimisticPoll);
            }

            const rollbackPoll = previousPoll;

            try {
                const response = await fetch(
                    `/api/messages/${messageId}/poll-votes`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ optionId }),
                    },
                );
                const payload = (await response.json()) as {
                    error?: string;
                    poll?: MessagePoll;
                };

                if (!response.ok || !payload.poll) {
                    throw new Error(payload.error || "Failed to cast vote.");
                }

                replaceMessagePoll(messageId, payload.poll);
                replaceThreadPoll(messageId, payload.poll);
            } catch (err) {
                setMessages((prev) =>
                    prev.map((message) =>
                        message.$id === messageId
                            ? { ...message, poll: rollbackPoll }
                            : message,
                    ),
                );
                replaceThreadPoll(messageId, rollbackPoll ?? null);
                toast.error(
                    err instanceof Error ? err.message : "Failed to cast vote.",
                );
            }
        },
        [replaceMessagePoll, replaceThreadPoll, userId],
    );

    const closePoll = useCallback(
        async (messageId: string) => {
            if (!userId) {
                return;
            }

            const previousPoll = messagesRef.current.find(
                (message) => message.$id === messageId,
            )?.poll;

            if (!previousPoll || previousPoll.status === "closed") {
                return;
            }

            let nextOptimisticPoll: MessagePoll | null = null;
            setMessages((prev) => {
                const targetMessage = prev.find(
                    (message) => message.$id === messageId,
                );
                const poll = targetMessage?.poll;

                if (!poll || poll.status === "closed") {
                    return prev;
                }

                const optimisticPoll = applyOptimisticPollClose({
                    poll,
                    userId,
                });

                nextOptimisticPoll = optimisticPoll;

                return prev.map((message) =>
                    message.$id === messageId
                        ? { ...message, poll: optimisticPoll }
                        : message,
                );
            });

            if (nextOptimisticPoll) {
                replaceThreadPoll(messageId, nextOptimisticPoll);
            }

            const rollbackPoll = previousPoll;

            try {
                const response = await fetch(
                    `/api/messages/${messageId}/poll/close`,
                    {
                        method: "POST",
                    },
                );
                const payload = (await response.json()) as {
                    error?: string;
                    poll?: MessagePoll;
                };

                if (!response.ok || !payload.poll) {
                    throw new Error(payload.error || "Failed to close poll.");
                }

                replaceMessagePoll(messageId, payload.poll);
                replaceThreadPoll(messageId, payload.poll);
            } catch (err) {
                setMessages((prev) =>
                    prev.map((message) =>
                        message.$id === messageId
                            ? { ...message, poll: rollbackPoll }
                            : message,
                    ),
                );
                replaceThreadPoll(messageId, rollbackPoll ?? null);
                toast.error(
                    err instanceof Error ? err.message : "Failed to close poll.",
                );
            }
        },
        [replaceMessagePoll, replaceThreadPoll, userId],
    );

    // Presence-based typing via Appwrite Presences API.
    // Upsert on start (over the existing realtime WS), delete on stop.
    // expiresAt = now + 4s, re-upsert at most every 2s while typing.
    const typingPresenceIdRef = useRef<string | null>(null);
    const typingPresenceCreatedRef = useRef<boolean>(false);
    const TYPING_COOLDOWN_MS = 2000;

    // Use refs for values needed in stale closures (scheduleTypingStart/Stop)
    const userIdRef = useRef(userId);
    const channelIdRef = useRef(channelId);
    const contextIdRef = useRef(contextId);
    userIdRef.current = userId;
    channelIdRef.current = channelId;
    contextIdRef.current = contextId;

    async function updateTypingPresence(state: boolean) {
        const effectiveChannelId = contextIdRef.current ?? channelIdRef.current;
        if (!userIdRef.current) {
            return;
        }
        if (!effectiveChannelId) {
            return;
        }
        if (state && !typingPresenceIdRef.current) {
            typingPresenceIdRef.current = userIdRef.current;
        }

        // Throttle: skip re-upsert if we're already typing and the
        // cooldown hasn't elapsed. The 4s expiresAt keeps the presence
        // alive; we only need to refresh it periodically.
        if (state && typingPresenceCreatedRef.current) {
            const elapsed = Date.now() - lastTypingSentAt.current;
            if (elapsed < TYPING_COOLDOWN_MS) {
                return;
            }
        }

        lastTypingSentAt.current = Date.now();

        if (!state && !typingPresenceCreatedRef.current) {
            return;
        }

        try {
            if (state) {
                const response = await fetch("/api/typing", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        presenceId: typingPresenceIdRef.current,
                        channelId: effectiveChannelId,
                        userName: userName || undefined,
                        expiresAt: new Date(Date.now() + 4000).toISOString(),
                    }),
                });
                if (response.ok) {
                    typingPresenceCreatedRef.current = true;
                }
            } else {
                await fetch("/api/typing", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        presenceId: typingPresenceIdRef.current,
                    }),
                });
                typingPresenceCreatedRef.current = false;
                typingPresenceIdRef.current = null;
            }
        } catch {
            // ignore
        }
    }

    function scheduleTypingStop() {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
            void updateTypingPresence(false);
        }, typingIdleMs);
    }

    function scheduleTypingStart() {
        if (typingDebounceRef.current) {
            clearTimeout(typingDebounceRef.current);
        }
        typingDebounceRef.current = setTimeout(() => {
            void updateTypingPresence(true);
        }, typingStartDebounceMs);
    }

    function onChangeText(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setText(v);
        if (!userId) {
            return;
        }
        if (!channelId && !contextId) {
            return;
        }
        const isTyping = v.trim().length > 0;
        if (isTyping) {
            // Start typing immediately on first keystroke
            scheduleTypingStart();
            // Reset the idle timer on every keystroke
            scheduleTypingStop();
        } else {
            // User cleared input — stop immediately
            if (typingDebounceRef.current) {
                clearTimeout(typingDebounceRef.current);
            }
            void updateTypingPresence(false);
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        }
    }

    async function send(
        e: React.FormEvent,
        imageFileId?: string,
        imageUrl?: string,
        attachments?: unknown[],
        textOverride?: string,
    ) {
        e.preventDefault();
        if (!userId) {
            return;
        }
        if (!channelId) {
            return;
        }
        const value =
            typeof textOverride === "string" ? textOverride.trim() : text.trim();
        if (value.length > MAX_MESSAGE_LENGTH) {
            toast.error(MESSAGE_TOO_LONG_ERROR);
            return;
        }
        if (
            !value &&
            !imageFileId &&
            (!attachments || attachments.length === 0)
        ) {
            return;
        }

        // If editing, find the message and apply edit
        if (editingMessageId) {
            const targetMessage = messages.find(
                (m) => m.$id === editingMessageId,
            );
            if (targetMessage) {
                await applyEdit(targetMessage);
            }
            return;
        }

        // Otherwise, send a new message
        if (!canSend()) {
            toast.error("You're sending messages too fast");
            return;
        }
        try {
            setSending(true);
            setText("");
            const replyToId = replyingToMessage?.$id;
            setReplyingToMessage(null);

            // Parse mentions from text.
            // Combine autocompleted names with all display names from the
            // current message list so manually-typed mentions with spaces
            // (like "@avery <3") are stored correctly in the database.
            const allKnownNames = [
                ...new Set([
                    ...mentionedNamesRef.current,
                    ...messages
                        .map((m) => m.displayName)
                        .filter((n): n is string => Boolean(n)),
                ]),
            ];
            const mentions =
                allKnownNames.length > 0
                    ? extractMentionsWithKnownNames(value, allKnownNames)
                    : extractMentionedUsernames(value);

            const response = await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: value,
                    channelId,
                    serverId: serverId || undefined,
                    imageFileId,
                    imageUrl,
                    attachments:
                        attachments && attachments.length > 0
                            ? attachments
                            : undefined,
                    replyToId,
                    mentions: mentions.length > 0 ? mentions : undefined,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to send message");
            }

            // Optimistically add the message to local state
            const data = await response.json();
            if (data.message) {
                const baseMessage = data.message as Message;

                // Enrich message with profile data and reply context
                const profileEnriched =
                    await enrichMessageWithProfile(baseMessage, userId);
                if (!profileEnriched) {
                    return;
                }
                const enriched = enrichMessageWithReplyContext(
                    profileEnriched,
                    messages,
                );

                // Add to messages array, ensuring no duplicates
                setMessages((prev) => {
                    if (prev.some((m) => m.$id === enriched.$id)) {
                        return prev.map((message) =>
                            message.$id === enriched.$id
                                ? {
                                      ...message,
                                      ...enriched,
                                      attachments:
                                          enriched.attachments ??
                                          message.attachments,
                                  }
                                : message,
                        );
                    }
                    return [...prev, enriched].sort((a, b) =>
                        a.$createdAt.localeCompare(b.$createdAt),
                    );
                });
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to send");
        } finally {
            setSending(false);
        }
    }

    // Determine if we should show the "Load Older" button
    function shouldShowLoadOlder(): boolean {
        // If no messages, don't show button
        if (messages.length === 0) {
            return false;
        }

        // If we know there are no more messages, don't show button
        if (!hasMore) {
            return false;
        }

        // If we have a cursor and there might be more, show the button
        if (oldestCursor && hasMore) {
            return true;
        }

        return false;
    }

    const surfaceMessages = useMemo(() => {
        const messagesById = new Map(
            messages.map((message) => [message.$id, message]),
        );

        return adaptChannelMessages(
            messages,
            channelId
                ? {
                      kind: "channel",
                      channelId,
                      serverId: serverId ?? undefined,
                  }
                : undefined,
        ).map((message) => {
            const sourceMessage = messagesById.get(message.id);

            return {
                ...message,
                threadHasUnread: sourceMessage
                    ? isThreadUnread(sourceMessage)
                    : false,
                threadLastReadAt: threadReadByMessageId[message.id],
            };
        });
    }, [channelId, isThreadUnread, messages, serverId, threadReadByMessageId]);

    const realtimeDegraded = messageRealtimeDegraded;

    return {
        messages,
        surfaceMessages,
        loading,
        sending,
        oldestCursor,
        hasMore,
        text,
        editingMessageId,
        replyingToMessage,
        typingUsers,
        realtimeDegraded,
        messageRealtimeDegraded,
        setTypingUsers,
        listRef,
        loadOlder,
        shouldShowLoadOlder,
        startEdit,
        cancelEdit,
        startReply,
        cancelReply,
        applyEdit,
        remove,
        toggleReaction,
        votePoll,
        closePoll,
        onChangeText,
        send,
        userIdSlice,
        maxTypingDisplay,
        channelPins,
        refreshPins,
        togglePin,
        activeThreadParent,
        threadMessages,
        threadLoading,
        threadReplySending,
        openThread,
        closeThread,
        sendThreadReply,
        setMentionedNames: (names: string[]) => {
            mentionedNamesRef.current = names;
        },
    };
}
