import { NextResponse } from "next/server";
import { getUserProfile, getAvatarUrl } from "@/lib/appwrite-profiles";
import { getUserStatus } from "@/lib/appwrite-status";

type Props = {
	params: Promise<{ userId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
	try {
		const { userId } = await params;

		if (!userId) {
			return NextResponse.json(
				{ error: "User ID is required" },
				{ status: 400 },
			);
		}

		const profile = await getUserProfile(userId);

		if (!profile) {
			return NextResponse.json({ error: "Profile not found" }, { status: 404 });
		}

		// Add avatar URL if avatarFileId exists
		const avatarUrl = profile.avatarFileId
			? getAvatarUrl(profile.avatarFileId)
			: undefined;

		// Get user status
		const status = await getUserStatus(userId);

		return NextResponse.json({
			userId: profile.userId,
			displayName: profile.displayName,
			bio: profile.bio,
			pronouns: profile.pronouns,
			location: profile.location,
			website: profile.website,
			avatarFileId: profile.avatarFileId,
			avatarUrl,
			status: status
				? {
						status: status.status,
						customMessage: status.customMessage,
						lastSeenAt: status.lastSeenAt,
					}
				: undefined,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to fetch profile" },
			{ status: 500 },
		);
	}
}
