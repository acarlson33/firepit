/**
 * Notification Trigger Logic
 *
 * This module provides the core logic for determining when and how to send
 * notifications to users based on their settings and the context of the event.
 */

import {
	getOrCreateNotificationSettings,
	getEffectiveNotificationLevel,
	isInQuietHours,
} from "@/lib/notification-settings";
import type { NotificationLevel, NotificationPayload } from "@/lib/types";

interface NotificationContext {
	/** The ID of the server where the event occurred (for channel messages) */
	serverId?: string;
	/** The ID of the channel where the event occurred */
	channelId?: string;
	/** The ID of the DM conversation (for direct messages) */
	conversationId?: string;
	/** The ID of the user who sent the message */
	senderId: string;
	/** The ID of the user who should potentially receive the notification */
	recipientId: string;
	/** IDs of users mentioned in the message */
	mentionedUserIds?: string[];
	/** Whether this is a reply to a message from the recipient */
	isReplyToRecipient?: boolean;
}

type NotificationEventType = "message" | "dm" | "mention" | "thread_reply";

interface NotificationResult {
	/** Whether to send the notification */
	shouldNotify: boolean;
	/** The type of notification (used for display purposes) */
	type: NotificationEventType;
	/** Reason for not sending (for debugging) */
	reason?: string;
	/** Whether to play a sound */
	playSound: boolean;
	/** Whether to show desktop notification */
	showDesktop: boolean;
	/** Whether to send push notification */
	sendPush: boolean;
}

/**
 * Determines the type of notification event based on context
 */
function determineEventType(context: NotificationContext): NotificationEventType {
	// Direct messages
	if (context.conversationId) {
		return "dm";
	}

	// Check if recipient was mentioned
	if (context.mentionedUserIds?.includes(context.recipientId)) {
		return "mention";
	}

	// Check if this is a reply to recipient's message
	if (context.isReplyToRecipient) {
		return "thread_reply";
	}

	// Regular channel message
	return "message";
}

/**
 * Check if the notification level allows this event type
 */
function isEventAllowedByLevel(
	level: NotificationLevel,
	eventType: NotificationEventType
): boolean {
	switch (level) {
		case "all":
			return true;
		case "mentions":
			// Only allow DMs, mentions, and replies
			return eventType === "dm" || eventType === "mention" || eventType === "thread_reply";
		case "nothing":
			return false;
		default:
			return false;
	}
}

/**
 * Determines if and how to notify a user about an event
 *
 * @param context - The context of the notification event
 * @returns NotificationResult indicating whether and how to notify
 */
export async function shouldNotifyUser(
	context: NotificationContext
): Promise<NotificationResult> {
	const { senderId, recipientId } = context;

	// Never notify users about their own messages
	if (senderId === recipientId) {
		return {
			shouldNotify: false,
			type: "message",
			reason: "sender_is_recipient",
			playSound: false,
			showDesktop: false,
			sendPush: false,
		};
	}

	// Get user's notification settings
	const settings = await getOrCreateNotificationSettings(recipientId);
	if (!settings) {
		return {
			shouldNotify: false,
			type: "message",
			reason: "failed_to_load_settings",
			playSound: false,
			showDesktop: false,
			sendPush: false,
		};
	}

	// Determine the event type
	const eventType = determineEventType(context);

	// Check quiet hours (suppress all notifications during quiet hours)
	if (isInQuietHours(settings)) {
		return {
			shouldNotify: false,
			type: eventType,
			reason: "quiet_hours",
			playSound: false,
			showDesktop: false,
			sendPush: false,
		};
	}

	// Get effective notification level for this context
	const level = getEffectiveNotificationLevel(settings, {
		serverId: context.serverId,
		channelId: context.channelId,
		conversationId: context.conversationId,
	});

	// Check if this event type is allowed by the notification level
	if (!isEventAllowedByLevel(level, eventType)) {
		return {
			shouldNotify: false,
			type: eventType,
			reason: `level_${String(level)}_blocks_${eventType}`,
			playSound: false,
			showDesktop: false,
			sendPush: false,
		};
	}

	// Notification should be sent
	return {
		shouldNotify: true,
		type: eventType,
		playSound: settings.notificationSound,
		showDesktop: settings.desktopNotifications,
		sendPush: settings.pushNotifications,
	};
}

/**
 * Build a notification payload for display
 */
export function buildNotificationPayload(
	eventType: NotificationEventType,
	data: {
		senderName: string;
		senderAvatarUrl?: string;
		messageContent: string;
		channelName?: string;
		serverName?: string;
		messageId?: string;
		channelId?: string;
		serverId?: string;
		conversationId?: string;
	}
): NotificationPayload {
	const { senderName, messageContent, channelName, serverName } = data;

	// Truncate message content for notification
	const truncatedContent =
		messageContent.length > 100
			? `${messageContent.slice(0, 97)}...`
			: messageContent;

	let title: string;
	let body: string;

	switch (eventType) {
		case "dm":
			title = senderName;
			body = truncatedContent;
			break;
		case "mention":
			title = channelName
				? `${senderName} mentioned you in #${channelName}`
				: `${senderName} mentioned you`;
			body = truncatedContent;
			break;
		case "thread_reply":
			title = channelName
				? `${senderName} replied in #${channelName}`
				: `${senderName} replied`;
			body = truncatedContent;
			break;
		default:
			title = channelName && serverName
				? `#${channelName} in ${serverName}`
				: channelName
					? `#${channelName}`
					: senderName;
			body = `${senderName}: ${truncatedContent}`;
	}

	// Build the URL for deep linking
	let url = "/";
	if (data.conversationId) {
		url = `/dm/${data.conversationId}`;
	} else if (data.serverId && data.channelId) {
		url = `/servers/${data.serverId}/channels/${data.channelId}`;
		if (data.messageId) {
			url += `?message=${data.messageId}`;
		}
	}

	return {
		type: eventType,
		title,
		body,
		icon: data.senderAvatarUrl,
		url,
		data: {
			messageId: data.messageId,
			channelId: data.channelId,
			serverId: data.serverId,
			conversationId: data.conversationId,
		},
	};
}

/**
 * Check if a message content contains a mention of a specific user
 */
export function extractMentionedUserIds(messageContent: string): string[] {
	// Match patterns like @<userId> or <@userId>
	const mentionPattern = /<@([a-zA-Z0-9]+)>/g;
	const mentions: string[] = [];
	let match;

	while ((match = mentionPattern.exec(messageContent)) !== null) {
		mentions.push(match[1]);
	}

	return mentions;
}

/**
 * Check if a message is a reply to a specific user based on replyToMessageId
 */
export function isReplyToUser(
	replyToAuthorId: string | undefined,
	userId: string
): boolean {
	return replyToAuthorId === userId;
}
