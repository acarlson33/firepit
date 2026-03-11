"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import type { PinItem, ThreadReplyPayload } from "@/lib/thread-pin-client";
import type { PinnedMessage } from "@/lib/types";

type ThreadableMessage = {
    $id: string;
    $createdAt: string;
    threadMessageCount?: number;
    threadParticipants?: string[];
    lastThreadReplyAt?: string;
    isPinned?: boolean;
    pinnedAt?: string;
    pinnedBy?: string;
};

type UseThreadPinStateOptions<TMessage extends ThreadableMessage> = {
    buildOptimisticThreadReply: (params: {
        createdAt: string;
        currentUserId: string | null;
        parentMessage: TMessage;
        tempId: string;
        text: string;
    }) => TMessage;
    contextId: string | null;
    currentUserId: string | null;
    createThreadReply: (
        messageId: string,
        payload: ThreadReplyPayload,
    ) => Promise<TMessage>;
    listPins: (contextId: string) => Promise<Array<PinItem<TMessage>>>;
    listThreadMessages: (messageId: string) => Promise<TMessage[]>;
    messages: TMessage[];
    pinActionErrorMessage?: string;
    pinContextType: PinnedMessage["contextType"];
    pinMessage: (messageId: string) => Promise<unknown>;
    setMessages: React.Dispatch<React.SetStateAction<TMessage[]>>;
    threadLoadErrorMessage?: string;
    threadReplyErrorMessage?: string;
    unpinMessage: (messageId: string) => Promise<void>;
};

function createThreadReadStorageKey(params: {
    contextId: string;
    contextType: PinnedMessage["contextType"];
    currentUserId: string | null;
}) {
    const { contextId, contextType, currentUserId } = params;

    return [
        "firepit",
        "thread-read-state",
        contextType,
        contextId,
        currentUserId ?? "anonymous",
    ].join(":");
}

function getLatestThreadActivityAt<TMessage extends ThreadableMessage>(params: {
    parent: TMessage;
    replies?: TMessage[];
}) {
    const { parent, replies } = params;
    const latestReplyAt = replies?.at(-1)?.$createdAt;

    if (!latestReplyAt) {
        return parent.lastThreadReplyAt;
    }

    if (!parent.lastThreadReplyAt) {
        return latestReplyAt;
    }

    return latestReplyAt.localeCompare(parent.lastThreadReplyAt) > 0
        ? latestReplyAt
        : parent.lastThreadReplyAt;
}

function appendThreadReply<TMessage extends ThreadableMessage>(
    items: TMessage[],
    reply: TMessage,
) {
    return [...items, reply].sort((left, right) =>
        left.$createdAt.localeCompare(right.$createdAt),
    );
}

function createOptimisticPinItem<TMessage extends ThreadableMessage>(params: {
    contextId: string;
    contextType: PinnedMessage["contextType"];
    currentUserId: string | null;
    message: TMessage;
    pinnedAt: string;
}): PinItem<TMessage> {
    const { contextId, contextType, currentUserId, message, pinnedAt } = params;

    return {
        pin: {
            $id: `optimistic-pin-${message.$id}`,
            contextId,
            contextType,
            messageId: message.$id,
            pinnedAt,
            pinnedBy: currentUserId ?? "unknown",
        },
        message: updatePinnedState(message, {
            isPinned: true,
            pinnedAt,
            pinnedBy: currentUserId ?? undefined,
        }),
    };
}

function reconcileThreadParent<TMessage extends ThreadableMessage>(
    message: TMessage,
    replyCreatedAt: string,
): TMessage {
    return {
        ...message,
        lastThreadReplyAt: replyCreatedAt,
    };
}

function replaceThreadReply<TMessage extends ThreadableMessage>(
    items: TMessage[],
    optimisticReplyId: string,
    reply: TMessage,
) {
    return appendThreadReply(
        items.filter(
            (item) => item.$id !== optimisticReplyId && item.$id !== reply.$id,
        ),
        reply,
    );
}

