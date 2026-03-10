"use client";

import { useCallback, useMemo } from "react";

import type { ChatSurfaceMessage } from "@/lib/chat-surface";

type UseChatSurfaceControllerOptions<TRawMessage extends { $id: string }> = {
    rawMessages: TRawMessage[];
    onStartEditRaw: (message: TRawMessage) => void;
    onStartReplyRaw: (message: TRawMessage) => void;
    onRemove: (id: string) => void;
    onToggleReaction: (
        messageId: string,
        emoji: string,
        isAdding: boolean,
    ) => Promise<void>;
    onOpenThreadRaw?: (message: TRawMessage) => Promise<void>;
    onTogglePinRaw?: (message: TRawMessage) => Promise<void>;
};

export function useChatSurfaceController<TRawMessage extends { $id: string }>({
    rawMessages,
    onStartEditRaw,
    onStartReplyRaw,
    onRemove,
    onToggleReaction,
    onOpenThreadRaw,
    onTogglePinRaw,
}: UseChatSurfaceControllerOptions<TRawMessage>) {
    const rawMessagesById = useMemo(
        () => new Map(rawMessages.map((message) => [message.$id, message])),
        [rawMessages],
    );

    const getRawMessage = useCallback(
        (surfaceMessage: ChatSurfaceMessage) => {
            return rawMessagesById.get(surfaceMessage.sourceMessageId) ?? null;
        },
        [rawMessagesById],
    );

    const onStartEdit = useCallback(
        (surfaceMessage: ChatSurfaceMessage) => {
            const rawMessage = getRawMessage(surfaceMessage);
            if (rawMessage) {
                onStartEditRaw(rawMessage);
            }
        },
        [getRawMessage, onStartEditRaw],
    );

    const onStartReply = useCallback(
        (surfaceMessage: ChatSurfaceMessage) => {
            const rawMessage = getRawMessage(surfaceMessage);
            if (rawMessage) {
                onStartReplyRaw(rawMessage);
            }
        },
        [getRawMessage, onStartReplyRaw],
    );

    const onOpenThread = useCallback(
        async (surfaceMessage: ChatSurfaceMessage) => {
            if (!onOpenThreadRaw) {
                return;
            }

            const rawMessage = getRawMessage(surfaceMessage);
            if (rawMessage) {
                await onOpenThreadRaw(rawMessage);
            }
        },
        [getRawMessage, onOpenThreadRaw],
    );

    const onTogglePin = useCallback(
        async (surfaceMessage: ChatSurfaceMessage) => {
            if (!onTogglePinRaw) {
                return;
            }

            const rawMessage = getRawMessage(surfaceMessage);
            if (rawMessage) {
                await onTogglePinRaw(rawMessage);
            }
        },
        [getRawMessage, onTogglePinRaw],
    );

    return {
        getRawMessage,
        onStartEdit,
        onStartReply,
        onRemove,
        onToggleReaction,
        onOpenThread: onOpenThreadRaw ? onOpenThread : undefined,
        onTogglePin: onTogglePinRaw ? onTogglePin : undefined,
    };
}
