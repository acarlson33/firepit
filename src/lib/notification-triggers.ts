/**
 * Notification Trigger Logic
 *
 * This module provides the core logic for determining when and how to send
 * notifications to users based on their settings and the context of the event.
 */

import type {
	NotificationLevel,
	NotificationPayload,
	NotificationSettings,
} from "@/lib/types";

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

const NOTIFICATION_SETTINGS_CACHE_TTL_MS = 15_000;
const QUIET_HOURS_TIME_PATTERN = /^\d{1,2}:\d{2}$/;

type NotificationSettingsCacheEntry = {
	expiresAt: number;
	settings: NotificationSettings;
};

const notificationSettingsCache = new Map<string, NotificationSettingsCacheEntry>();
const pendingNotificationSettingsRequests = new Map<
	string,
	Promise<NotificationSettings | null>
>();

function isMuteExpired(mutedUntil: string | undefined): boolean {
	if (!mutedUntil) {
		return false;
	}

	const mutedUntilMs = Date.parse(mutedUntil);
	if (Number.isNaN(mutedUntilMs)) {
		return true;
	}

	return mutedUntilMs <= Date.now();
}

function getEffectiveNotificationLevel(
	settings: NotificationSettings,
	context: {
		channelId?: string;
		serverId?: string;
		conversationId?: string;
	},
): NotificationLevel {
	if (context.conversationId && settings.conversationOverrides) {
		const override = settings.conversationOverrides[context.conversationId];
		if (override && !isMuteExpired(override.mutedUntil)) {
			return override.level;
		}
	}

	if (context.channelId && settings.channelOverrides) {
		const override = settings.channelOverrides[context.channelId];
		if (override && !isMuteExpired(override.mutedUntil)) {
			return override.level;
		}
	}

	if (context.serverId && settings.serverOverrides) {
		const override = settings.serverOverrides[context.serverId];
		if (override && !isMuteExpired(override.mutedUntil)) {
			return override.level;
		}
	}

	return settings.globalNotifications;
}

function isInQuietHours(settings: NotificationSettings): boolean {
	if (!settings.quietHoursStart || !settings.quietHoursEnd) {
		return false;
	}

	if (
		!QUIET_HOURS_TIME_PATTERN.test(settings.quietHoursStart) ||
		!QUIET_HOURS_TIME_PATTERN.test(settings.quietHoursEnd)
	) {
		return false;
	}

	const now = new Date();
	let currentMinutes = now.getHours() * 60 + now.getMinutes();

	if (settings.quietHoursTimezone) {
		try {
			const formatter = new Intl.DateTimeFormat("en-US", {
				timeZone: settings.quietHoursTimezone,
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});
			const parts = formatter.formatToParts(now);
			const hours = Number(
				parts.find((part) => part.type === "hour")?.value ?? "0",
			);
			const minutes = Number(
				parts.find((part) => part.type === "minute")?.value ?? "0",
			);
			currentMinutes = hours * 60 + minutes;
		} catch {
			// Fall back to local time if timezone is invalid.
		}
	}

	const [startHourText, startMinText] = settings.quietHoursStart.split(":");
	const [endHourText, endMinText] = settings.quietHoursEnd.split(":");
	const startHour = Number.parseInt(startHourText, 10);
	const startMin = Number.parseInt(startMinText, 10);
	const endHour = Number.parseInt(endHourText, 10);
	const endMin = Number.parseInt(endMinText, 10);

	if (
		Number.isNaN(startHour) ||
		Number.isNaN(startMin) ||
		Number.isNaN(endHour) ||
		Number.isNaN(endMin) ||
		startHour < 0 ||
		startHour > 23 ||
		endHour < 0 ||
		endHour > 23 ||
		startMin < 0 ||
		startMin > 59 ||
		endMin < 0 ||
		endMin > 59
	) {
		return false;
	}

	const startMinutes = startHour * 60 + startMin;
	const endMinutes = endHour * 60 + endMin;

	if (startMinutes > endMinutes) {
		return currentMinutes >= startMinutes || currentMinutes < endMinutes;
	}

	return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function normalizeNotificationSettings(
	value: unknown,
	recipientId: string,
): NotificationSettings | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const settings = value as Partial<NotificationSettings>;
	if (
		typeof settings.globalNotifications !== "string" ||
		typeof settings.desktopNotifications !== "boolean" ||
		typeof settings.pushNotifications !== "boolean" ||
		typeof settings.notificationSound !== "boolean"
	) {
		return null;
	}

	return {
		$id: typeof settings.$id === "string" ? settings.$id : "",
		userId:
			typeof settings.userId === "string" ? settings.userId : recipientId,
		globalNotifications:
			settings.globalNotifications === "all" ||
			settings.globalNotifications === "mentions" ||
			settings.globalNotifications === "nothing"
				? settings.globalNotifications
				: "all",
		directMessagePrivacy:
			settings.directMessagePrivacy === "friends" ? "friends" : "everyone",
		dmEncryptionEnabled:
			typeof settings.dmEncryptionEnabled === "boolean"
				? settings.dmEncryptionEnabled
				: undefined,
		desktopNotifications: settings.desktopNotifications,
		pushNotifications: settings.pushNotifications,
		notificationSound: settings.notificationSound,
		quietHoursStart:
			typeof settings.quietHoursStart === "string"
				? settings.quietHoursStart
				: undefined,
		quietHoursEnd:
			typeof settings.quietHoursEnd === "string"
				? settings.quietHoursEnd
				: undefined,
		quietHoursTimezone:
			typeof settings.quietHoursTimezone === "string"
				? settings.quietHoursTimezone
				: undefined,
		serverOverrides: settings.serverOverrides ?? {},
		channelOverrides: settings.channelOverrides ?? {},
		conversationOverrides: settings.conversationOverrides ?? {},
		$createdAt:
			typeof settings.$createdAt === "string"
				? settings.$createdAt
				: undefined,
		$updatedAt:
			typeof settings.$updatedAt === "string"
				? settings.$updatedAt
				: undefined,
	};
}

