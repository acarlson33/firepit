import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserProfile, getAvatarUrl } from "@/lib/appwrite-profiles";
import { getUserStatus } from "@/lib/appwrite-status";

/**
 * POST /api/profiles/batch
 * Batch fetch multiple user profiles to reduce API calls
 * 
 * Body: { userIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { userIds: string[] };
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds array is required" },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    if (userIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 userIds per request" },
        { status: 400 }
      );
    }

    // Deduplicate user IDs
    const uniqueUserIds = [...new Set(userIds)];

    // Fetch all profiles and statuses in parallel
    const results = await Promise.allSettled(
      uniqueUserIds.map(async (userId) => {
        const [profile, status] = await Promise.all([
          getUserProfile(userId).catch(() => null),
          getUserStatus(userId).catch(() => null),
        ]);

        if (!profile) {
          return { userId, profile: null };
        }

        const avatarUrl = profile.avatarFileId
          ? getAvatarUrl(profile.avatarFileId)
          : undefined;

        return {
          userId: profile.userId,
          profile: {
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
          },
        };
      })
    );

    // Convert results to a map for easy lookup
    const profilesMap: Record<string, any> = {};
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value.profile) {
        profilesMap[result.value.userId] = result.value.profile;
      }
    });

    return NextResponse.json({ profiles: profilesMap });
  } catch (error) {
    console.error("Batch profile fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profiles" },
      { status: 500 }
    );
  }
}
