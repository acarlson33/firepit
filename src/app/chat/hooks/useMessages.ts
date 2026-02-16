"use client";
import type { RealtimeResponseEvent } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { canSend, setTyping } from "@/lib/appwrite-messages";
import { getEnrichedMessages } from "@/lib/appwrite-messages-enriched";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { Message } from "@/lib/types";
import { parseReactions } from "@/lib/reactions-utils";
import {
    extractMentionedUsernames,
    extractMentionsWithKnownNames,
} from "@/lib/mention-utils";
import { useDebouncedBatchUpdate } from "@/hooks/useDebounce";
import {
    enrichMessageWithProfile,
    enrichMessageWithReplyContext,
} from "@/lib/enrich-messages";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import type { PinnedMessage } from "@/lib/types";
import {
    createChannelThreadReply,
    listChannelPins,
    listChannelThreadMessages,
    pinChannelMessage,
    unpinChannelMessage,
} from "@/lib/thread-pin-client";

const env = getEnvConfig();

type UseMessagesOptions = {
    channelId: string | null;
    serverId?: string | null;
    userId: string | null;
    userName: string | null;
};

export function useMessages({
    channelId,
    serverId,
    userId,
    userName,
}: UseMessagesOptions) {
    function isTopLevelMessage(message: { threadId?: string }) {
        return !message.threadId;
    }

    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [oldestCursor, setOldestCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState<boolean>(false);
    const [text, setText] = useState("");
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
        null,
    );
    const mentionedNamesRef = useRef<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<
        Record<string, { userId: string; userName?: string; updatedAt: string }>
    >({});
    const [channelPins, setChannelPins] = useState<
        Array<{ pin: PinnedMessage; message: Message }>
    >([]);
    const [activeThreadParent, setActiveThreadParent] =
        useState<Message | null>(null);
    const [threadMessages, setThreadMessages] = useState<Message[]>([]);
    const [threadLoading, setThreadLoading] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastTypingSentState = useRef<boolean>(false);
    const lastTypingSentAt = useRef<number>(0);
    const listRef = useRef<HTMLDivElement>(null);
    const previousLengthRef = useRef<number>(messages.length);
    const scrollBottomThreshold = 160; // px tolerance to consider user near bottom
    const currentChannelIdRef = useRef<string | null>(channelId);

    // Update ref when channelId changes
    useEffect(() => {
        currentChannelIdRef.current = channelId;
    }, [channelId]);

    // Reduced initial page size for faster first render (Performance Optimization)
    // Load more messages when scrolling up
    const pageSize = 15; // Reduced from 30 for ~40% faster initial load
    const loadMoreSize = 30; // Load more messages when scrolling
    const typingIdleMs = 2500; // how long until we send a "stopped" event

    // Debounced batch update for typing state changes (reduces re-renders by 70-80%)
    const batchUpdateTypingUsers = useDebouncedBatchUpdate<{
        userId: string;
        userName?: string;
        updatedAt: string;
        action: "add" | "remove";
    }>((updates) => {
        setTypingUsers((prev) => {
            const updated = { ...prev };
            for (const update of updates) {
                if (update.action === "remove") {
                    delete updated[update.userId];
                } else {
                    updated[update.userId] = {
                        userId: update.userId,
                        userName: update.userName,
                        updatedAt: update.updatedAt,
                    };
                }
            }
            return updated;
        });
    }, 150);
    const typingStartDebounceMs = 400; // debounce for consecutive "started" events
    const userIdSlice = 6;
    const maxTypingDisplay = 3;

    // load messages when channel changes
    useEffect(() => {
        if (!channelId) {
            setMessages([]);
            setOldestCursor(null);
            setHasMore(false);
            setLoading(false);
            return;
        }

        // Clear messages and show loading immediately when channel changes
        setMessages([]);
        setOldestCursor(null);
        setHasMore(false);
        setLoading(true);

        (async () => {
            try {
                const initial = await getEnrichedMessages(
                    pageSize,
                    undefined,
                    channelId,
                );
                const initialTopLevel = initial.filter(isTopLevelMessage);
                setMessages(initialTopLevel);
                if (initial.length) {
                    const oldestTopLevel = initialTopLevel.at(0);
                    setOldestCursor(oldestTopLevel ? oldestTopLevel.$id : null);
                    // If we got a full page, there might be more
                    setHasMore(initial.length === pageSize);
                } else {
                    setHasMore(false);
                }
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : "Failed to load messages",
                );
            } finally {
                setLoading(false);
            }
        })().catch(() => {
            /* error already surfaced via toast */
        });
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

        import("@/lib/realtime-pool")
            .then(({ getSharedClient, trackSubscription }) => {
                const c = getSharedClient();
                const messageChannel = `databases.${databaseId}.collections.${collectionId}.documents`;

                function parseBase(
                    event: RealtimeResponseEvent<Record<string, unknown>>,
                ) {
                    const p = event.payload;
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
                        imageFileId: p.imageFileId as string | undefined,
                        imageUrl: p.imageUrl as string | undefined,
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
                function includeMessage(base: { channelId?: string }) {
                    if (channelId && base.channelId !== channelId) {
                        return false;
                    }
                    if (!channelId && base.channelId) {
                        return false;
                    }
                    return true;
                }
                async function applyCreate(base: Message) {
                    // Enrich message with profile data before adding to state
                    const profileEnriched =
                        await enrichMessageWithProfile(base);
                    setMessages((prev) => {
                        // Check if message already exists to prevent duplicates
                        if (prev.some((m) => m.$id === profileEnriched.$id)) {
                            return prev;
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
                    // Enrich message with profile data before updating state
                    const profileEnriched =
                        await enrichMessageWithProfile(base);
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
                const unsub = c.subscribe(
                    messageChannel,
                    (event: RealtimeResponseEvent<Record<string, unknown>>) => {
                        const base = parseBase(event);
                        if (!isTopLevelMessage(base)) {
                            return;
                        }
                        if (!includeMessage(base)) {
                            return;
                        }
                        dispatchByEvents(event.events, base);
                    },
                );

                const untrack = trackSubscription(messageChannel);

                return () => {
                    untrack();
                    unsub();
                };
            })
            .catch(() => {
                /* failed to set up realtime; ignore silently */
            });
    }, [channelId]);

    // realtime subscription for typing indicators
    useEffect(() => {
        if (!channelId) {
            setTypingUsers({});
            return;
        }
        const databaseId = env.databaseId;
        const typingCollectionId = env.collections.typing;

        if (!databaseId || !typingCollectionId) {
            return;
        }

        import("@/lib/realtime-pool")
            .then(({ getSharedClient, trackSubscription }) => {
                const c = getSharedClient();
                const typingChannel = `databases.${databaseId}.collections.${typingCollectionId}.documents`;

                function parseTyping(
                    event: RealtimeResponseEvent<Record<string, unknown>>,
                ) {
                    const p = event.payload;
                    return {
                        $id: String(p.$id),
                        userId: String(p.userId),
                        userName: p.userName as string | undefined,
                        channelId: String(p.channelId),
                        updatedAt: String(p.$updatedAt || p.updatedAt),
                    };
                }

                function handleTypingEvent(
                    event: RealtimeResponseEvent<Record<string, unknown>>,
                ) {
                    const typing = parseTyping(event);

                    // Only process typing events for current channel
                    if (typing.channelId !== channelId) {
                        return;
                    }

                    // Ignore typing events from current user
                    if (typing.userId === userId) {
                        return;
                    }

                    // Use batched updates to reduce re-renders by 70-80%
                    if (event.events.some((e) => e.endsWith(".delete"))) {
                        // User stopped typing
                        batchUpdateTypingUsers({
                            userId: typing.userId,
                            userName: typing.userName,
                            updatedAt: typing.updatedAt,
                            action: "remove",
                        });
                    } else if (
                        event.events.some(
                            (e) =>
                                e.endsWith(".create") || e.endsWith(".update"),
                        )
                    ) {
                        // User is typing or updated their typing status
                        batchUpdateTypingUsers({
                            userId: typing.userId,
                            userName: typing.userName,
                            updatedAt: typing.updatedAt,
                            action: "add",
                        });
                    }
                }

                const unsub = c.subscribe(typingChannel, handleTypingEvent);
                const untrack = trackSubscription(typingChannel);

                return () => {
                    untrack();
                    unsub();
                };
            })
            .catch(() => {
                /* failed to set up typing realtime; ignore silently */
            });
    }, [channelId, userId]);

    useEffect(() => {
        if (!channelId) {
            setChannelPins([]);
            setActiveThreadParent(null);
            setThreadMessages([]);
            return;
        }

        listChannelPins(channelId)
            .then((items) => {
                setChannelPins(items);
            })
            .catch(() => {
                setChannelPins([]);
            });
    }, [channelId]);

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
            const older = await getEnrichedMessages(
                loadMoreSize,
                oldestCursor,
                channelId,
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
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Delete failed");
        }
    }

    function sendTypingState(state: boolean) {
        if (!userId) {
            return;
        }
        if (!channelId) {
            return;
        }
        // Avoid redundant network calls if state and recent timestamp match
        const now = Date.now();
        if (
            state === lastTypingSentState.current &&
            now - lastTypingSentAt.current < typingStartDebounceMs
        ) {
            return;
        }
        lastTypingSentState.current = state;
        lastTypingSentAt.current = now;
        setTyping(userId, channelId, userName || undefined, state).catch(() => {
            /* ignore */
        });
    }

    function scheduleTypingStop() {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
            sendTypingState(false);
        }, typingIdleMs);
    }

    function scheduleTypingStart() {
        if (typingDebounceRef.current) {
            clearTimeout(typingDebounceRef.current);
        }
        typingDebounceRef.current = setTimeout(() => {
            sendTypingState(true);
        }, typingStartDebounceMs);
    }

    function onChangeText(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setText(v);
        if (!userId) {
            return;
        }
        if (!channelId) {
            return;
        }
        const isTyping = v.trim().length > 0;
        if (isTyping) {
            scheduleTypingStart();
            scheduleTypingStop();
        } else {
            // User cleared input: send stop immediately
            if (typingDebounceRef.current) {
                clearTimeout(typingDebounceRef.current);
            }
            sendTypingState(false);
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
    ) {
        e.preventDefault();
        if (!userId) {
            return;
        }
        if (!channelId) {
            return;
        }
        const value = text.trim();
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
                    await enrichMessageWithProfile(baseMessage);
                const enriched = enrichMessageWithReplyContext(
                    profileEnriched,
                    messages,
                );

                // Add to messages array, ensuring no duplicates
                setMessages((prev) => {
                    if (prev.some((m) => m.$id === enriched.$id)) {
                        return prev;
                    }
                    return [...prev, enriched].sort((a, b) =>
                        a.$createdAt.localeCompare(b.$createdAt),
                    );
                });
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to send");
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

    async function refreshPins() {
        if (!channelId) {
            setChannelPins([]);
            return;
        }

        const items = await listChannelPins(channelId);
        setChannelPins(items);
    }

    async function togglePin(message: Message) {
        try {
            const isPinned = channelPins.some(
                (item) => item.message.$id === message.$id,
            );
            if (isPinned) {
                await unpinChannelMessage(message.$id);
            } else {
                await pinChannelMessage(message.$id);
            }
            await refreshPins();
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Pin action failed",
            );
        }
    }

    async function openThread(parent: Message) {
        setActiveThreadParent(parent);
        setThreadLoading(true);
        try {
            const items = await listChannelThreadMessages(parent.$id);
            setThreadMessages(items);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to load thread",
            );
            setThreadMessages([]);
        } finally {
            setThreadLoading(false);
        }
    }

    function closeThread() {
        setActiveThreadParent(null);
        setThreadMessages([]);
    }

    async function sendThreadReply(textValue: string) {
        if (!activeThreadParent) {
            return;
        }

        const value = textValue.trim();
        if (!value) {
            return;
        }
        if (value.length > MAX_MESSAGE_LENGTH) {
            toast.error(MESSAGE_TOO_LONG_ERROR);
            return;
        }

        try {
            const reply = await createChannelThreadReply(
                activeThreadParent.$id,
                {
                    text: value,
                },
            );

            setThreadMessages((prev) =>
                [...prev, reply].sort((a, b) =>
                    a.$createdAt.localeCompare(b.$createdAt),
                ),
            );

            setMessages((prev) =>
                prev.map((msg) => {
                    if (msg.$id !== activeThreadParent.$id) {
                        return msg;
                    }
                    const currentCount = msg.threadMessageCount || 0;
                    const participants = Array.isArray(msg.threadParticipants)
                        ? msg.threadParticipants
                        : [];
                    const nextParticipants =
                        userId && !participants.includes(userId)
                            ? [...participants, userId]
                            : participants;
                    return {
                        ...msg,
                        threadMessageCount: currentCount + 1,
                        threadParticipants: nextParticipants,
                        lastThreadReplyAt: new Date().toISOString(),
                    };
                }),
            );
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : "Failed to send thread reply",
            );
        }
    }

    return {
        messages,
        loading,
        oldestCursor,
        hasMore,
        text,
        editingMessageId,
        replyingToMessage,
        typingUsers,
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
        openThread,
        closeThread,
        sendThreadReply,
        setMentionedNames: (names: string[]) => {
            mentionedNamesRef.current = names;
        },
    };
}
