/**
 * Notification settings management utilities
 * Handles CRUD operations for user notification preferences
 */

import { ID, Query } from "node-appwrite";
import { getAdminClient } from "./appwrite-admin";
import { getEnvConfig, perms } from "./appwrite-core";
import type {
	NotificationSettings,
	NotificationLevel,
	NotificationOverride,
	MuteDuration,
} from "./types";

const DEFAULT_SETTINGS: Omit<NotificationSettings, "$id" | "userId" | "$createdAt" | "$updatedAt"> = {
	globalNotifications: "all",
	desktopNotifications: true,
	pushNotifications: true,
	notificationSound: true,
	quietHoursStart: undefined,
	quietHoursEnd: undefined,
	serverOverrides: {},
	channelOverrides: {},
	conversationOverrides: {},
};

/**
 * Parse JSON string overrides from database into typed objects
 */
function parseOverrides(value: unknown): Record<string, NotificationOverride> {
	if (!value) {
		return {};
	}
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as Record<string, NotificationOverride>;
		} catch {
			return {};
		}
	}
	if (typeof value === "object") {
		return value as Record<string, NotificationOverride>;
	}
	return {};
}

/**
 * Convert database document to NotificationSettings type
 */
function documentToSettings(doc: Record<string, unknown>): NotificationSettings {
	return {
		$id: String(doc.$id),
		userId: String(doc.userId),
		globalNotifications: (doc.globalNotifications as NotificationLevel) || "all",
		desktopNotifications: Boolean(doc.desktopNotifications ?? true),
		pushNotifications: Boolean(doc.pushNotifications ?? true),
		notificationSound: Boolean(doc.notificationSound ?? true),
		quietHoursStart: doc.quietHoursStart ? String(doc.quietHoursStart) : undefined,
		quietHoursEnd: doc.quietHoursEnd ? String(doc.quietHoursEnd) : undefined,
		serverOverrides: parseOverrides(doc.serverOverrides),
		channelOverrides: parseOverrides(doc.channelOverrides),
		conversationOverrides: parseOverrides(doc.conversationOverrides),
		$createdAt: doc.$createdAt ? String(doc.$createdAt) : undefined,
		$updatedAt: doc.$updatedAt ? String(doc.$updatedAt) : undefined,
	};
}

/**
 * Get notification settings for a user
 * Returns null if settings don't exist yet
 */
export async function getNotificationSettings(
	userId: string
): Promise<NotificationSettings | null> {
	try {
		const { databases } = getAdminClient();
		const env = getEnvConfig();

		const result = await databases.listDocuments(
			env.databaseId,
			env.collections.notificationSettings,
			[Query.equal("userId", userId), Query.limit(1)]
		);

		if (result.documents.length === 0) {
			return null;
		}

		return documentToSettings(result.documents[0] as unknown as Record<string, unknown>);
	} catch {
		return null;
	}
}

/**
 * Get or create notification settings for a user
 * Creates default settings if they don't exist
 */
export async function getOrCreateNotificationSettings(
	userId: string
): Promise<NotificationSettings> {
	const existing = await getNotificationSettings(userId);
	if (existing) {
		return existing;
	}

	return createNotificationSettings(userId, DEFAULT_SETTINGS);
}

/**
 * Create notification settings for a user
 */
export async function createNotificationSettings(
	userId: string,
	data: Partial<Omit<NotificationSettings, "$id" | "userId" | "$createdAt" | "$updatedAt">>
): Promise<NotificationSettings> {
	const { databases } = getAdminClient();
	const env = getEnvConfig();

	const docData = {
		userId,
		globalNotifications: data.globalNotifications ?? DEFAULT_SETTINGS.globalNotifications,
		desktopNotifications: data.desktopNotifications ?? DEFAULT_SETTINGS.desktopNotifications,
		pushNotifications: data.pushNotifications ?? DEFAULT_SETTINGS.pushNotifications,
		notificationSound: data.notificationSound ?? DEFAULT_SETTINGS.notificationSound,
		quietHoursStart: data.quietHoursStart ?? null,
		quietHoursEnd: data.quietHoursEnd ?? null,
		serverOverrides: JSON.stringify(data.serverOverrides ?? {}),
		channelOverrides: JSON.stringify(data.channelOverrides ?? {}),
		conversationOverrides: JSON.stringify(data.conversationOverrides ?? {}),
	};

	const doc = await databases.createDocument(
		env.databaseId,
		env.collections.notificationSettings,
		ID.unique(),
		docData,
		perms.serverOwner(userId)
	);

	return documentToSettings(doc as unknown as Record<string, unknown>);
}

