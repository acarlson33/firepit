import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
	getOrCreateNotificationSettings,
	updateNotificationSettings,
} from "@/lib/notification-settings";
import type { NotificationLevel, NotificationOverride } from "@/lib/types";

/**
 * GET /api/notifications/settings
 * Fetches notification settings for the authenticated user
 */
export async function GET() {
	try {
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const settings = await getOrCreateNotificationSettings(user.$id);

		if (!settings) {
			return NextResponse.json(
				{ error: "Failed to get notification settings" },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			$id: settings.$id,
			userId: settings.userId,
			globalNotifications: settings.globalNotifications,
			desktopNotifications: settings.desktopNotifications,
			pushNotifications: settings.pushNotifications,
			notificationSound: settings.notificationSound,
			quietHoursStart: settings.quietHoursStart,
			quietHoursEnd: settings.quietHoursEnd,
			quietHoursTimezone: settings.quietHoursTimezone,
			serverOverrides: settings.serverOverrides,
			channelOverrides: settings.channelOverrides,
			conversationOverrides: settings.conversationOverrides,
			$createdAt: settings.$createdAt,
			$updatedAt: settings.$updatedAt,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to fetch notification settings",
			},
			{ status: 500 }
		);
	}
}

interface PatchRequestBody {
	globalNotifications?: NotificationLevel;
	desktopNotifications?: boolean;
	pushNotifications?: boolean;
	notificationSound?: boolean;
	quietHoursStart?: string | null;
	quietHoursEnd?: string | null;
	quietHoursTimezone?: string | null;
	serverOverrides?: NotificationOverride[];
	channelOverrides?: NotificationOverride[];
	conversationOverrides?: NotificationOverride[];
}

/**
 * PATCH /api/notifications/settings
 * Updates notification settings for the authenticated user
 */
export async function PATCH(request: Request) {
	try {
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const body = (await request.json()) as PatchRequestBody;

		// Validate globalNotifications if provided
		if (
			body.globalNotifications !== undefined &&
			!["all", "mentions", "nothing"].includes(body.globalNotifications)
		) {
			return NextResponse.json(
				{ error: "Invalid globalNotifications value. Must be 'all', 'mentions', or 'nothing'" },
				{ status: 400 }
			);
		}

		// Validate quiet hours format if provided (HH:MM)
		const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
		if (body.quietHoursStart && !timeRegex.test(body.quietHoursStart)) {
			return NextResponse.json(
				{ error: "Invalid quietHoursStart format. Must be HH:MM (24-hour)" },
				{ status: 400 }
			);
		}
		if (body.quietHoursEnd && !timeRegex.test(body.quietHoursEnd)) {
			return NextResponse.json(
				{ error: "Invalid quietHoursEnd format. Must be HH:MM (24-hour)" },
				{ status: 400 }
			);
		}

		// Get existing settings to get the document ID
		const existingSettings = await getOrCreateNotificationSettings(user.$id);
		if (!existingSettings) {
			return NextResponse.json(
				{ error: "Failed to get notification settings" },
				{ status: 500 }
			);
		}

		// Build update data
		const updateData: Record<string, unknown> = {};

		if (body.globalNotifications !== undefined) {
			updateData.globalNotifications = body.globalNotifications;
		}
		if (body.desktopNotifications !== undefined) {
			updateData.desktopNotifications = body.desktopNotifications;
		}
		if (body.pushNotifications !== undefined) {
			updateData.pushNotifications = body.pushNotifications;
		}
		if (body.notificationSound !== undefined) {
			updateData.notificationSound = body.notificationSound;
		}
		if (body.quietHoursStart !== undefined) {
			updateData.quietHoursStart = body.quietHoursStart ?? "";
		}
		if (body.quietHoursEnd !== undefined) {
			updateData.quietHoursEnd = body.quietHoursEnd ?? "";
		}
		if (body.quietHoursTimezone !== undefined) {
			updateData.quietHoursTimezone = body.quietHoursTimezone ?? "";
		}
		if (body.serverOverrides !== undefined) {
			updateData.serverOverrides = JSON.stringify(body.serverOverrides);
		}
		if (body.channelOverrides !== undefined) {
			updateData.channelOverrides = JSON.stringify(body.channelOverrides);
		}
		if (body.conversationOverrides !== undefined) {
			updateData.conversationOverrides = JSON.stringify(body.conversationOverrides);
		}

		// Only update if there are changes
		if (Object.keys(updateData).length === 0) {
			return NextResponse.json({
				message: "No changes provided",
				settings: existingSettings,
			});
		}

		const updatedSettings = await updateNotificationSettings(
			existingSettings.$id,
			updateData
		);

		if (!updatedSettings) {
			return NextResponse.json(
				{ error: "Failed to update notification settings" },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			$id: updatedSettings.$id,
			userId: updatedSettings.userId,
			globalNotifications: updatedSettings.globalNotifications,
			desktopNotifications: updatedSettings.desktopNotifications,
			pushNotifications: updatedSettings.pushNotifications,
			notificationSound: updatedSettings.notificationSound,
			quietHoursStart: updatedSettings.quietHoursStart,
			quietHoursEnd: updatedSettings.quietHoursEnd,
			quietHoursTimezone: updatedSettings.quietHoursTimezone,
			serverOverrides: updatedSettings.serverOverrides,
			channelOverrides: updatedSettings.channelOverrides,
			conversationOverrides: updatedSettings.conversationOverrides,
			$createdAt: updatedSettings.$createdAt,
			$updatedAt: updatedSettings.$updatedAt,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to update notification settings",
			},
			{ status: 500 }
		);
	}
}
