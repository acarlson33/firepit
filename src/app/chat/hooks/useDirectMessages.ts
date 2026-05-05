"use client";

import { Channel, Query } from "appwrite";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { adaptDirectMessages } from "@/lib/chat-surface";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
    listDirectMessages,
    sendDirectMessage,
    editDirectMessage,
    deleteDirectMessage,
    type DirectMessageEncryptionPayload,
} from "@/lib/appwrite-dms-client";
import type {
    DirectMessage,
    FileAttachment,
    RelationshipStatus,
} from "@/lib/types";
import { parseReactions } from "@/lib/reactions-utils";
import { toggleReaction as toggleReactionRequest } from "@/lib/reactions-client";
import { resolveMessageImageUrl } from "@/lib/message-image-url";
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
import { listThreadReads, persistThreadReads } from "@/lib/thread-read-client";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";
import {
    getSharedRealtime,
    isTransientRealtimeSubscribeError,
    trackSubscription,
} from "@/lib/realtime-pool";
import {
    decryptMessageTextIfNeeded,
    encryptDmText,
    ensurePublishedDmEncryptionKey,
} from "../../../lib/dm-encryption";
import { useThreadPinState } from "./useThreadPinState";

const env = getEnvConfig();
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const TYPING_COLLECTION_ID = env.collections.typing || undefined;
const MAX_MESSAGE_REALTIME_RETRIES = 5;

type UseDirectMessagesProps = {
    conversationId: string | null;
    userId: string | null;
    receiverId?: string;
    userName?: string | null;
};

type DirectMessageReaction = NonNullable<DirectMessage["reactions"]>[number];