async function getOrCreateNotificationSettings(
	recipientId: string,
): Promise<NotificationSettings | null> {
	if (typeof window === "undefined") {
		return null;
	}

	const cached = notificationSettingsCache.get(recipientId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.settings;
	}

	const pendingRequest = pendingNotificationSettingsRequests.get(recipientId);
	if (pendingRequest) {
		return pendingRequest;
	}

	const request = (async () => {
		try {
			const response = await fetch("/api/notifications/settings", {
				cache: "no-store",
				headers: {
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				return null;
			}

			const payload = (await response.json()) as unknown;
			const settings = normalizeNotificationSettings(payload, recipientId);
			if (!settings) {
				return null;
			}

			notificationSettingsCache.set(recipientId, {
				expiresAt: Date.now() + NOTIFICATION_SETTINGS_CACHE_TTL_MS,
				settings,
			});

			return settings;
		} catch {
			return null;
		} finally {
			pendingNotificationSettingsRequests.delete(recipientId);
		}
	})();

	pendingNotificationSettingsRequests.set(recipientId, request);
	return request;
}

/**
 * Determines the type of notification event based on context
 *
 * @param {NotificationContext} context - The context value.
 * @returns {'dm' | 'mention' | 'message' | 'thread_reply'} The return value.
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
 *
 * @param {NotificationLevel} level - The level value.
 * @param {'dm' | 'mention' | 'message' | 'thread_reply'} eventType - The event type value.
 * @returns {boolean} The return value.
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
 * @param {NotificationContext} context - The context value.
 * @returns {Promise<NotificationResult>} The return value.
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
 *
 * @param {'dm' | 'mention' | 'message' | 'thread_reply'} eventType - The event type value.
 * @param {{ senderName: string; senderAvatarUrl?: string | undefined; messageContent: string; channelName?: string | undefined; serverName?: string | undefined; messageId?: string | undefined; channelId?: string | undefined; serverId?: string | undefined; conversationId?: string | undefined; }} data - The data value.
 * @returns {NotificationPayload} The return value.
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
 *
 * @param {string} messageContent - The message content value.
 * @returns {string[]} The return value.
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
 *
 * @param {string | undefined} replyToAuthorId - The reply to author id value.
 * @param {string} userId - The user id value.
 * @returns {boolean} The return value.
 */
export function isReplyToUser(
	replyToAuthorId: string | undefined,
	userId: string
): boolean {
	return replyToAuthorId === userId;
}