function sortPinsByPinnedAt<TMessage extends ThreadableMessage>(
    items: Array<PinItem<TMessage>>,
) {
    return [...items].sort((left, right) => {
        const pinnedAtOrder = right.pin.pinnedAt.localeCompare(
            left.pin.pinnedAt,
        );
        if (pinnedAtOrder !== 0) {
            return pinnedAtOrder;
        }

        return right.message.$createdAt.localeCompare(left.message.$createdAt);
    });
}

function updatePinnedState<TMessage extends ThreadableMessage>(
    message: TMessage,
    params: {
        isPinned: boolean;
        pinnedAt?: string;
        pinnedBy?: string;
    },
): TMessage {
    return {
        ...message,
        isPinned: params.isPinned,
        pinnedAt: params.isPinned ? params.pinnedAt : undefined,
        pinnedBy: params.isPinned ? params.pinnedBy : undefined,
    } as TMessage;
}

function updatePinnedStateInCollection<TMessage extends ThreadableMessage>(
    items: TMessage[],
    messageId: string,
    params: {
        isPinned: boolean;
        pinnedAt?: string;
        pinnedBy?: string;
    },
) {
    return items.map((item) => {
        if (item.$id !== messageId) {
            return item;
        }

        return updatePinnedState(item, params);
    });
}

function updateThreadParent<TMessage extends ThreadableMessage>(
    message: TMessage,
    currentUserId: string | null,
    replyCreatedAt: string,
): TMessage {
    const currentCount = message.threadMessageCount || 0;
    const participants = Array.isArray(message.threadParticipants)
        ? message.threadParticipants
        : [];
    const nextParticipants =
        currentUserId && !participants.includes(currentUserId)
            ? [...participants, currentUserId]
            : participants;

    return {
        ...message,
        lastThreadReplyAt: replyCreatedAt,
        threadMessageCount: currentCount + 1,
        threadParticipants: nextParticipants,
    };
}

