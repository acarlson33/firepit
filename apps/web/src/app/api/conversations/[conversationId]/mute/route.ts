import { NextResponse } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { getServerSession } from "@/lib/auth-server";
import { muteConversation, unmuteConversation } from "@/lib/notification-settings";
import { invalidateNotificationSettingsCache } from "@/lib/notification-triggers";
import { returnUnauthorized, returnForbidden, logger } from "@/lib/newrelic-utils";
import type { MuteDuration, NotificationLevel } from "@/lib/types";

interface MuteRequestBody {
	muted: boolean;
	duration?: MuteDuration;
	level?: NotificationLevel;
}

const VALID_DURATIONS: MuteDuration[] = ["15m", "1h", "8h", "24h", "forever"];
const VALID_LEVELS: NotificationLevel[] = ["all", "mentions", "nothing"];

/**
 * POST /api/conversations/[conversationId]/mute
 * Mute or unmute a DM conversation for the authenticated user
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ conversationId: string }> }
) {
	try {
		const user = await getServerSession();
		if (!user) {
			return returnUnauthorized();
		}

		const { conversationId } = await params;

		if (!conversationId) {
			return NextResponse.json(
				{ error: "conversationId is required" },
				{ status: 400 }
			);
		}

		const env = getEnvConfig();
		const { databases } = getServerClient();

		let conversation: Record<string, unknown>;
		try {
			const conversationRes = await databases.getDocument(
				env.databaseId,
				env.collections.conversations,
				conversationId,
			);
			conversation = conversationRes as unknown as Record<
				string,
				unknown
			>;
		} catch (error) {
			if (isDocumentNotFoundError(error)) {
				return NextResponse.json(
					{ error: "Conversation not found" },
					{ status: 404 },
				);
			}
			throw error;
		}

		const participants = Array.isArray(conversation.participants)
			? (conversation.participants as string[])
			: [];
		if (!participants.includes(user.$id)) {
			return returnForbidden();
		}

		let body: MuteRequestBody;
		try {
			body = (await request.json()) as MuteRequestBody;
		} catch {
			return NextResponse.json(
				{ error: "Invalid JSON" },
				{ status: 400 }
			);
		}

		if (typeof body.muted !== "boolean") {
			return NextResponse.json(
				{ error: "muted field is required and must be a boolean" },
				{ status: 400 }
			);
		}

		// Validate duration if muting
		if (body.muted && body.duration && !VALID_DURATIONS.includes(body.duration)) {
			return NextResponse.json(
				{ error: "Invalid duration. Must be '15m', '1h', '8h', '24h', or 'forever'" },
				{ status: 400 }
			);
		}

		// Validate notification level if provided
		if (body.level && !VALID_LEVELS.includes(body.level)) {
			return NextResponse.json(
				{ error: "Invalid level. Must be 'all', 'mentions', or 'nothing'" },
				{ status: 400 }
			);
		}

		let updatedSettings;
		if (body.muted) {
			const duration = body.duration ?? "forever";
			const level = body.level ?? "nothing";
			updatedSettings = await muteConversation(user.$id, conversationId, duration, level);
		} else {
			updatedSettings = await unmuteConversation(user.$id, conversationId);
		}

		invalidateNotificationSettingsCache(user.$id);

		// Get the conversation override from the updated settings
		const conversationOverride = updatedSettings.conversationOverrides?.[conversationId];
		const mutedUntil = conversationOverride?.mutedUntil;
		const muted =
			mutedUntil === "forever" ||
			(typeof mutedUntil === "string" &&
				new Date(mutedUntil).getTime() > Date.now());

		return NextResponse.json({
			conversationId,
			muted,
			mutedUntil,
			level: conversationOverride?.level,
		});
	} catch (error) {
		logger.error("Failed to update conversation mute settings", {
			error: error instanceof Error ? error.message : String(error),
		});
		return NextResponse.json(
			{ error: "Failed to update conversation mute settings" },
			{ status: 500 }
		);
	}
}
