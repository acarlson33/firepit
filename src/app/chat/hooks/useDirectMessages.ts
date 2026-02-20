"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
    listDirectMessages,
    sendDirectMessage,
    editDirectMessage,
    deleteDirectMessage,
} from "@/lib/appwrite-dms-client";
import type { DirectMessage } from "@/lib/types";
import type { PinnedMessage } from "@/lib/types";
import { parseReactions } from "@/lib/reactions-utils";
import { useDebouncedBatchUpdate } from "@/hooks/useDebounce";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import {
    createDMThreadReply,
    listConversationPins,
    listDMThreadMessages,
    pinDMMessage,
    unpinDMMessage,
} from "@/lib/thread-pin-client";

const env = getEnvConfig();
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const TYPING_COLLECTION_ID = env.collections.typing || undefined;

type UseDirectMessagesProps = {
    conversationId: string | null;
    userId: string | null;
    receiverId?: string;
    userName?: string | null;
};

export function useDirectMessages({
    conversationId,
    userId,
    receiverId,
    userName,
}: UseDirectMessagesProps) {
    function isTopLevelMessage(message: { threadId?: string }) {
        return !message.threadId;
    }

    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [typingUsers, setTypingUsers] = useState<
        Record<string, { userId: string; userName?: string; updatedAt: string }>
    >({});
    const [conversationPins, setConversationPins] = useState<
        Array<{ pin: PinnedMessage; message: DirectMessage }>
    >([]);
    const [activeThreadParent, setActiveThreadParent] =
        useState<DirectMessage | null>(null);
    const [threadMessages, setThreadMessages] = useState<DirectMessage[]>([]);
    const [threadLoading, setThreadLoading] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastTypingSentState = useRef<boolean>(false);
    const lastTypingSentAt = useRef<number>(0);
    const currentConversationIdRef = useRef<string | null>(conversationId);
    const userProfileCache = useRef<
        Record<
            string,
            { displayName?: string; avatarUrl?: string; pronouns?: string }
        >
    >({});

    const typingIdleMs = 2500;
    const typingStartDebounceMs = 400;

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

    const loadMessages = useCallback(async () => {
        if (!conversationId || !DIRECT_MESSAGES_COLLECTION) {
            setMessages([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Optimized: Batch query all messages at once
            // User profiles are fetched in batches (5 at a time) to reduce API calls
            // Images are already included in the response with URLs
            const result = await listDirectMessages(conversationId);

            // Reverse to show oldest first
            const orderedItems = result.items.reverse();
            setMessages(orderedItems.filter(isTopLevelMessage));
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to load messages",
            );
        } finally {
            setLoading(false);
        }
    }, [conversationId]);

    useEffect(() => {
        currentConversationIdRef.current = conversationId;
    }, [conversationId]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        if (!conversationId) {
            setConversationPins([]);
            setActiveThreadParent(null);
            setThreadMessages([]);
            return;
        }

        listConversationPins(conversationId)
            .then((items) => {
                setConversationPins(items);
            })
            .catch(() => {
                setConversationPins([]);
            });
    }, [conversationId]);

    // Real-time subscription
    useEffect(() => {
        if (!conversationId || !DIRECT_MESSAGES_COLLECTION) {
            return;
        }

        // Import dynamically to avoid SSR issues
        import("appwrite")
            .then(({ Client }) => {
                const client = new Client()
                    .setEndpoint(env.endpoint)
                    .setProject(env.project);

                const unsubscribe = client.subscribe(
                    `databases.${env.databaseId}.collections.${DIRECT_MESSAGES_COLLECTION}.documents`,
                    (response) => {
                        const payload = response.payload as Record<
                            string,
                            unknown
                        >;
                        const msgConversationId = payload.conversationId;
                        const events = response.events as string[];

                        // Only update if message belongs to this conversation
                        if (msgConversationId === conversationId) {
                            const messageData = {
                                ...(payload as unknown as DirectMessage),
                                reactions: parseReactions(
                                    (payload as Record<string, unknown>)
                                        .reactions as string | undefined,
                                ),
                            };

                            if (!isTopLevelMessage(messageData)) {
                                return;
                            }

                            // Handle different event types to avoid full reload
                            if (events.some((e) => e.endsWith(".create"))) {
                                setMessages((prev) => {
                                    // Check if message already exists to prevent duplicates
                                    if (
                                        prev.some(
                                            (m) => m.$id === messageData.$id,
                                        )
                                    ) {
                                        return prev;
                                    }
                                    return [...prev, messageData];
                                });
                            } else if (
                                events.some((e) => e.endsWith(".update"))
                            ) {
                                setMessages((prev) =>
                                    prev.map((m) =>
                                        m.$id === messageData.$id
                                            ? messageData
                                            : m,
                                    ),
                                );
                            } else if (
                                events.some((e) => e.endsWith(".delete"))
                            ) {
                                setMessages((prev) =>
                                    prev.filter(
                                        (m) => m.$id !== messageData.$id,
                                    ),
                                );
                            }
                        }
                    },
                );

                return () => {
                    unsubscribe();
                };
            })
            .catch(() => {
                // Ignore subscription errors
            });
    }, [conversationId]);

    const send = useCallback(
        async (
            text: string,
            imageFileId?: string,
            imageUrl?: string,
            replyToId?: string,
            attachments?: unknown[],
        ) => {
            if (!conversationId || !userId) {
                return;
            }

            // Require either text, image, or attachments
            if (
                !text.trim() &&
                !imageFileId &&
                (!attachments || attachments.length === 0)
            ) {
                return;
            }

            if (text && text.length > MAX_MESSAGE_LENGTH) {
                toast.error(MESSAGE_TOO_LONG_ERROR);
                return;
            }

            setSending(true);
            try {
                const message = await sendDirectMessage(
                    conversationId,
                    userId,
                    receiverId,
                    text.trim() || "",
                    imageFileId,
                    imageUrl,
                    replyToId,
                    attachments,
                );

                // Enrich with sender profile data (cached to avoid repeated fetches)
                if (!userProfileCache.current[userId]) {
                    try {
                        const profileResponse = await fetch(
                            `/api/users/${encodeURIComponent(userId)}/profile`,
                        );
                        if (profileResponse.ok) {
                            const profile = await profileResponse.json();
                            userProfileCache.current[userId] = {
                                displayName: profile.displayName,
                                avatarUrl: profile.avatarUrl,
                                pronouns: profile.pronouns,
                            };
                        } else if (process.env.NODE_ENV === "development") {
                            // Log non-ok responses in development to aid debugging
                            console.warn(
                                `Profile fetch failed for ${userId}: ${profileResponse.status}`,
                            );
                        }
                    } catch (error) {
                        // Log fetch errors in development
                        if (process.env.NODE_ENV === "development") {
                            console.warn(
                                `Profile fetch error for ${userId}:`,
                                error,
                            );
                        }
                    }
                }

                // Create enriched message object (avoid mutating original)
                const profile = userProfileCache.current[userId];
                const enrichedMessage: DirectMessage = {
                    ...message,
                    senderDisplayName: profile?.displayName,
                    senderAvatarUrl: profile?.avatarUrl,
                    senderPronouns: profile?.pronouns,
                    // Parse reactions if present, otherwise use empty array
                    reactions: message.reactions
                        ? parseReactions(message.reactions)
                        : [],
                };

                // Optimistically add the message to local state with sorting
                setMessages((prev) => {
                    // Check if message already exists to prevent duplicates
                    if (prev.some((m) => m.$id === enrichedMessage.$id)) {
                        return prev;
                    }
                    // Add and sort by creation time to maintain chronological order
                    return [...prev, enrichedMessage].sort((a, b) =>
                        a.$createdAt.localeCompare(b.$createdAt),
                    );
                });
            } catch (err) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : "Failed to send message";
                toast.error(msg);
                throw new Error(msg);
            } finally {
                setSending(false);
            }
        },
        [conversationId, userId, receiverId],
    );

    const edit = useCallback(
        async (messageId: string, newText: string) => {
            if (!newText.trim()) {
                return;
            }

            try {
                const trimmed = newText.trim();
                if (trimmed.length > MAX_MESSAGE_LENGTH) {
                    toast.error(MESSAGE_TOO_LONG_ERROR);
                    return;
                }

                await editDirectMessage(messageId, trimmed);
                await loadMessages();
            } catch (err) {
                throw new Error(
                    err instanceof Error
                        ? err.message
                        : "Failed to edit message",
                );
            }
        },
        [loadMessages],
    );

    const deleteMsg = useCallback(
        async (messageId: string) => {
            if (!userId) {
                return;
            }

            try {
                await deleteDirectMessage(messageId, userId);
                await loadMessages();
            } catch (err) {
                throw new Error(
                    err instanceof Error
                        ? err.message
                        : "Failed to delete message",
                );
            }
        },
        [userId, loadMessages],
    );

    // Typing indicator management
    const sendTypingState = useCallback(
        (state: boolean) => {
            if (!userId || !conversationId) {
                return;
            }
            const now = Date.now();
            if (
                state === lastTypingSentState.current &&
                now - lastTypingSentAt.current < typingStartDebounceMs
            ) {
                return;
            }
            lastTypingSentState.current = state;
            lastTypingSentAt.current = now;

            // Use conversationId for DM typing status
            if (state) {
                fetch("/api/typing", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId,
                        userName: userName || undefined,
                    }),
                })
                    .then((response) => {
                        if (
                            !response.ok &&
                            process.env.NODE_ENV === "development"
                        ) {
                            // biome-ignore lint: development debugging
                            console.warn(
                                "[typing] Failed to set typing status:",
                                response.status,
                            );
                        }
                    })
                    .catch((error) => {
                        if (process.env.NODE_ENV === "development") {
                            // biome-ignore lint: development debugging
                            console.warn(
                                "[typing] Error updating typing status:",
                                error,
                            );
                        }
                    });
            } else {
                fetch(
                    `/api/typing?conversationId=${encodeURIComponent(conversationId)}`,
                    {
                        method: "DELETE",
                    },
                )
                    .then((response) => {
                        if (
                            !response.ok &&
                            process.env.NODE_ENV === "development"
                        ) {
                            // biome-ignore lint: development debugging
                            console.warn(
                                "[typing] Failed to clear typing status:",
                                response.status,
                            );
                        }
                    })
                    .catch((error) => {
                        if (process.env.NODE_ENV === "development") {
                            // biome-ignore lint: development debugging
                            console.warn(
                                "[typing] Error updating typing status:",
                                error,
                            );
                        }
                    });
            }
        },
        [userId, conversationId, userName, typingStartDebounceMs],
    );

    const scheduleTypingStop = useCallback(() => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
            sendTypingState(false);
        }, typingIdleMs);
    }, [sendTypingState, typingIdleMs]);

    const scheduleTypingStart = useCallback(() => {
        if (typingDebounceRef.current) {
            clearTimeout(typingDebounceRef.current);
        }
        typingDebounceRef.current = setTimeout(() => {
            sendTypingState(true);
        }, typingStartDebounceMs);
    }, [sendTypingState, typingStartDebounceMs]);

    const handleTypingChange = useCallback(
        (text: string) => {
            if (!userId || !conversationId) {
                return;
            }
            const isTyping = text.trim().length > 0;
            if (isTyping) {
                scheduleTypingStart();
                scheduleTypingStop();
            } else {
                if (typingDebounceRef.current) {
                    clearTimeout(typingDebounceRef.current);
                }
                sendTypingState(false);
                if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                }
            }
        },
        [
            userId,
            conversationId,
            scheduleTypingStart,
            scheduleTypingStop,
            sendTypingState,
        ],
    );

    // Realtime subscription for typing indicators
    useEffect(() => {
        // Clear typing users whenever conversation changes (including to null)
        setTypingUsers({});

        if (!conversationId || !TYPING_COLLECTION_ID) {
            return;
        }

        const databaseId = env.databaseId;

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;

        import("appwrite")
            .then(({ Client }) => {
                if (cancelled) return;
                const client = new Client()
                    .setEndpoint(env.endpoint)
                    .setProject(env.project);

                const typingChannel = `databases.${databaseId}.collections.${TYPING_COLLECTION_ID}.documents`;

                const unsubscribe = client.subscribe(
                    typingChannel,
                    (response) => {
                        const payload = response.payload as Record<
                            string,
                            unknown
                        >;
                        const events = response.events as string[];

                        const typing = {
                            $id: String(payload.$id),
                            userId: String(payload.userId),
                            userName: payload.userName as string | undefined,
                            channelId: String(payload.channelId),
                            updatedAt: String(
                                payload.$updatedAt || payload.updatedAt,
                            ),
                        };

                        // Use ref to get current conversation ID, avoiding stale closure
                        if (typing.channelId !== currentConversationIdRef.current) {
                            return;
                        }

                        // Ignore typing events from current user
                        if (typing.userId === userId) {
                            return;
                        }

                        if (process.env.NODE_ENV === "development") {
                            // biome-ignore lint: development debugging
                            console.log(
                                "[typing] Received event:",
                                events,
                                typing,
                            );
                        }

                        // Use batched updates to reduce re-renders
                        if (events.some((e) => e.endsWith(".delete"))) {
                            batchUpdateTypingUsers({
                                userId: typing.userId,
                                userName: typing.userName,
                                updatedAt: typing.updatedAt,
                                action: "remove",
                            });
                        } else if (
                            events.some(
                                (e) =>
                                    e.endsWith(".create") ||
                                    e.endsWith(".update"),
                            )
                        ) {
                            batchUpdateTypingUsers({
                                userId: typing.userId,
                                userName: typing.userName,
                                updatedAt: typing.updatedAt,
                                action: "add",
                            });
                        }
                    },
                );

                cleanupFn = () => {
                    unsubscribe();
                };
            })
            .catch(() => {
                // Ignore subscription errors
            });

        return () => {
            cancelled = true;
            cleanupFn?.();
        };
    }, [conversationId, userId]);

    // Cleanup stale typing indicators
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const staleThreshold = 5000;

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
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Cleanup typing status on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (typingDebounceRef.current) {
                clearTimeout(typingDebounceRef.current);
            }
            sendTypingState(false);
        };
    }, [sendTypingState]);

    const refreshPins = useCallback(async () => {
        if (!conversationId) {
            setConversationPins([]);
            return;
        }

        const items = await listConversationPins(conversationId);
        setConversationPins(items);
    }, [conversationId]);

    const togglePin = useCallback(
        async (message: DirectMessage) => {
            try {
                const isPinned = conversationPins.some(
                    (item) => item.message.$id === message.$id,
                );
                if (isPinned) {
                    await unpinDMMessage(message.$id);
                } else {
                    await pinDMMessage(message.$id);
                }
                await refreshPins();
            } catch (err) {
                toast.error(
                    err instanceof Error ? err.message : "Pin action failed",
                );
            }
        },
        [conversationPins, refreshPins],
    );

    const openThread = useCallback(async (parent: DirectMessage) => {
        setActiveThreadParent(parent);
        setThreadLoading(true);
        try {
            const items = await listDMThreadMessages(parent.$id);
            setThreadMessages(items);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to load thread",
            );
            setThreadMessages([]);
        } finally {
            setThreadLoading(false);
        }
    }, []);

    const closeThread = useCallback(() => {
        setActiveThreadParent(null);
        setThreadMessages([]);
    }, []);

    const sendThreadReply = useCallback(
        async (textValue: string) => {
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
                const reply = await createDMThreadReply(
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
                        const participants = Array.isArray(
                            msg.threadParticipants,
                        )
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
        },
        [activeThreadParent, userId],
    );

    return {
        messages,
        loading,
        error,
        sending,
        send,
        edit,
        deleteMsg,
        refresh: loadMessages,
        typingUsers,
        handleTypingChange,
        conversationPins,
        refreshPins,
        togglePin,
        activeThreadParent,
        threadMessages,
        threadLoading,
        openThread,
        closeThread,
        sendThreadReply,
    };
}
