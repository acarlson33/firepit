"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import type { PinItem, ThreadReplyPayload } from "@/lib/thread-pin-client";

type ThreadableMessage = {
    $id: string;
    $createdAt: string;
    threadMessageCount?: number;
    threadParticipants?: string[];
    lastThreadReplyAt?: string;
};

type UseThreadPinStateOptions<TMessage extends ThreadableMessage> = {
    contextId: string | null;
    currentUserId: string | null;
    createThreadReply: (
        messageId: string,
        payload: ThreadReplyPayload,
    ) => Promise<TMessage>;
    listPins: (contextId: string) => Promise<Array<PinItem<TMessage>>>;
    listThreadMessages: (messageId: string) => Promise<TMessage[]>;
    pinActionErrorMessage?: string;
    pinMessage: (messageId: string) => Promise<unknown>;
    setMessages: React.Dispatch<React.SetStateAction<TMessage[]>>;
    threadLoadErrorMessage?: string;
    threadReplyErrorMessage?: string;
    unpinMessage: (messageId: string) => Promise<void>;
};

function appendThreadReply<TMessage extends ThreadableMessage>(
    items: TMessage[],
    reply: TMessage,
) {
    return [...items, reply].sort((left, right) =>
        left.$createdAt.localeCompare(right.$createdAt),
    );
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
    contextId,
    currentUserId,
    createThreadReply,
    listPins,
    listThreadMessages,
    pinActionErrorMessage = "Pin action failed",
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

    const togglePin = useCallback(
        async (message: TMessage) => {
            try {
                const isPinned = pins.some(
                    (item) => item.message.$id === message.$id,
                );
                if (isPinned) {
                    await unpinMessage(message.$id);
                } else {
                    await pinMessage(message.$id);
                }
                await refreshPins();
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : pinActionErrorMessage,
                );
            }
        },
        [pinActionErrorMessage, pinMessage, pins, refreshPins, unpinMessage],
    );

    const openThread = useCallback(
        async (parent: TMessage) => {
            setActiveThreadParent(parent);
            setThreadLoading(true);
            try {
                const items = await listThreadMessages(parent.$id);
                setThreadMessages(items);
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
        [listThreadMessages, threadLoadErrorMessage],
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

            try {
                const reply = await createThreadReply(activeThreadParent.$id, {
                    text: value,
                });

                setThreadMessages((currentValue) =>
                    appendThreadReply(currentValue, reply),
                );
                setActiveThreadParent((currentValue) => {
                    if (!currentValue) {
                        return currentValue;
                    }

                    return updateThreadParent(
                        currentValue,
                        currentUserId,
                        reply.$createdAt,
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
                            reply.$createdAt,
                        );
                    }),
                );
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : threadReplyErrorMessage,
                );
            }
        },
        [
            activeThreadParent,
            createThreadReply,
            currentUserId,
            setMessages,
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
        threadLoading,
        threadMessages,
        togglePin,
    };
}
