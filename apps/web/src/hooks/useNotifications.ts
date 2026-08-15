"use client";

import { Channel, Query } from "appwrite";
import { useEffect, useRef, useCallback, useState } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely, type RealtimeSubscription } from "@/lib/realtime-error-suppression";

const env = getEnvConfig();

function createRealtimeCleanup(params: {
    contextId: string;
    contextLabel: string;
    subscription: RealtimeSubscription;
    untrack?: () => void;
}) {
    return () => {
        if (typeof params.subscription === "function") {
            params.subscription();
        } else {
            closeSubscriptionSafely(params.subscription).catch((closeError) => {
                logger.warn(
                    `Failed to close ${params.contextLabel} notification realtime subscription`,
                    {
                        contextId: params.contextId,
                        error:
                            closeError instanceof Error
                                ? closeError.message
                                : String(closeError),
                    },
                );
            });
        }
        params.untrack?.();
    };
}

interface NotificationOptions {
    /** Current user's ID */
    userId: string | null;
    /** Whether the user is currently viewing the app */
    isWindowFocused?: boolean;
    /** Current channel ID (for channel messages) */
    channelId?: string | null;
    /** Current server ID (for channel messages) */
    serverId?: string | null;
    /** Current conversation ID (for DMs) */
    conversationId?: string | null;
}

type RealtimeUpdateQuery = {
    queries: ReturnType<typeof Query.equal>[];
};

type RealtimeEvent = {
    events: string[];
    payload: Record<string, unknown>;
};

/**
 * Shared realtime subscription lifecycle for notification sources. Creates the
 * channel, reuses an existing subscription via update when possible, tracks the
 * subscription, and returns a cleanup that untracks and closes it. When the
 * consumer has been cancelled mid-setup, nothing is tracked or retained.
 */
async function setupRealtimeSubscription(params: {
    collectionId: string;
    queryField: string;
    queryValue: string;
    contextLabel: string;
    subscriptionRef: { current: RealtimeSubscription | null };
    isCancelled: () => boolean;
    onEvent: (event: RealtimeEvent) => void;
}): Promise<() => void> {
    const { getSharedRealtime, trackSubscription } = await import(
        "@/lib/realtime-pool"
    );
    const realtime = getSharedRealtime();
    const messageChannel = Channel.database(env.databaseId)
        .collection(params.collectionId)
        .document();
    const messageChannelKey = messageChannel.toString();
    const filterQueries = [Query.equal(params.queryField, params.queryValue)];

    const existing = params.subscriptionRef.current;
    if (
        existing &&
        typeof (existing as { update?: unknown }).update === "function"
    ) {
        try {
            const updatable = existing as unknown as {
                update: (args: RealtimeUpdateQuery) => Promise<void>;
            };
            await updatable.update({ queries: filterQueries });
            if (params.isCancelled()) {
                // Consumer is gone; don't retain or track the updated subscription.
                return () => {};
            }
            const untrack = trackSubscription(messageChannelKey);
            return createRealtimeCleanup({
                contextId: params.queryValue,
                contextLabel: params.contextLabel,
                subscription: existing,
                untrack,
            });
        } catch {
            // fallthrough to recreate
        }
    }

    const subscription = await realtime.subscribe(
        messageChannel,
        params.onEvent,
        filterQueries,
    );
    params.subscriptionRef.current = subscription;

    if (params.isCancelled()) {
        createRealtimeCleanup({
            contextId: params.queryValue,
            contextLabel: params.contextLabel,
            subscription,
        })();
        params.subscriptionRef.current = null;
        return () => {};
    }

    const untrack = trackSubscription(messageChannelKey);
    return createRealtimeCleanup({
        contextId: params.queryValue,
        contextLabel: params.contextLabel,
        subscription,
        untrack,
    });
}

/**
 * Hook to handle notification triggers for incoming messages.
 * Subscribes to message events and triggers notifications based on user preferences.
 */
