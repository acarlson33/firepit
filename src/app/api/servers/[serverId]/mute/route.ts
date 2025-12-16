import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { muteServer, unmuteServer } from "@/lib/notification-settings";
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
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const { serverId } = await params;

		if (!serverId) {
			return NextResponse.json(
				{ error: "serverId is required" },
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
			updatedSettings = await muteServer(user.$id, serverId, duration, level);
		} else {
			updatedSettings = await unmuteServer(user.$id, serverId);
		}

		// Get the server override from the updated settings
		const serverOverride = updatedSettings.serverOverrides?.[serverId];

		return NextResponse.json({
			serverId,
			muted: !!serverOverride,
			mutedUntil: serverOverride?.mutedUntil,
			level: serverOverride?.level,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to update server mute settings",
			},
			{ status: 500 }
		);
	}
}
