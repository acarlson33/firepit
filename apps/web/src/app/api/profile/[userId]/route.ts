import { NextResponse } from "next/server";
import {
    getUserProfile,
    getAvatarUrl,
    getProfileBackgroundUrl,
    getPredefinedAvatarFrameUrlByPresetId,
} from "@/lib/appwrite-profiles";
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

		const [profile, status] = await Promise.all([
			getUserProfile(userId),
			getUserStatus(userId),
		]);

		if (!profile) {
			return NextResponse.json({ error: "Profile not found" }, { status: 404 });
		}

		const avatarUrl = profile.avatarFileId
			? getAvatarUrl(profile.avatarFileId)
			: undefined;

		const profileBackgroundImageFileId = profile.profileBackgroundImageFileId;

		return NextResponse.json({
			userId: profile.userId,
			displayName: profile.displayName,
			bio: profile.bio,
			pronouns: profile.pronouns,
			location: profile.location,
			website: profile.website,
			dmEncryptionPublicKey: profile.dmEncryptionPublicKey,
			avatarFileId: profile.avatarFileId,
			avatarUrl,
			profileBackgroundColor: profile.profileBackgroundColor,
			profileBackgroundGradient: profile.profileBackgroundGradient,
			profileBackgroundImageFileId,
			profileBackgroundUrl: profileBackgroundImageFileId
				? getProfileBackgroundUrl(profileBackgroundImageFileId)
				: undefined,
			avatarFramePreset: profile.avatarFramePreset,
			avatarFrameUrl: getPredefinedAvatarFrameUrlByPresetId(profile.avatarFramePreset),
			status: status
				? {
						status: status.status,
						customMessage: status.customMessage,
						lastSeenAt: status.lastSeenAt,
					}
				: undefined,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to fetch profile" },
			{ status: 500 },
		);
	}
}
