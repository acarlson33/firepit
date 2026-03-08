import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getRelationshipMap } from "@/lib/appwrite-friendships";
import { getUserProfile, getAvatarUrl } from "@/lib/appwrite-profiles";
import { getUserStatus } from "@/lib/appwrite-status";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";
import { compressedResponse } from "@/lib/api-compression";

/**
 * POST /api/profiles/batch
 * Batch fetch multiple user profiles to reduce API calls
 *
 * Body: { userIds: string[] }
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/profiles/batch");

        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = (await request.json()) as { userIds: string[] };
        const { userIds } = body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            logger.warn("Invalid batch profile request", { userIds });
            return NextResponse.json(
                { error: "userIds array is required" },
                { status: 400 },
            );
        }

        // Limit batch size to prevent abuse
        if (userIds.length > 100) {
            logger.warn("Batch size too large", { count: userIds.length });
            return NextResponse.json(
                { error: "Maximum 100 userIds per request" },
                { status: 400 },
            );
        }

        // Deduplicate user IDs
        const uniqueUserIds = [...new Set(userIds)];

        const relationshipMap = await getRelationshipMap(
            session.$id,
            uniqueUserIds,
        );
        const visibleUserIds = uniqueUserIds.filter((userId) => {
            if (userId === session.$id) {
                return true;
            }

            const relationship = relationshipMap.get(userId);
            return !relationship?.blockedByMe && !relationship?.blockedMe;
        });

        addTransactionAttributes({
            requestedCount: userIds.length,
            uniqueCount: uniqueUserIds.length,
            visibleCount: visibleUserIds.length,
        });

        logger.info("Fetching batch profiles", {
            count: visibleUserIds.length,
        });

        // Fetch all profiles and statuses in parallel
        const fetchStartTime = Date.now();
        const results = await Promise.allSettled(
            visibleUserIds.map(async (userId) => {
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
            }),
        );

        const fetchDuration = Date.now() - fetchStartTime;

        // Convert results to a map for easy lookup
        const profilesMap: Record<string, unknown> = {};
        let successCount = 0;
        results.forEach((result) => {
            if (result.status === "fulfilled" && result.value.profile) {
                profilesMap[result.value.userId] = result.value.profile;
                successCount++;
            }
        });

        trackApiCall("/api/profiles/batch", "POST", 200, fetchDuration, {
            operation: "batchFetchProfiles",
            requestedCount: uniqueUserIds.length,
            visibleCount: visibleUserIds.length,
            successCount,
            failedCount: visibleUserIds.length - successCount,
        });

        logger.info("Batch profiles fetched", {
            requested: uniqueUserIds.length,
            visible: visibleUserIds.length,
            succeeded: successCount,
            failed: visibleUserIds.length - successCount,
            duration: Date.now() - startTime,
        });

        return compressedResponse({ profiles: profilesMap });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/profiles/batch",
            endpoint: "/api/profiles/batch",
        });

        logger.error("Batch profile fetch error", {
            error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
            { error: "Failed to fetch profiles" },
            { status: 500 },
        );
    }
}