/**
 * Update notification settings for a user
 */
export async function updateNotificationSettings(
	settingsId: string,
	data: Partial<Omit<NotificationSettings, "$id" | "userId" | "$createdAt" | "$updatedAt">>
): Promise<NotificationSettings> {
	const { databases } = getAdminClient();
	const env = getEnvConfig();

	// Build update object, only including defined fields
	const updateData: Record<string, unknown> = {};

	if (data.globalNotifications !== undefined) {
		updateData.globalNotifications = data.globalNotifications;
	}
	if (data.desktopNotifications !== undefined) {
		updateData.desktopNotifications = data.desktopNotifications;
	}
	if (data.pushNotifications !== undefined) {
		updateData.pushNotifications = data.pushNotifications;
	}
	if (data.notificationSound !== undefined) {
		updateData.notificationSound = data.notificationSound;
	}
	if (data.quietHoursStart !== undefined) {
		updateData.quietHoursStart = data.quietHoursStart ?? null;
	}
	if (data.quietHoursEnd !== undefined) {
		updateData.quietHoursEnd = data.quietHoursEnd ?? null;
	}
	if (data.serverOverrides !== undefined) {
		updateData.serverOverrides = JSON.stringify(data.serverOverrides);
	}
	if (data.channelOverrides !== undefined) {
		updateData.channelOverrides = JSON.stringify(data.channelOverrides);
	}
	if (data.conversationOverrides !== undefined) {
		updateData.conversationOverrides = JSON.stringify(data.conversationOverrides);
	}

	const doc = await databases.updateDocument(
		env.databaseId,
		env.collections.notificationSettings,
		settingsId,
		updateData
	);

	return documentToSettings(doc as unknown as Record<string, unknown>);
}

/**
 * Calculate mute expiration timestamp from duration
 */
export function calculateMuteExpiration(duration: MuteDuration): string | undefined {
	if (duration === "forever") {
		return undefined; // No expiration
	}

	const now = new Date();
	const durationMs: Record<Exclude<MuteDuration, "forever">, number> = {
		"15m": 15 * 60 * 1000,
		"1h": 60 * 60 * 1000,
		"8h": 8 * 60 * 60 * 1000,
		"24h": 24 * 60 * 60 * 1000,
	};

	return new Date(now.getTime() + durationMs[duration]).toISOString();
}

/**
 * Check if a mute has expired
 */
export function isMuteExpired(mutedUntil: string | undefined): boolean {
	if (!mutedUntil) {
		return false; // No expiration means muted forever
	}
	return new Date(mutedUntil) < new Date();
}

/**
 * Mute a server for a user
 */
export async function muteServer(
	userId: string,
	serverId: string,
	duration: MuteDuration,
	level: NotificationLevel = "nothing"
): Promise<NotificationSettings> {
	const settings = await getOrCreateNotificationSettings(userId);
	const serverOverrides = { ...settings.serverOverrides };

	serverOverrides[serverId] = {
		level,
		mutedUntil: calculateMuteExpiration(duration),
	};

	return updateNotificationSettings(settings.$id, { serverOverrides });
}

/**
 * Unmute a server for a user
 */