function applyOptimisticReactionUpdate(params: {
    emoji: string;
    isAdding: boolean;
    reactions: DirectMessage["reactions"];
    userId: string;
}): DirectMessageReaction[] {
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

type TypingPayload = {
    $id: string;
    userId: string;
    userName?: string;
    channelId: string;
    updatedAt: string;
};

function parseTypingPayload(payload: unknown): TypingPayload | null {
    if (!isRecord(payload)) {
        return null;
    }

    const id = payload.$id;
    const userId = payload.userId;
    const channelId = payload.channelId;
    const updatedAt = payload.$updatedAt ?? payload.updatedAt;

    if (
        typeof id !== "string" ||
        typeof userId !== "string" ||
        typeof channelId !== "string" ||
        typeof updatedAt !== "string"
    ) {
        return null;
    }

    return {
        $id: id,
        userId,
        userName:
            typeof payload.userName === "string" ? payload.userName : undefined,
        channelId,
        updatedAt,
    };
}

function parseFileAttachment(value: unknown): FileAttachment | null {
    if (!isRecord(value)) {
        return null;
    }

    if (
        typeof value.fileId !== "string" ||
        typeof value.fileName !== "string" ||
        typeof value.fileType !== "string" ||
        typeof value.fileUrl !== "string" ||
        typeof value.fileSize !== "number"
    ) {
        return null;
    }

    return {
        fileId: value.fileId,
        fileName: value.fileName,
        fileType: value.fileType,
        fileUrl: value.fileUrl,
        fileSize: value.fileSize,
        thumbnailUrl:
            typeof value.thumbnailUrl === "string"
                ? value.thumbnailUrl
                : undefined,
    };
}

function parseMessagePayload(payload: unknown): DirectMessage | null {
    if (!isRecord(payload)) {
        return null;
    }

    if (
        typeof payload.$id !== "string" ||
        typeof payload.conversationId !== "string" ||
        typeof payload.senderId !== "string" ||
        typeof payload.$createdAt !== "string"
    ) {
        return null;
    }

    if (payload.text !== undefined && typeof payload.text !== "string") {
        return null;
    }

    if (
        payload.receiverId !== undefined &&
        typeof payload.receiverId !== "string"
    ) {
        return null;
    }

    if (
        payload.threadId !== undefined &&
        typeof payload.threadId !== "string"
    ) {
        return null;
    }

    const rawReactions = payload.reactions;
    const serializedReactions =
        typeof rawReactions === "string"
            ? rawReactions
            : Array.isArray(rawReactions)
              ? JSON.stringify(rawReactions)
              : undefined;

    const mentions = Array.isArray(payload.mentions)
        ? payload.mentions.filter(
              (mention): mention is string => typeof mention === "string",
          )
        : undefined;
    const threadParticipants = Array.isArray(payload.threadParticipants)
        ? payload.threadParticipants.filter(
              (participant): participant is string =>
                  typeof participant === "string",
          )
        : undefined;
    const attachments = Array.isArray(payload.attachments)
        ? payload.attachments
              .map(parseFileAttachment)
              .filter((attachment): attachment is FileAttachment =>
                  Boolean(attachment),
              )
        : undefined;
    const permissions = Array.isArray(payload.$permissions)
        ? payload.$permissions.filter(
              (permission): permission is string =>
                  typeof permission === "string",
          )
        : undefined;
    const imageFileId =
        typeof payload.imageFileId === "string"
            ? payload.imageFileId
            : undefined;
    const replyTo = isRecord(payload.replyTo)
        ? {
              text:
                  typeof payload.replyTo.text === "string"
                      ? payload.replyTo.text
                      : "",
              senderDisplayName:
                  typeof payload.replyTo.senderDisplayName === "string"
                      ? payload.replyTo.senderDisplayName
                      : undefined,
          }
        : undefined;
    const encryptedText =
        typeof payload.encryptedText === "string"
            ? payload.encryptedText
            : undefined;
    const encryptionNonce =
        typeof payload.encryptionNonce === "string"
            ? payload.encryptionNonce
            : undefined;
    const encryptionVersion =
        typeof payload.encryptionVersion === "string"
            ? payload.encryptionVersion
            : undefined;
    const encryptionSenderPublicKey =
        typeof payload.encryptionSenderPublicKey === "string"
            ? payload.encryptionSenderPublicKey
            : undefined;
    const isEncrypted =
        payload.isEncrypted === true ||
        (typeof encryptedText === "string" && encryptedText.length > 0);

    return {
        $id: payload.$id,
        $permissions: permissions,
        conversationId: payload.conversationId,
        senderId: payload.senderId,
        $createdAt: payload.$createdAt,
        text: typeof payload.text === "string" ? payload.text : "",
        isEncrypted,
        encryptedText,
        encryptionNonce,
        encryptionVersion,
        encryptionSenderPublicKey,
        receiverId:
            typeof payload.receiverId === "string"
                ? payload.receiverId
                : undefined,
        imageFileId,
        imageUrl: resolveMessageImageUrl({
            imageFileId,
            imageUrl: payload.imageUrl,
        }),
        editedAt:
            typeof payload.editedAt === "string" ? payload.editedAt : undefined,
        removedAt:
            typeof payload.removedAt === "string"
                ? payload.removedAt
                : undefined,
        removedBy:
            typeof payload.removedBy === "string"
                ? payload.removedBy
                : undefined,
        replyToId:
            typeof payload.replyToId === "string"
                ? payload.replyToId
                : undefined,
        replyTo,
        threadId:
            typeof payload.threadId === "string" ? payload.threadId : undefined,
        threadMessageCount:
            typeof payload.threadMessageCount === "number"
                ? payload.threadMessageCount
                : undefined,
        threadParticipants,
        lastThreadReplyAt:
            typeof payload.lastThreadReplyAt === "string"
                ? payload.lastThreadReplyAt
                : undefined,
        mentions,
        senderDisplayName:
            typeof payload.senderDisplayName === "string"
                ? payload.senderDisplayName
                : undefined,
        senderAvatarUrl:
            typeof payload.senderAvatarUrl === "string"
                ? payload.senderAvatarUrl
                : undefined,
        senderAvatarFramePreset:
            typeof payload.senderAvatarFramePreset === "string"
                ? payload.senderAvatarFramePreset
                : undefined,
        senderAvatarFrameUrl:
            typeof payload.senderAvatarFrameUrl === "string"
                ? payload.senderAvatarFrameUrl
                : undefined,
        senderPronouns:
            typeof payload.senderPronouns === "string"
                ? payload.senderPronouns
                : undefined,
        attachments,
        reactions: parseReactions(serializedReactions),
    };
}

function withReplyContext(
    message: DirectMessage,
    messages: DirectMessage[],
    existingMessage?: DirectMessage,
): DirectMessage {
    const replyToId = message.replyToId ?? existingMessage?.replyToId;
    const existingReply = existingMessage?.replyTo;

    if (!replyToId) {
        return message.replyTo || existingReply
            ? {
                  ...message,
                  replyTo: message.replyTo ?? existingReply,
              }
            : message;
    }

    if (message.replyTo) {
        return message;
    }

    const parentMessage = messages.find((candidate) => candidate.$id === replyToId);
    if (parentMessage) {
        return {
            ...message,
            replyTo: {
                text: parentMessage.text,
                senderDisplayName: parentMessage.senderDisplayName,
            },
            replyToId,
        };
    }

    if (existingReply) {
        return {
            ...message,
            replyTo: existingReply,
            replyToId,
        };
    }

    return {
        ...message,
        replyToId,
    };
}

function isTopLevelMessage(message: { threadId?: string }) {
    return !message.threadId;
}

function mergeTopLevelMessages(
    existingMessages: DirectMessage[],
    incomingMessages: DirectMessage[],
): DirectMessage[] {
    if (existingMessages.length === 0) {
        return incomingMessages;
    }

    const mergedById = new Map<string, DirectMessage>();
    for (const message of incomingMessages) {
        mergedById.set(message.$id, message);
    }

    for (const existingMessage of existingMessages) {
        const incomingMessage = mergedById.get(existingMessage.$id);
        if (incomingMessage) {
            mergedById.set(
                existingMessage.$id,
                withReplyContext(
                    {
                        ...existingMessage,
                        ...incomingMessage,
                        attachments:
                            incomingMessage.attachments ??
                            existingMessage.attachments,
                        replyTo:
                            incomingMessage.replyTo ?? existingMessage.replyTo,
                        replyToId:
                            incomingMessage.replyToId ??
                            existingMessage.replyToId,
                        senderAvatarFramePreset:
                            incomingMessage.senderAvatarFramePreset ??
                            existingMessage.senderAvatarFramePreset,
                        senderAvatarFrameUrl:
                            incomingMessage.senderAvatarFrameUrl ??
                            existingMessage.senderAvatarFrameUrl,
                        senderAvatarUrl:
                            incomingMessage.senderAvatarUrl ??
                            existingMessage.senderAvatarUrl,
                        senderDisplayName:
                            incomingMessage.senderDisplayName ??
                            existingMessage.senderDisplayName,
                        senderPronouns:
                            incomingMessage.senderPronouns ??
                            existingMessage.senderPronouns,
                    },
                    incomingMessages,
                    existingMessage,
                ),
            );
            continue;
        }

        // Keep local or realtime arrivals that are missing from fetched history.
        mergedById.set(existingMessage.$id, existingMessage);
    }

    return Array.from(mergedById.values()).sort((a, b) =>
        a.$createdAt.localeCompare(b.$createdAt),
    );
}

function normalizeRealtimeEvents(events: unknown): string[] {
    if (!Array.isArray(events)) {
        return [];
    }

    return events.filter((event): event is string => typeof event === "string");
}

export function useDirectMessages({
    conversationId,
    userId,
    receiverId,
    userName,
}: UseDirectMessagesProps) {
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [oldestCursor, setOldestCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [readOnly, setReadOnly] = useState(false);
    const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);
    const [relationship, setRelationship] = useState<RelationshipStatus | null>(
        null,
    );
    const [dmEncryptionSelfEnabled, setDmEncryptionSelfEnabled] =
        useState(false);
    const [dmEncryptionPeerEnabled, setDmEncryptionPeerEnabled] =
        useState(false);
    const [dmEncryptionPeerPublicKey, setDmEncryptionPeerPublicKey] =
        useState<string | null>(null);
    const dmEncryptionPeerPublicKeyRef = useRef<string | null>(null);
    const dmEncryptionMutualEnabled =
        dmEncryptionSelfEnabled && dmEncryptionPeerEnabled;
    const [messageRealtimeRetryNonce, setMessageRealtimeRetryNonce] =
        useState(0);
    const [sending, setSending] = useState(false);
    const [typingUsers, setTypingUsers] = useState<
        Record<string, { userId: string; userName?: string; updatedAt: string }>
    >({});
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastTypingSentState = useRef<boolean>(false);
    const lastTypingSentAt = useRef<number>(0);
    const currentConversationIdRef = useRef<string | null>(conversationId);
    const loadRequestIdRef = useRef(0);
    const lastMessageRealtimeEventAtRef = useRef(Date.now());
    const backgroundMessageSyncInFlightRef = useRef(false);
    const userProfileCache = useRef<
        Record<
            string,
            {
                displayName?: string;
                avatarUrl?: string;
                avatarFramePreset?: string;
                avatarFrameUrl?: string;
                pronouns?: string;
            }
        >
    >({});

    const typingIdleMs = 2500;
    const typingStartDebounceMs = 400;
    const backgroundMessageSyncIntervalMs = 15_000;
    const backgroundMessageSyncGraceMs = 25_000;
    const initialPageSize = 50;
    const loadMoreSize = 50;

    const decryptMessage = useCallback(
        async (
            message: DirectMessage,
            peerPublicKeyBase64?: string | null,
        ): Promise<DirectMessage> => {
            if (!userId) {
                return message;
            }

            return decryptMessageTextIfNeeded({
                message,
                peerPublicKeyBase64:
                    peerPublicKeyBase64 ?? dmEncryptionPeerPublicKeyRef.current,
                userId,
            });
        },
        [userId],
    );

    useEffect(() => {
        dmEncryptionPeerPublicKeyRef.current = dmEncryptionPeerPublicKey;
    }, [dmEncryptionPeerPublicKey]);
    const listConversationThreadReads = useCallback(
        (currentContextId: string) =>
            listThreadReads("conversation", currentContextId),
        [],
    );
    const persistConversationThreadReads = useCallback(
        ({
            contextId: currentContextId,
            reads,
        }: {
            contextId: string;
            reads: Record<string, string>;
        }) =>
            persistThreadReads({
                contextId: currentContextId,
                contextType: "conversation",
                reads,
            }),
        [],
    );

    // Debounced batch update for typing state changes (reduces re-renders by 70-80%)
    const batchUpdateTypingUsers = useDebouncedBatchUpdate<{
        userId: string;
        userName?: string;
        updatedAt: string;
        conversationId: string;
        action: "add" | "remove";
    }>((updates) => {
        const activeConversationId = currentConversationIdRef.current;

        setTypingUsers((prev) => {
            const updated = { ...prev };
            for (const update of updates) {
                if (
                    !activeConversationId ||
                    update.conversationId !== activeConversationId
                ) {
                    continue;
                }

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
        const requestId = ++loadRequestIdRef.current;

        if (!conversationId || !DIRECT_MESSAGES_COLLECTION) {
            setMessages([]);
            setOldestCursor(null);
            setHasMore(false);
            setReadOnly(false);
            setReadOnlyReason(null);
            setRelationship(null);
            setDmEncryptionSelfEnabled(false);
            setDmEncryptionPeerEnabled(false);
            setDmEncryptionPeerPublicKey(null);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            setMessages([]);
            setOldestCursor(null);
            setHasMore(false);
            setReadOnly(false);
            setReadOnlyReason(null);
            setRelationship(null);
            setDmEncryptionSelfEnabled(false);
            setDmEncryptionPeerEnabled(false);
            setDmEncryptionPeerPublicKey(null);

            // Optimized: Batch query all messages at once
            // User profiles are fetched in batches (5 at a time) to reduce API calls
            // Images are already included in the response with URLs
            const result = await listDirectMessages(
                conversationId,
                initialPageSize,
            );

            const peerPublicKeyBase64 =
                result.dmEncryptionPeerPublicKey ?? null;

            const decryptedItems = await Promise.all(
                result.items.map((message) =>
                    decryptMessage(message, peerPublicKeyBase64),
                ),
            );

            if (requestId !== loadRequestIdRef.current) {
                return;
            }

            // Reverse to show oldest first
            const orderedItems = decryptedItems.reverse();
            const topLevelItems = orderedItems.filter(isTopLevelMessage);
            setMessages((prev) => mergeTopLevelMessages(prev, topLevelItems));
            setOldestCursor(result.nextCursor ?? null);
            setHasMore(Boolean(result.nextCursor));
            setReadOnly(result.readOnly);
            setReadOnlyReason(result.readOnlyReason ?? null);
            setRelationship(result.relationship ?? null);
            setDmEncryptionSelfEnabled(Boolean(result.dmEncryptionSelfEnabled));
            setDmEncryptionPeerEnabled(Boolean(result.dmEncryptionPeerEnabled));
            setDmEncryptionPeerPublicKey(result.dmEncryptionPeerPublicKey ?? null);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to load messages",
            );
        } finally {
            if (requestId === loadRequestIdRef.current) {
                setLoading(false);
            }
        }
    }, [conversationId, decryptMessage, initialPageSize]);

    const loadOlder = useCallback(async () => {
        if (!conversationId || !oldestCursor) {
            return;
        }

        try {
            const activeConversationId = conversationId;
            const result = await listDirectMessages(
                activeConversationId,
                loadMoreSize,
                oldestCursor,
            );
            if (currentConversationIdRef.current !== activeConversationId) {
                return;
            }
            const peerPublicKeyBase64 =
                result.dmEncryptionPeerPublicKey ?? null;
            const decryptedItems = await Promise.all(
                result.items.map((message) =>
                    decryptMessage(message, peerPublicKeyBase64),
                ),
            );
            const olderItems = decryptedItems
                .reverse()
                .filter(isTopLevelMessage);

            setMessages((currentValue) => [...olderItems, ...currentValue]);
            setOldestCursor(result.nextCursor ?? null);
            setHasMore(Boolean(result.nextCursor));
            setDmEncryptionSelfEnabled(Boolean(result.dmEncryptionSelfEnabled));
            setDmEncryptionPeerEnabled(Boolean(result.dmEncryptionPeerEnabled));
            setDmEncryptionPeerPublicKey(result.dmEncryptionPeerPublicKey ?? null);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load older messages",
            );
        }
    }, [conversationId, decryptMessage, oldestCursor]);

    useEffect(() => {
        currentConversationIdRef.current = conversationId;
        setMessageRealtimeRetryNonce(0);
    }, [conversationId, userId]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        if (!userId || !dmEncryptionSelfEnabled) {
            return;
        }

        const publishKey = async () => {
            await ensurePublishedDmEncryptionKey(userId);
        };

        publishKey().catch((error) => {
            logger.warn("Failed to publish DM encryption key", {
                error: error instanceof Error ? error.message : String(error),
                userId,
            });
        });
    }, [dmEncryptionSelfEnabled, userId]);

    // Safety net: pull latest DM history occasionally when realtime appears stale.
    useEffect(() => {
        if (!conversationId || !userId || !DIRECT_MESSAGES_COLLECTION) {
            return;
        }

        let cancelled = false;

        const syncMissedMessages = async () => {
            const activeConversationId = currentConversationIdRef.current;
            if (!activeConversationId || activeConversationId !== conversationId) {
                return;
            }

            if (backgroundMessageSyncInFlightRef.current) {
                return;
            }

            const realtimeAgeMs =
                Date.now() - lastMessageRealtimeEventAtRef.current;
            if (realtimeAgeMs < backgroundMessageSyncGraceMs) {
                return;
            }

            backgroundMessageSyncInFlightRef.current = true;

            try {
                const result = await listDirectMessages(
                    activeConversationId,
                    initialPageSize,
                );

                const peerPublicKeyBase64 =
                    result.dmEncryptionPeerPublicKey ?? null;

                if (cancelled) {
                    return;
                }

                if (currentConversationIdRef.current !== activeConversationId) {
                    return;
                }

                const decryptedItems = await Promise.all(
                    result.items.map((message) =>
                        decryptMessage(message, peerPublicKeyBase64),
                    ),
                );

                const topLevelItems = decryptedItems
                    .reverse()
                    .filter(isTopLevelMessage);

                if (topLevelItems.length > 0) {
                    setMessages((prev) =>
                        mergeTopLevelMessages(prev, topLevelItems),
                    );
                }

                setOldestCursor(result.nextCursor ?? null);
                setHasMore(Boolean(result.nextCursor));
                setReadOnly(result.readOnly);
                setReadOnlyReason(result.readOnlyReason ?? null);
                setRelationship(result.relationship ?? null);
                setDmEncryptionSelfEnabled(Boolean(result.dmEncryptionSelfEnabled));
                setDmEncryptionPeerEnabled(Boolean(result.dmEncryptionPeerEnabled));
                setDmEncryptionPeerPublicKey(
                    result.dmEncryptionPeerPublicKey ?? null,
                );
            } catch (syncError) {
                logger.warn("Background DM sync failed", {
                    conversationId: activeConversationId,
                    error:
                        syncError instanceof Error
                            ? syncError.message
                            : String(syncError),
                });
            } finally {
                backgroundMessageSyncInFlightRef.current = false;
            }
        };

        const interval = setInterval(() => {
            void syncMissedMessages();
        }, backgroundMessageSyncIntervalMs);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [conversationId, decryptMessage, userId, initialPageSize]);

    const {
        activeThreadParent,
        closeThread,
        isThreadUnread,
        openThread,
        pins: conversationPins,
        refreshPins,
        sendThreadReply,
        threadLoading,
        threadMessages,
        threadReadByMessageId,
        threadReplySending,
        togglePin,
    } = useThreadPinState<DirectMessage>({
        buildOptimisticThreadReply: ({
            createdAt,
            currentUserId,
            parentMessage,
            tempId,
            text,
        }) => ({
            $createdAt: createdAt,
            $id: tempId,
            conversationId: parentMessage.conversationId,
            receiverId: parentMessage.receiverId,
            senderDisplayName: userName ?? undefined,
            senderId: currentUserId ?? "unknown",
            text,
            threadId: parentMessage.threadId ?? parentMessage.$id,
        }),
        contextId: conversationId,
        currentUserId: userId,
        createThreadReply: createDMThreadReply,
        listPins: listConversationPins,
        listThreadReads: listConversationThreadReads,
        listThreadMessages: listDMThreadMessages,
        messages,
        pinContextType: "conversation",
        pinMessage: pinDMMessage,
        persistThreadReads: persistConversationThreadReads,
        setMessages,
        unpinMessage: unpinDMMessage,
    });

    // Real-time subscription
    useEffect(() => {
        if (!conversationId || !userId || !DIRECT_MESSAGES_COLLECTION) {
            return;
        }

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;
        let retryTimeout: NodeJS.Timeout | null = null;
        const messageChannel = Channel.database(env.databaseId)
            .collection(DIRECT_MESSAGES_COLLECTION)
            .document();
        const messageChannelKey = messageChannel.toString();

        void (async () => {
            if (cancelled) {
                return;
            }

            let subscription: { close: () => Promise<void> } | undefined;
            let untrack: (() => void) | undefined;

            try {
                const realtime = getSharedRealtime();
                subscription = await realtime.subscribe(
                    messageChannel,
                    (response) => {
                        (async () => {
                            let resolvedMessageId: string | undefined;

                            try {
                                const events = normalizeRealtimeEvents(
                                    response.events,
                                );
                                const messageData = parseMessagePayload(
                                    response.payload,
                                );

                                if (!messageData) {
                                    return;
                                }

                                resolvedMessageId = messageData.$id;

                                if (
                                    !messageData.conversationId ||
                                    messageData.conversationId !==
                                        currentConversationIdRef.current
                                ) {
                                    return;
                                }

                                if (!isTopLevelMessage(messageData)) {
                                    return;
                                }

                                const resolvedMessage = await decryptMessage(
                                    messageData,
                                );
                                resolvedMessageId = resolvedMessage.$id;

                                // Handle different event types to avoid full reload
                                if (events.some((e) => e.endsWith(".create"))) {
                                    lastMessageRealtimeEventAtRef.current =
                                        Date.now();
                                    setMessages((prev) => {
                                        if (
                                            prev.some(
                                                (m) =>
                                                    m.$id ===
                                                    resolvedMessage.$id,
                                            )
                                        ) {
                                            return prev.map((message) =>
                                                message.$id ===
                                                resolvedMessage.$id
                                                    ? withReplyContext(
                                                          {
                                                              ...message,
                                                              ...resolvedMessage,
                                                              attachments:
                                                                  resolvedMessage.attachments ??
                                                                  message.attachments,
                                                              replyTo:
                                                                  resolvedMessage.replyTo ??
                                                                  message.replyTo,
                                                              replyToId:
                                                                  resolvedMessage.replyToId ??
                                                                  message.replyToId,
                                                              senderAvatarFramePreset:
                                                                  resolvedMessage.senderAvatarFramePreset ??
                                                                  message.senderAvatarFramePreset,
                                                              senderAvatarFrameUrl:
                                                                  resolvedMessage.senderAvatarFrameUrl ??
                                                                  message.senderAvatarFrameUrl,
                                                              senderAvatarUrl:
                                                                  resolvedMessage.senderAvatarUrl ??
                                                                  message.senderAvatarUrl,
                                                              senderDisplayName:
                                                                  resolvedMessage.senderDisplayName ??
                                                                  message.senderDisplayName,
                                                              senderPronouns:
                                                                  resolvedMessage.senderPronouns ??
                                                                  message.senderPronouns,
                                                          },
                                                          prev,
                                                          message,
                                                      )
                                                    : message,
                                            );
                                        }
                                        return [
                                            ...prev,
                                            withReplyContext(
                                                resolvedMessage,
                                                prev,
                                            ),
                                        ].sort((a, b) =>
                                            a.$createdAt.localeCompare(
                                                b.$createdAt,
                                            ),
                                        );
                                    });
                                } else if (
                                    events.some((e) => e.endsWith(".update"))
                                ) {
                                    lastMessageRealtimeEventAtRef.current =
                                        Date.now();
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.$id === resolvedMessage.$id
                                                ? withReplyContext(
                                                      {
                                                          ...m,
                                                          ...resolvedMessage,
                                                          attachments:
                                                              resolvedMessage.attachments ??
                                                              m.attachments,
                                                          replyTo:
                                                              resolvedMessage.replyTo ??
                                                              m.replyTo,
                                                          replyToId:
                                                              resolvedMessage.replyToId ??
                                                              m.replyToId,
                                                          senderAvatarFramePreset:
                                                              resolvedMessage.senderAvatarFramePreset ??
                                                              m.senderAvatarFramePreset,
                                                          senderAvatarFrameUrl:
                                                              resolvedMessage.senderAvatarFrameUrl ??
                                                              m.senderAvatarFrameUrl,
                                                          senderAvatarUrl:
                                                              resolvedMessage.senderAvatarUrl ??
                                                              m.senderAvatarUrl,
                                                          senderDisplayName:
                                                              resolvedMessage.senderDisplayName ??
                                                              m.senderDisplayName,
                                                          senderPronouns:
                                                              resolvedMessage.senderPronouns ??
                                                              m.senderPronouns,
                                                      },
                                                      prev,
                                                      m,
                                                  )
                                                : m,
                                        ),
                                    );
                                } else if (
                                    events.some((e) => e.endsWith(".delete"))
                                ) {
                                    lastMessageRealtimeEventAtRef.current =
                                        Date.now();
                                    setMessages((prev) =>
                                        prev.filter(
                                            (m) => m.$id !== resolvedMessage.$id,
                                        ),
                                    );
                                }
                            } catch (error) {
                                logger.error(
                                    "Direct message realtime event handling failed",
                                    error instanceof Error
                                        ? error
                                        : new Error(String(error)),
                                    {
                                        conversationId:
                                            currentConversationIdRef.current,
                                        messageId: resolvedMessageId,
                                    },
                                );
                            }
                        })().catch((error) => {
                            logger.error(
                                "Unhandled direct message realtime event rejection",
                                error instanceof Error
                                    ? error
                                    : new Error(String(error)),
                                {
                                    conversationId:
                                        currentConversationIdRef.current,
                                },
                            );
                        });
                    },
                    [Query.equal("conversationId", conversationId)],
                );

                if (cancelled) {
                    await closeSubscriptionSafely(subscription);
                    return;
                }

                untrack = trackSubscription(messageChannelKey);
                cleanupFn = () => {
                    untrack?.();
                    void closeSubscriptionSafely(subscription);
                };
            } catch (error) {
                untrack?.();
                await closeSubscriptionSafely(subscription);
                if (!cancelled) {
                    const isTransient =
                        isTransientRealtimeSubscribeError(error);
                    const retryDelayMs = isTransient ? 1200 : 4000;

                    if (messageRealtimeRetryNonce >= MAX_MESSAGE_REALTIME_RETRIES) {
                        logger.error(
                            "Direct message realtime subscription max retries reached",
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                            {
                                conversationId: currentConversationIdRef.current,
                                retryDelayMs,
                                attempts: messageRealtimeRetryNonce,
                            },
                        );
                        return;
                    }

                    if (isTransient) {
                        logger.warn(
                            "Direct message realtime subscription interrupted during connection setup",
                            {
                                conversationId:
                                    currentConversationIdRef.current,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                retryDelayMs,
                            },
                        );
                    } else {
                        logger.error(
                            "Direct message realtime subscription failed:",
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                            {
                                conversationId:
                                    currentConversationIdRef.current,
                                retryDelayMs,
                            },
                        );
                    }

                    retryTimeout = setTimeout(() => {
                        setMessageRealtimeRetryNonce((currentValue) =>
                            currentValue + 1,
                        );
                    }, retryDelayMs);
                }
            }
        })();

        return () => {
            cancelled = true;
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
            cleanupFn?.();
        };
    }, [conversationId, decryptMessage, userId, messageRealtimeRetryNonce]);

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

            if (readOnly) {
                toast.error(
                    readOnlyReason ||
                        "This conversation is read-only right now",
                );
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
                const plainText = text.trim() || "";
                let encryptionPayload: DirectMessageEncryptionPayload | undefined;
                const encryptionRequired =
                    plainText.length > 0 &&
                    dmEncryptionMutualEnabled &&
                    Boolean(dmEncryptionPeerPublicKey);

                if (encryptionRequired) {
                    if (!dmEncryptionPeerPublicKey) {
                        toast.error(
                            "Encryption required but peer public key is unavailable",
                        );
                        logger.warn(
                            "DM encryption required but peer key is missing",
                            {
                                conversationId,
                                userId,
                            },
                        );
                        return;
                    }

                    try {
                        const senderKeyPair =
                            await ensurePublishedDmEncryptionKey(userId);
                        encryptionPayload = await encryptDmText({
                            recipientPublicKeyBase64:
                                dmEncryptionPeerPublicKey,
                            senderKeyPair,
                            text: plainText,
                        });
                    } catch (encryptionError) {
                        toast.error("Encryption failed; message was not sent");
                        logger.warn("DM encryption failed; message not sent", {
                            conversationId,
                            error:
                                encryptionError instanceof Error
                                    ? encryptionError.message
                                    : String(encryptionError),
                            userId,
                        });
                        return;
                    }
                }

                const outboundText = encryptionPayload ? "" : plainText;

                const message = await sendDirectMessage(
                    conversationId,
                    userId,
                    receiverId,
                    outboundText,
                    imageFileId,
                    imageUrl,
                    replyToId,
                    attachments,
                    encryptionPayload,
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
                                avatarFramePreset: profile.avatarFramePreset,
                                avatarFrameUrl: profile.avatarFrameUrl,
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
                    text:
                        encryptionPayload && plainText ? plainText : message.text,
                    senderDisplayName: profile?.displayName,
                    senderAvatarUrl: profile?.avatarUrl,
                    senderAvatarFramePreset: profile?.avatarFramePreset,
                    senderAvatarFrameUrl: profile?.avatarFrameUrl,
                    senderPronouns: profile?.pronouns,
                    // Parse reactions if present, otherwise use empty array
                    reactions: message.reactions
                        ? parseReactions(message.reactions)
                        : [],
                };

                // Optimistically add the message to local state with sorting
                setMessages((prev) => {
                    const enrichedWithReplyContext = withReplyContext(
                        enrichedMessage,
                        prev,
                    );
                    // Check if message already exists to prevent duplicates
                    if (
                        prev.some(
                            (m) => m.$id === enrichedWithReplyContext.$id,
                        )
                    ) {
                        return prev.map((m) =>
                            m.$id === enrichedWithReplyContext.$id
                                ? withReplyContext(
                                      {
                                          ...m,
                                          ...enrichedWithReplyContext,
                                          attachments:
                                              enrichedWithReplyContext.attachments ??
                                              m.attachments,
                                          replyTo:
                                              enrichedWithReplyContext.replyTo ??
                                              m.replyTo,
                                          replyToId:
                                              enrichedWithReplyContext.replyToId ??
                                              m.replyToId,
                                          senderAvatarFramePreset:
                                              enrichedWithReplyContext.senderAvatarFramePreset ??
                                              m.senderAvatarFramePreset,
                                          senderAvatarFrameUrl:
                                              enrichedWithReplyContext.senderAvatarFrameUrl ??
                                              m.senderAvatarFrameUrl,
                                          senderAvatarUrl:
                                              enrichedWithReplyContext.senderAvatarUrl ??
                                              m.senderAvatarUrl,
                                          senderDisplayName:
                                              enrichedWithReplyContext.senderDisplayName ??
                                              m.senderDisplayName,
                                          senderPronouns:
                                              enrichedWithReplyContext.senderPronouns ??
                                              m.senderPronouns,
                                      },
                                      prev,
                                      m,
                                  )
                                : m,
                        );
                    }
                    // Add and sort by creation time to maintain chronological order
                    return [...prev, enrichedWithReplyContext].sort((a, b) =>
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
        [
            conversationId,
            dmEncryptionMutualEnabled,
            dmEncryptionPeerPublicKey,
            readOnly,
            readOnlyReason,
            receiverId,
            userId,
        ],
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
                setMessages((prev) =>
                    prev.filter((message) => message.$id !== messageId),
                );
            } catch (err) {
                throw new Error(
                    err instanceof Error
                        ? err.message
                        : "Failed to delete message",
                );
            }
        },
        [userId],
    );

    const toggleReaction = useCallback(
        async (messageId: string, emoji: string, isAdding: boolean) => {
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
                    true,
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

                toast.error(
                    err instanceof Error ? err.message : "Reaction failed",
                );
            }
        },
        [messages, userId],
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
            if (readOnly) {
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
        setTypingUsers({});
    }, [conversationId]);

    useEffect(() => {
        if (!conversationId || !userId || !TYPING_COLLECTION_ID) {
            return;
        }

        const databaseId = env.databaseId;

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;
        const typingChannel = Channel.database(databaseId)
            .collection(TYPING_COLLECTION_ID)
            .document();
        const typingChannelKey = typingChannel.toString();

        void (async () => {
            if (cancelled) {
                return;
            }

            let subscription: { close: () => Promise<void> } | undefined;
            let untrack: (() => void) | undefined;

            try {
                const realtime = getSharedRealtime();

                subscription = await realtime.subscribe(
                    typingChannel,
                    (response) => {
                        const events = normalizeRealtimeEvents(response.events);
                        const typing = parseTypingPayload(response.payload);

                        if (!typing) {
                            return;
                        }

                        if (
                            typing.channelId !==
                            currentConversationIdRef.current
                        ) {
                            // Shared typing subscription receives all DM typing events; guard against stale conversation switches.
                            return;
                        }

                        if (typing.userId === userId) {
                            return;
                        }

                        if (events.some((e) => e.endsWith(".delete"))) {
                            batchUpdateTypingUsers({
                                userId: typing.userId,
                                userName: typing.userName,
                                updatedAt: typing.updatedAt,
                                conversationId: typing.channelId,
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
                                conversationId: typing.channelId,
                                action: "add",
                            });
                        }
                    },
                    [Query.equal("channelId", conversationId)],
                );

                if (cancelled) {
                    await closeSubscriptionSafely(subscription);
                    return;
                }

                untrack = trackSubscription(typingChannelKey);
                cleanupFn = () => {
                    untrack?.();
                    void closeSubscriptionSafely(subscription);
                };
            } catch (error) {
                untrack?.();
                await closeSubscriptionSafely(subscription);
                if (!cancelled) {
                    logger.error(
                        "Direct message typing realtime subscription failed:",
                        error instanceof Error ? error : String(error),
                        {
                            conversationId: currentConversationIdRef.current,
                        },
                    );
                }
            }
        })();

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

    const surfaceMessages = useMemo(() => {
        const messagesById = new Map(
            messages.map((message) => [message.$id, message]),
        );

        return adaptDirectMessages(
            messages,
            conversationId
                ? {
                      kind: "dm",
                      conversationId,
                      readOnly,
                      readOnlyReason,
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
    }, [
        conversationId,
        isThreadUnread,
        messages,
        readOnly,
        readOnlyReason,
        threadReadByMessageId,
    ]);

    return {
        hasMore,
        messages,
        oldestCursor,
        surfaceMessages,
        loading,
        error,
        sending,
        send,
        edit,
        deleteMsg,
        toggleReaction,
        loadOlder,
        refresh: loadMessages,
        shouldShowLoadOlder: Boolean(
            hasMore && oldestCursor && messages.length,
        ),
        typingUsers,
        handleTypingChange,
        conversationPins,
        refreshPins,
        togglePin,
        readOnly,
        readOnlyReason,
        relationship,
        dmEncryptionSelfEnabled,
        dmEncryptionPeerEnabled,
        dmEncryptionMutualEnabled,
        dmEncryptionPeerPublicKey,
        activeThreadParent,
        threadMessages,
        threadLoading,
        threadReplySending,
        openThread,
        closeThread,
        sendThreadReply,
    };
}