export function useThreadPinState<TMessage extends ThreadableMessage>({
    buildOptimisticThreadReply,
    contextId,
    currentUserId,
    createThreadReply,
    listPins,
    listThreadMessages,
    messages,
    pinActionErrorMessage = "Pin action failed",
    pinContextType,
    pinMessage,
    setMessages,
    threadLoadErrorMessage = "Failed to load thread",
    threadReplyErrorMessage = "Failed to send thread reply",
    unpinMessage,
}: UseThreadPinStateOptions<TMessage>) {
    const [pins, setPins] = useState<Array<PinItem<TMessage>>>([]);
    const [activeThreadParent, setActiveThreadParent] =
        useState<TMessage | null>(null);
    const [threadMessages, setThreadMessages] = useState<TMessage[]>([]);
    const [threadLoading, setThreadLoading] = useState(false);
    const [threadReplySending, setThreadReplySending] = useState(false);
    const [threadReadByMessageId, setThreadReadByMessageId] = useState<
        Record<string, string>
    >({});

    useEffect(() => {
        if (!contextId || typeof window === "undefined") {
            setThreadReadByMessageId({});
            return;
        }

        const storageKey = createThreadReadStorageKey({
            contextId,
            contextType: pinContextType,
            currentUserId,
        });

        try {
            const storedValue = window.sessionStorage.getItem(storageKey);
            if (!storedValue) {
                setThreadReadByMessageId({});
                return;
            }

            const parsedValue = JSON.parse(storedValue);
            if (!parsedValue || typeof parsedValue !== "object") {
                setThreadReadByMessageId({});
                return;
            }

            const nextState = Object.fromEntries(
                Object.entries(parsedValue).filter(
                    ([messageId, readAt]) =>
                        typeof messageId === "string" &&
                        typeof readAt === "string" &&
                        readAt.length > 0,
                ),
            );
            setThreadReadByMessageId(nextState);
        } catch {
            setThreadReadByMessageId({});
        }
    }, [contextId, currentUserId, pinContextType]);

    useEffect(() => {
        if (!contextId || typeof window === "undefined") {
            return;
        }

        const storageKey = createThreadReadStorageKey({
            contextId,
            contextType: pinContextType,
            currentUserId,
        });

        try {
            if (Object.keys(threadReadByMessageId).length === 0) {
                window.sessionStorage.removeItem(storageKey);
                return;
            }

            window.sessionStorage.setItem(
                storageKey,
                JSON.stringify(threadReadByMessageId),
            );
        } catch {
            // Ignore session storage write failures.
        }
    }, [contextId, currentUserId, pinContextType, threadReadByMessageId]);

    const markThreadRead = useCallback((messageId: string, readAt?: string) => {
        if (!readAt) {
            return;
        }

        setThreadReadByMessageId((currentValue) => {
            const existingValue = currentValue[messageId];
            if (existingValue && existingValue.localeCompare(readAt) >= 0) {
                return currentValue;
            }

            return {
                ...currentValue,
                [messageId]: readAt,
            };
        });
    }, []);

    const isThreadUnread = useCallback(
        (message: TMessage) => {
            if (!message.threadMessageCount || !message.lastThreadReplyAt) {
                return false;
            }

            const lastReadAt = threadReadByMessageId[message.$id];
            if (!lastReadAt) {
                return true;
            }

            return lastReadAt.localeCompare(message.lastThreadReplyAt) < 0;
        },
        [threadReadByMessageId],
    );

    const refreshPins = useCallback(async () => {
        if (!contextId) {
            setPins([]);
            return;
        }

        const items = await listPins(contextId);
        setPins(items);
    }, [contextId, listPins]);

    useEffect(() => {
        if (!contextId) {
            setPins([]);
            setActiveThreadParent(null);
            setThreadMessages([]);
            return;
        }

        refreshPins().catch(() => {
            setPins([]);
        });
    }, [contextId, refreshPins]);

    useEffect(() => {
        if (!activeThreadParent) {
            return;
        }

        const latestParent = messages.find(
            (message) => message.$id === activeThreadParent.$id,
        );
        if (!latestParent) {
            return;
        }

        setActiveThreadParent(latestParent);
    }, [activeThreadParent, messages]);

    useEffect(() => {
        if (!activeThreadParent) {
            return;
        }

        markThreadRead(
            activeThreadParent.$id,
            activeThreadParent.lastThreadReplyAt,
        );
    }, [activeThreadParent, markThreadRead]);

    const togglePin = useCallback(
        async (message: TMessage) => {
            const wasPinned = pins.some(
                (item) => item.message.$id === message.$id,
            );
            const previousPins = pins;
            const previousActiveThreadParent = activeThreadParent;
            const previousThreadMessages = threadMessages;
            const previousMessages = messages;
            const pinnedAt = new Date().toISOString();

            if (contextId) {
                const optimisticPin = createOptimisticPinItem({
                    contextId,
                    contextType: pinContextType,
                    currentUserId,
                    message,
                    pinnedAt,
                });

                setPins((currentValue) =>
                    wasPinned
                        ? currentValue.filter(
                              (item) => item.message.$id !== message.$id,
                          )
                        : sortPinsByPinnedAt([...currentValue, optimisticPin]),
                );
            }

            const pinState = {
                isPinned: !wasPinned,
                pinnedAt: wasPinned ? undefined : pinnedAt,
                pinnedBy: wasPinned ? undefined : (currentUserId ?? undefined),
            };

            setActiveThreadParent((currentValue) => {
                if (!currentValue || currentValue.$id !== message.$id) {
                    return currentValue;
                }

                return updatePinnedState(currentValue, pinState);
            });
            setThreadMessages((currentValue) =>
                updatePinnedStateInCollection(
                    currentValue,
                    message.$id,
                    pinState,
                ),
            );
            setMessages((currentValue) =>
                updatePinnedStateInCollection(
                    currentValue,
                    message.$id,
                    pinState,
                ),
            );

            try {
                if (wasPinned) {
                    await unpinMessage(message.$id);
                } else {
                    await pinMessage(message.$id);
                }
                await refreshPins().catch(() => undefined);
            } catch (error) {
                setPins(previousPins);
                setActiveThreadParent(previousActiveThreadParent);
                setThreadMessages(previousThreadMessages);
                setMessages(previousMessages);
                toast.error(
                    error instanceof Error
                        ? error.message
                        : pinActionErrorMessage,
                );
            }
        },
        [
            activeThreadParent,
            contextId,
            currentUserId,
            messages,
            pinActionErrorMessage,
            pinContextType,
            pinMessage,
            pins,
            refreshPins,
            setMessages,
            threadMessages,
            unpinMessage,
        ],
    );

    const openThread = useCallback(
        async (parent: TMessage) => {
            setActiveThreadParent(parent);
            setThreadLoading(true);
            try {
                const items = await listThreadMessages(parent.$id);
                setThreadMessages(items);
                markThreadRead(
                    parent.$id,
                    getLatestThreadActivityAt({
                        parent,
                        replies: items,
                    }),
                );
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : threadLoadErrorMessage,
                );
                setThreadMessages([]);
            } finally {
                setThreadLoading(false);
            }
        },
        [listThreadMessages, markThreadRead, threadLoadErrorMessage],
    );

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

            const previousThreadMessages = threadMessages;
            const previousActiveThreadParent = activeThreadParent;
            const previousMessages = messages;
            const optimisticCreatedAt = new Date().toISOString();
            const optimisticReply = buildOptimisticThreadReply({
                createdAt: optimisticCreatedAt,
                currentUserId,
                parentMessage: activeThreadParent,
                tempId: `optimistic-thread-${activeThreadParent.$id}-${Date.now()}`,
                text: value,
            });

            setThreadReplySending(true);
            setThreadMessages((currentValue) =>
                appendThreadReply(currentValue, optimisticReply),
            );
            markThreadRead(activeThreadParent.$id, optimisticCreatedAt);
            setActiveThreadParent((currentValue) => {
                if (!currentValue) {
                    return currentValue;
                }

                return updateThreadParent(
                    currentValue,
                    currentUserId,
                    optimisticCreatedAt,
                );
            });
            setMessages((currentValue) =>
                currentValue.map((message) => {
                    if (message.$id !== activeThreadParent.$id) {
                        return message;
                    }

                    return updateThreadParent(
                        message,
                        currentUserId,
                        optimisticCreatedAt,
                    );
                }),
            );

            try {
                const reply = await createThreadReply(activeThreadParent.$id, {
                    text: value,
                });

                setThreadMessages((currentValue) =>
                    replaceThreadReply(
                        currentValue,
                        optimisticReply.$id,
                        reply,
                    ),
                );
                markThreadRead(activeThreadParent.$id, reply.$createdAt);
                setActiveThreadParent((currentValue) => {
                    if (!currentValue) {
                        return currentValue;
                    }

                    return reconcileThreadParent(
                        currentValue,
                        reply.$createdAt,
                    );
                });
                setMessages((currentValue) =>
                    currentValue.map((message) => {
                        if (message.$id !== activeThreadParent.$id) {
                            return message;
                        }

                        return reconcileThreadParent(message, reply.$createdAt);
                    }),
                );
            } catch (error) {
                setThreadMessages(previousThreadMessages);
                setActiveThreadParent(previousActiveThreadParent);
                setMessages(previousMessages);
                toast.error(
                    error instanceof Error
                        ? error.message
                        : threadReplyErrorMessage,
                );
            } finally {
                setThreadReplySending(false);
            }
        },
        [
            activeThreadParent,
            buildOptimisticThreadReply,
            createThreadReply,
            currentUserId,
            markThreadRead,
            messages,
            setMessages,
            threadMessages,
            threadReplyErrorMessage,
        ],
    );

    return {
        activeThreadParent,
        closeThread,
        openThread,
        pins,
        refreshPins,
        sendThreadReply,
        isThreadUnread,
        threadLoading,
        threadMessages,
        threadReadByMessageId,
        threadReplySending,
        togglePin,
    };
}
