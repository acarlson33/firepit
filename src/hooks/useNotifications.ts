"use client";

import { useEffect, useRef, useCallback } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";

const env = getEnvConfig();

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
	const notificationPermissionRef = useRef<NotificationPermission>("default");

	// Check notification permission on mount
	useEffect(() => {
		if (typeof window !== "undefined" && "Notification" in window) {
			notificationPermissionRef.current = Notification.permission;
		}
	}, []);

	// Request notification permission
	const requestPermission = useCallback(async () => {
		if (typeof window === "undefined" || !("Notification" in window)) {
			return "denied" as NotificationPermission;
		}

		if (Notification.permission === "granted") {
			notificationPermissionRef.current = "granted";
			return "granted" as NotificationPermission;
		}

		if (Notification.permission === "denied") {
			return "denied" as NotificationPermission;
		}

		const permission = await Notification.requestPermission();
		notificationPermissionRef.current = permission;
		return permission;
	}, []);

	// Show a desktop notification
	const showDesktopNotification = useCallback(
		(title: string, options?: { body?: string; icon?: string; tag?: string; data?: Record<string, unknown> }) => {
			if (notificationPermissionRef.current !== "granted") {
				return null;
			}

			// Don't show notifications if window is focused
			if (isWindowFocused) {
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
		[isWindowFocused]
	);

	// Play notification sound
	const playNotificationSound = useCallback(() => {
		try {
			const audio = new Audio("/sounds/notification.mp3");
			audio.volume = 0.5;
			void audio.play().catch(() => {
				// Audio playback might fail if user hasn't interacted with page
			});
		} catch {
			// Audio might not be available
		}
	}, []);

	// Subscribe to channel messages for notifications
	useEffect(() => {
		if (!userId || !channelId) {
			return;
		}

		const databaseId = env.databaseId;
		const collectionId = env.collections.messages;

		if (!databaseId || !collectionId) {
			return;
		}

		let unsubscribe: (() => void) | undefined;

		import("@/lib/realtime-pool")
			.then(({ getSharedClient, trackSubscription }) => {
				const client = getSharedClient();
				const messageChannel = `databases.${databaseId}.collections.${collectionId}.documents`;

				const handleMessage = (event: { events: string[]; payload: Record<string, unknown> }) => {
					// Only handle create events
					if (!event.events.some((e) => e.endsWith(".create"))) {
						return;
					}

					const payload = event.payload;
					const messageChannelId = payload.channelId as string | undefined;
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
							const { shouldNotifyUser, buildNotificationPayload, extractMentionedUserIds } = await import(
								"@/lib/notification-triggers"
							);

							const messageText = payload.text as string;
							const mentionedUserIds = extractMentionedUserIds(messageText);
							const replyToAuthorId = payload.replyToAuthorId as string | undefined;

							const result = await shouldNotifyUser({
								senderId,
								recipientId: userId,
								serverId: serverId ?? undefined,
								channelId,
								mentionedUserIds,
								isReplyToRecipient: replyToAuthorId === userId,
							});

							if (result.shouldNotify) {
								const notificationPayload = buildNotificationPayload(result.type, {
									senderName: (payload.userName as string) ?? "Someone",
									messageContent: messageText,
									channelName: undefined, // Would need to pass this in
									serverName: undefined, // Would need to pass this in
									messageId: payload.$id as string,
									channelId,
									serverId: serverId ?? undefined,
								});

								if (result.showDesktop) {
									showDesktopNotification(notificationPayload.title, {
										body: notificationPayload.body,
										icon: notificationPayload.icon,
										tag: `message-${String(payload.$id)}`,
										data: notificationPayload.data,
										userId: null,
									});
								}

								if (result.playSound) {
									playNotificationSound();
								}
							}
						} catch {
							// Notification check failed, silently ignore
						}
					})();
				};

				unsubscribe = client.subscribe(messageChannel, handleMessage);
				trackSubscription(messageChannel);
			})
			.catch(() => {
				// Failed to set up realtime
			});

		return () => {
			unsubscribe?.();
		};
	}, [userId, channelId, serverId, showDesktopNotification, playNotificationSound]);

	// Subscribe to DM messages for notifications
	useEffect(() => {
		if (!userId || !conversationId) {
			return;
		}

		const databaseId = env.databaseId;
		const collectionId = env.collections.directMessages;

		if (!databaseId || !collectionId) {
			return;
		}

		let cleanup: (() => void) | undefined;

		import("@/lib/realtime-pool")
			.then(({ getSharedClient, trackSubscription }) => {
				const client = getSharedClient();
				const messageChannel = `databases.${databaseId}.collections.${collectionId}.documents`;

				const handleMessage = (response: { events: string[]; payload: Record<string, unknown> }) => {
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
							const { shouldNotifyUser, buildNotificationPayload } = await import(
								"@/lib/notification-triggers"
							);

							const result = await shouldNotifyUser({
								senderId,
								recipientId: userId,
								conversationId,
							});

							if (result.shouldNotify) {
								const notificationPayload = buildNotificationPayload(result.type, {
									senderName: (payload.senderName as string) ?? "Someone",
									messageContent: (payload.content as string) ?? "",
									conversationId,
								});

								if (result.showDesktop) {
									showDesktopNotification(notificationPayload.title, {
										body: notificationPayload.body,
										icon: notificationPayload.icon,
										tag: `dm-${String(payload.$id)}`,
										data: notificationPayload.data,
									});
								}

								if (result.playSound) {
									playNotificationSound();
								}
							}
						} catch {
							// Notification check failed, silently ignore
						}
					})();
				};

				const unsubscribe = client.subscribe(messageChannel, handleMessage);
				const trackCleanup = trackSubscription(messageChannel);

				// Store combined cleanup function
				cleanup = () => {
					unsubscribe?.();
					trackCleanup();
				};
			})
			.catch(() => {
				// Failed to set up realtime
			});

		return () => {
			cleanup?.();
		};
	}, [userId, conversationId, showDesktopNotification, playNotificationSound]);

	return {
		requestPermission,
		showDesktopNotification,
		playNotificationSound,
		permission: notificationPermissionRef.current,
	};
}
