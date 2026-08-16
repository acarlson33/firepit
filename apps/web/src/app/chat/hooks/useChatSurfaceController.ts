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
    onVotePoll?: (messageId: string, optionId: string) => Promise<void>;
    onClosePoll?: (messageId: string) => Promise<void>;
    onOpenThreadRaw?: (message: TRawMessage) => Promise<void>;
    onTogglePinRaw?: (message: TRawMessage) => Promise<void>;
};

export function useChatSurfaceController<TRawMessage extends { $id: string }>({
    rawMessages,
    onStartEditRaw,
    onStartReplyRaw,
    onRemove,
    onToggleReaction,
    onVotePoll,
    onClosePoll,
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

    const onVoteMessagePoll = useCallback(
        async (surfaceMessage: ChatSurfaceMessage, optionId: string) => {
            if (!onVotePoll) {
                return;
            }

            const rawMessage = getRawMessage(surfaceMessage);
            if (rawMessage) {
                await onVotePoll(rawMessage.$id, optionId);
            }
        },
        [getRawMessage, onVotePoll],
    );

    const onCloseMessagePoll = useCallback(
        async (surfaceMessage: ChatSurfaceMessage) => {
            if (!onClosePoll) {
                return;
            }

            const rawMessage = getRawMessage(surfaceMessage);
            if (rawMessage) {
                await onClosePoll(rawMessage.$id);
            }
        },
        [getRawMessage, onClosePoll],
    );

    return {
        getRawMessage,
        onStartEdit,
        onStartReply,
        onRemove,
        onToggleReaction,
        onVotePoll: onVotePoll ? onVoteMessagePoll : undefined,
        onClosePoll: onClosePoll ? onCloseMessagePoll : undefined,
        onOpenThread: onOpenThreadRaw ? onOpenThread : undefined,
        onTogglePin: onTogglePinRaw ? onTogglePin : undefined,
    };
}
