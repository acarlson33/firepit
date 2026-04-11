import { NextResponse } from "next/server";
import {
    getUserProfile,
    getAvatarUrl,
    getProfileBackgroundUrl,
    getAvatarFrameUrlForProfile,
} from "@/lib/appwrite-profiles";
import { getUserStatus } from "@/lib/appwrite-status";
import { logger } from "@/lib/newrelic-utils";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ userId: string }> },
) {
    let userId: string | undefined;

    try {
        ({ userId } = await params);

        if (!userId) {
            return NextResponse.json(
                { error: "userId is required" },
                { status: 400 },
            );
        }

        const [profileResult, statusResult] = await Promise.allSettled([
            getUserProfile(userId),
            getUserStatus(userId),
        ]);

        if (profileResult.status === "rejected") {
            throw profileResult.reason;
        }

        const profile = profileResult.value;
        const status =
            statusResult.status === "fulfilled"
                ? statusResult.value
                : undefined;

        if (statusResult.status === "rejected") {
            logger.warn("Failed to fetch user status for profile response", {
                error:
                    statusResult.reason instanceof Error
                        ? statusResult.reason.message
                        : String(statusResult.reason),
                userId,
            });
        }

        if (!profile) {
            return NextResponse.json(
                { error: "Profile not found" },
                { status: 404 },
            );
        }

        const profileBackgroundUrl = profile.profileBackgroundImageFileId
            ? getProfileBackgroundUrl(profile.profileBackgroundImageFileId)
            : undefined;
        let avatarFrameUrl: string | undefined;
        try {
            avatarFrameUrl = await getAvatarFrameUrlForProfile(profile);
        } catch (error) {
            logger.warn("Failed to resolve avatar frame URL for profile", {
                error: error instanceof Error ? error.message : String(error),
                userId,
            });
            avatarFrameUrl = undefined;
        }

        return NextResponse.json({
            userId: profile.userId,
            displayName: profile.displayName,
            bio: profile.bio,
            pronouns: profile.pronouns,
            location: profile.location,
            website: profile.website,
            avatarFileId: profile.avatarFileId,
            avatarUrl: profile.avatarFileId
                ? getAvatarUrl(profile.avatarFileId)
                : undefined,
            profileBackgroundColor: profile.profileBackgroundColor,
            profileBackgroundGradient: profile.profileBackgroundGradient,
            profileBackgroundImageFileId: profile.profileBackgroundImageFileId,
            profileBackgroundUrl: profileBackgroundUrl,
            avatarFramePreset: profile.avatarFramePreset,
            avatarFrameUrl: avatarFrameUrl,
            status: status
                ? {
                      status: status.status,
                      customMessage: status.customMessage,
                      lastSeenAt: status.lastSeenAt,
                  }
                : undefined,
        });
    } catch (err) {
        logger.error("Failed to fetch user profile", {
            error: err instanceof Error ? err.message : String(err),
            userId,
        });
        return NextResponse.json(
            { error: "Failed to fetch user profile" },
            { status: 500 },
        );
    }
}