export function useNotifications({
    userId,
    isWindowFocused = true,
    channelId,
    serverId,
    conversationId,
}: NotificationOptions) {
    const channelSubscriptionRef = useRef<RealtimeSubscription | null>(null);
    const dmSubscriptionRef = useRef<RealtimeSubscription | null>(null);
    const notificationPermissionRef = useRef<NotificationPermission>("default");
    const [notificationPermission, setNotificationPermission] =
        useState<NotificationPermission>("default");
    const [isPageVisible, setIsPageVisible] = useState(() => {
        if (typeof document === "undefined") {
            return true;
        }

        return document.visibilityState !== "hidden";
    });

    // Check notification permission on mount
    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            notificationPermissionRef.current = Notification.permission;
            setNotificationPermission(Notification.permission);
        }
    }, []);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }

        const updateVisibility = () => {
            setIsPageVisible(document.visibilityState !== "hidden");
        };

        document.addEventListener("visibilitychange", updateVisibility);

        return () => {
            document.removeEventListener("visibilitychange", updateVisibility);
        };
    }, []);

    // Request notification permission
    const requestPermission = useCallback(async () => {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return "denied" as NotificationPermission;
        }

        if (Notification.permission === "granted") {
            notificationPermissionRef.current = "granted";
            setNotificationPermission("granted");
            return "granted" as NotificationPermission;
        }

        if (Notification.permission === "denied") {
            return "denied" as NotificationPermission;
        }

        const permission = await Notification.requestPermission();
        notificationPermissionRef.current = permission;
        setNotificationPermission(permission);
        return permission;
    }, []);

    // Show a desktop notification
    const showDesktopNotification = useCallback(
        (
            title: string,
            options?: {
                body?: string;
                icon?: string;
                tag?: string;
                data?: Record<string, unknown>;
            },
        ) => {
            if (notificationPermissionRef.current !== "granted") {
                return null;
            }

            // Don't show notifications if the app is focused and visible
            if (isWindowFocused && isPageVisible) {
                return null;
            }

            try {
                const notification = new Notification(title, {
                    body: options?.body,
                    icon: options?.icon ?? "/favicon/favicon-192x192.png",
                    tag: options?.tag,
                    data: options?.data,
                });

                // Auto-close after 5 seconds
                setTimeout(() => notification.close(), 5000);

                // Handle click to focus window
                notification.addEventListener("click", () => {
                    window.focus();
                    notification.close();
                });

                return notification;
            } catch {
                // Notification API might fail in some contexts
                return null;
            }
        },
        [isWindowFocused, isPageVisible],
    );

    // Play notification sound
    const playNotificationSound = useCallback(() => {
        try {
            const audio = new Audio("/sounds/notification.mp3");
            audio.volume = 0.5;
            audio.play().catch(() => {
                // Audio playback might fail if user hasn't interacted with page
            });
        } catch {
            // Audio might not be available
        }
    }, []);

    // Subscribe to channel messages for notifications
    useEffect(() => {
        if (!userId || !channelId || (isWindowFocused && isPageVisible)) {
            return;
        }

        const collectionId = env.collections.messages;
        if (!env.databaseId || !collectionId) {
            return;
        }

        let cancelled = false;
        let cleanup: (() => void) | undefined;

        const handleMessage = (event: RealtimeEvent) => {
            // Only handle create events
            if (!event.events.some((e) => e.endsWith(".create"))) {
                return;
            }

            const payload = event.payload;
            const messageChannelId = payload.channelId as
                | string
                | undefined;
            const senderId = payload.userId as string;

            // Only process messages for the current channel
            if (messageChannelId !== channelId) {
                return;
            }

            // Don't notify for own messages
            if (senderId === userId) {
                return;
            }

            // Check if we should notify this user (async but fire-and-forget)
            void (async () => {
                try {
                    const {
                        shouldNotifyUser,
                        buildNotificationPayload,
                            extractMentionedUserIds,
                        } = await import("@/lib/notification-triggers");
                        const { hasEveryoneMention } = await import("@/lib/mention-utils");

                    const messageText = payload.text as string;
                    const mentionedUserIds =
                        extractMentionedUserIds(messageText);
                    const mentionsEveryone = hasEveryoneMention(messageText);
                    const replyToAuthorId = payload.replyToAuthorId as
                        | string
                        | undefined;

                    const result = await shouldNotifyUser({
                        senderId,
                        recipientId: userId,
                        serverId: serverId ?? undefined,
                        channelId,
                        mentionedUserIds,
                        mentionsEveryone,
                        isReplyToRecipient: replyToAuthorId === userId,
                    });

                    if (result.shouldNotify) {
                        const notificationPayload =
                            buildNotificationPayload(result.type, {
                                senderName:
                                    (payload.userName as string) ??
                                    "Someone",
                                messageContent: messageText,
                                channelName: undefined, // Would need to pass this in
                                serverName: undefined, // Would need to pass this in
                                messageId: payload.$id as string,
                                channelId,
                                serverId: serverId ?? undefined,
                            });

                        if (result.showDesktop) {
                            showDesktopNotification(
                                notificationPayload.title,
                                {
                                    body: notificationPayload.body,
                                    icon: notificationPayload.icon,
                                    tag: `message-${String(payload.$id)}`,
                                    data: notificationPayload.data,
                                },
                            );
                        }

                        if (result.playSound) {
                            playNotificationSound();
                        }
                    }
                } catch (notifyError) {
                    logger.warn("Channel notification check failed", {
                        channelId,
                        error:
                            notifyError instanceof Error
                                ? notifyError.message
                                : String(notifyError),
                    });
                }
            })();
        };

        setupRealtimeSubscription({
            collectionId,
            queryField: "channelId",
            queryValue: channelId,
            contextLabel: "channel",
            subscriptionRef: channelSubscriptionRef,
            isCancelled: () => cancelled,
            onEvent: handleMessage,
        })
            .then((result) => {
                cleanup = result;
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                logger.error(
                    "Channel notification realtime setup failed",
                    error instanceof Error ? error : String(error),
                    {
                        channelId,
                        collectionId,
                        databaseId: env.databaseId,
                        serverId,
                    },
                );
            });

        return () => {
            cancelled = true;
            cleanup?.();
            channelSubscriptionRef.current = null;
        };
    }, [
        userId,
        channelId,
        isPageVisible,
        isWindowFocused,
        serverId,
        showDesktopNotification,
        playNotificationSound,
    ]);

    // Subscribe to DM messages for notifications
    useEffect(() => {
        if (!userId || !conversationId || (isWindowFocused && isPageVisible)) {
            return;
        }

        const collectionId = env.collections.directMessages;
        if (!env.databaseId || !collectionId) {
            return;
        }

        let cancelled = false;
        let cleanup: (() => void) | undefined;

        const handleMessage = (response: RealtimeEvent) => {
            const events = response.events;

            // Only handle create events
            if (!events.some((e) => e.endsWith(".create"))) {
                return;
            }

            const payload = response.payload;
            const msgConversationId = payload.conversationId as string;
            const senderId = payload.senderId as string;

            // Only process messages for the current conversation
            if (msgConversationId !== conversationId) {
                return;
            }

            // Don't notify for own messages
            if (senderId === userId) {
                return;
            }

            // Check if we should notify this user (async but fire-and-forget)
            void (async () => {
                try {
                    const {
                        shouldNotifyUser,
                        buildNotificationPayload,
                    } = await import("@/lib/notification-triggers");

                    const result = await shouldNotifyUser({
                        senderId,
                        recipientId: userId,
                        conversationId,
                    });

                    if (result.shouldNotify) {
                        const notificationPayload =
                            buildNotificationPayload(result.type, {
                                senderName:
                                    (payload.senderName as string) ??
                                    "Someone",
                                messageContent:
                                    (payload.content as string) ?? "",
                                conversationId,
                            });

                        if (result.showDesktop) {
                            showDesktopNotification(
                                notificationPayload.title,
                                {
                                    body: notificationPayload.body,
                                    icon: notificationPayload.icon,
                                    tag: `dm-${String(payload.$id)}`,
                                    data: notificationPayload.data,
                                },
                            );
                        }

                        if (result.playSound) {
                            playNotificationSound();
                        }
                    }
                } catch (notifyError) {
                    logger.warn("DM notification check failed", {
                        conversationId,
                        error:
                            notifyError instanceof Error
                                ? notifyError.message
                                : String(notifyError),
                    });
                }
            })();
        };

        setupRealtimeSubscription({
            collectionId,
            queryField: "conversationId",
            queryValue: conversationId,
            contextLabel: "DM",
            subscriptionRef: dmSubscriptionRef,
            isCancelled: () => cancelled,
            onEvent: handleMessage,
        })
            .then((result) => {
                cleanup = result;
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                logger.error(
                    "DM notification realtime setup failed",
                    error instanceof Error ? error : String(error),
                    {
                        collectionId,
                        conversationId,
                        databaseId: env.databaseId,
                    },
                );
            });

        return () => {
            cancelled = true;
            cleanup?.();
            dmSubscriptionRef.current = null;
        };
    }, [
        userId,
        conversationId,
        isPageVisible,
        isWindowFocused,
        showDesktopNotification,
        playNotificationSound,
    ]);

    return {
        requestPermission,
        showDesktopNotification,
        playNotificationSound,
        permission: notificationPermission,
    };
}
