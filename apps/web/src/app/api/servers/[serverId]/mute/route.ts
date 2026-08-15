import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { muteServer, unmuteServer, isMuteExpired } from "@/lib/notification-settings";
import { invalidateNotificationSettingsCache } from "@/lib/notification-triggers";
import { logger, returnUnauthorized, returnForbidden } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { MuteDuration, NotificationLevel } from "@/lib/types";

interface MuteRequestBody {
	muted: boolean;
	duration?: MuteDuration;
	level?: NotificationLevel;
}

const VALID_DURATIONS: MuteDuration[] = ["15m", "1h", "8h", "24h", "forever"];
const VALID_LEVELS: NotificationLevel[] = ["all", "mentions", "nothing"];

/**
 * POST /api/servers/[serverId]/mute
 * Mute or unmute a server for the authenticated user
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ serverId: string }> }
) {
	try {
		const user = await getServerSession();
		if (!user) {
			return returnUnauthorized();
		}

		const { serverId } = await params;

		const { databases } = getServerClient();
		const env = getEnvConfig();
		const access = await getServerPermissionsForUser(
			databases,
			env,
			serverId,
			user.$id,
		);
		if (!access.isMember) {
			return returnForbidden();
		}

		const body = (await request.json()) as MuteRequestBody;

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
			updatedSettings = await muteServer(user.$id, serverId, duration, level);
		} else {
			updatedSettings = await unmuteServer(user.$id, serverId);
		}

		invalidateNotificationSettingsCache(user.$id);

		// Get the server override from the updated settings
		const serverOverride = updatedSettings.serverOverrides?.[serverId];

		return NextResponse.json({
			serverId,
			muted:
				Boolean(serverOverride) &&
				!isMuteExpired(serverOverride?.mutedUntil),
			mutedUntil: serverOverride?.mutedUntil,
			level: serverOverride?.level,
		});
	} catch (error) {
		logger.error("Failed to update server mute settings", {
			error: error instanceof Error ? error.message : String(error),
		});
		return NextResponse.json(
			{ error: "Failed to update server mute settings" },
			{ status: 500 }
		);
	}
}
