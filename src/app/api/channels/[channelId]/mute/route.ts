import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { muteChannel, unmuteChannel } from "@/lib/notification-settings";
import type { MuteDuration, NotificationLevel } from "@/lib/types";

interface MuteRequestBody {
	muted: boolean;
	duration?: MuteDuration;
	level?: NotificationLevel;
}

const VALID_DURATIONS: MuteDuration[] = ["15m", "1h", "8h", "24h", "forever"];
const VALID_LEVELS: NotificationLevel[] = ["all", "mentions", "nothing"];

/**
 * POST /api/channels/[channelId]/mute
 * Mute or unmute a channel for the authenticated user
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ channelId: string }> }
) {
	try {
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const { channelId } = await params;

		if (!channelId) {
			return NextResponse.json(
				{ error: "channelId is required" },
				{ status: 400 }
			);
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
			updatedSettings = await muteChannel(user.$id, channelId, duration, level);
		} else {
			updatedSettings = await unmuteChannel(user.$id, channelId);
		}

		// Get the channel override from the updated settings
		const channelOverride = updatedSettings.channelOverrides?.[channelId];

		return NextResponse.json({
			channelId,
			muted: !!channelOverride,
			mutedUntil: channelOverride?.mutedUntil,
			level: channelOverride?.level,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to update channel mute settings",
			},
			{ status: 500 }
		);
	}
}