export async function unmuteServer(
	userId: string,
	serverId: string
): Promise<NotificationSettings> {
	const settings = await getOrCreateNotificationSettings(userId);
	const serverOverrides = { ...settings.serverOverrides };

	delete serverOverrides[serverId];

	return updateNotificationSettings(settings.$id, { serverOverrides });
}

/**
 * Mute a channel for a user
 */
export async function muteChannel(
	userId: string,
	channelId: string,
	duration: MuteDuration,
	level: NotificationLevel = "nothing"
): Promise<NotificationSettings> {
	const settings = await getOrCreateNotificationSettings(userId);
	const channelOverrides = { ...settings.channelOverrides };

	channelOverrides[channelId] = {
		level,
		mutedUntil: calculateMuteExpiration(duration),
	};

	return updateNotificationSettings(settings.$id, { channelOverrides });
}

/**
 * Unmute a channel for a user
 */
export async function unmuteChannel(
	userId: string,
	channelId: string
): Promise<NotificationSettings> {
	const settings = await getOrCreateNotificationSettings(userId);
	const channelOverrides = { ...settings.channelOverrides };

	delete channelOverrides[channelId];

	return updateNotificationSettings(settings.$id, { channelOverrides });
}

/**
 * Mute a conversation for a user
 */
export async function muteConversation(
	userId: string,
	conversationId: string,
	duration: MuteDuration,
	level: NotificationLevel = "nothing"
): Promise<NotificationSettings> {
	const settings = await getOrCreateNotificationSettings(userId);
	const conversationOverrides = { ...settings.conversationOverrides };

	conversationOverrides[conversationId] = {
		level,
		mutedUntil: calculateMuteExpiration(duration),
	};

	return updateNotificationSettings(settings.$id, { conversationOverrides });
}

/**
 * Unmute a conversation for a user
 */
export async function unmuteConversation(
	userId: string,
	conversationId: string
): Promise<NotificationSettings> {
	const settings = await getOrCreateNotificationSettings(userId);
	const conversationOverrides = { ...settings.conversationOverrides };

	delete conversationOverrides[conversationId];

	return updateNotificationSettings(settings.$id, { conversationOverrides });
}

/**
 * Get the effective notification level for a specific context
 * Priority: Channel > Server > Global
 */
export function getEffectiveNotificationLevel(
	settings: NotificationSettings,
	context: {
		channelId?: string;
		serverId?: string;
		conversationId?: string;
	}
): NotificationLevel {
	// Check conversation override first (for DMs)
	if (context.conversationId && settings.conversationOverrides) {
		const override = settings.conversationOverrides[context.conversationId];
		if (override && !isMuteExpired(override.mutedUntil)) {
			return override.level;
		}
	}

	// Check channel override (most specific for channels)
	if (context.channelId && settings.channelOverrides) {
		const override = settings.channelOverrides[context.channelId];
		if (override && !isMuteExpired(override.mutedUntil)) {
			return override.level;
		}
	}

	// Check server override
	if (context.serverId && settings.serverOverrides) {
		const override = settings.serverOverrides[context.serverId];
		if (override && !isMuteExpired(override.mutedUntil)) {
			return override.level;
		}
	}

	// Fall back to global setting
	return settings.globalNotifications;
}

/**
 * Check if current time is within quiet hours
 */
export function isInQuietHours(settings: NotificationSettings): boolean {
	if (!settings.quietHoursStart || !settings.quietHoursEnd) {
		return false;
	}

	const now = new Date();
	const currentMinutes = now.getHours() * 60 + now.getMinutes();

	const [startHour, startMin] = settings.quietHoursStart.split(":").map(Number);
	const [endHour, endMin] = settings.quietHoursEnd.split(":").map(Number);

	const startMinutes = startHour * 60 + startMin;
	const endMinutes = endHour * 60 + endMin;

	// Handle overnight quiet hours (e.g., 22:00 - 08:00)
	if (startMinutes > endMinutes) {
		return currentMinutes >= startMinutes || currentMinutes < endMinutes;
	}

	// Normal range (e.g., 00:00 - 08:00)
	return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
