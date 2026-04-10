import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";
import { getServerSession } from "@/lib/auth-server";
import { getRelationshipMap } from "@/lib/appwrite-friendships";
import {
    getAvatarUrl,
    getProfileBackgroundUrl,
    getExistingPredefinedAvatarFrameIds,
    getPredefinedAvatarFrameUrlByPresetId,
} from "@/lib/appwrite-profiles";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";
import { compressedResponse } from "@/lib/api-compression";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { normalizeStatus } from "@/lib/status-normalization";

const env = getEnvConfig();

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

        const { databases } = getServerClient();

        // Fetch all visible profiles and statuses in parallel using batched reads.
        const fetchStartTime = Date.now();
        const [profilesResult, statusesResult] =
            visibleUserIds.length === 0
                ? [{ documents: [] }, { documents: [] }]
                : await Promise.all([
                      databases.listDocuments(
                          env.databaseId,
                          env.collections.profiles,
                          [
                              Query.equal("userId", visibleUserIds),
                              Query.limit(visibleUserIds.length),
                          ],
                      ),
                      databases
                          .listDocuments(
                              env.databaseId,
                              env.collections.statuses,
                              [
                                  Query.equal("userId", visibleUserIds),
                                  Query.limit(visibleUserIds.length),
                              ],
                          )
                          .catch(() => ({ documents: [] })),
                  ]);

        const fetchDuration = Date.now() - fetchStartTime;
        const profilesByUserId = new Map(
            profilesResult.documents.map((document) => {
                const profile = document as Record<string, unknown>;
                return [String(profile.userId), profile] as const;
            }),
        );
        const avatarFramePresetIds = Array.from(
            new Set(
                profilesResult.documents.flatMap((document) => {
                    const profile = document as Record<string, unknown>;
                    return typeof profile.avatarFramePreset === "string"
                        ? [profile.avatarFramePreset]
                        : [];
                }),
            ),
        );
        const existingPredefinedAvatarFrameIds =
            await getExistingPredefinedAvatarFrameIds(avatarFramePresetIds);
        const statusesByUserId = new Map(
            statusesResult.documents.map((document) => {
                const status = document as Record<string, unknown>;
                const { normalized } = normalizeStatus(status);
                return [normalized.userId, normalized] as const;
            }),
        );

        // Convert results to a map for easy lookup
        const profilesMap: Record<string, unknown> = {};
        let successCount = 0;
        for (const userId of visibleUserIds) {
            const profile = profilesByUserId.get(userId);
            if (!profile) {
                continue;
            }

            const status = statusesByUserId.get(userId);
            const avatarFileId =
                typeof profile.avatarFileId === "string"
                    ? profile.avatarFileId
                    : undefined;
            const profileBackgroundImageFileId =
                typeof profile.profileBackgroundImageFileId === "string"
                    ? profile.profileBackgroundImageFileId
                    : undefined;
            const avatarFramePreset =
                typeof profile.avatarFramePreset === "string"
                    ? profile.avatarFramePreset
                    : undefined;
            const hasPredefinedFrame =
                avatarFramePreset &&
                existingPredefinedAvatarFrameIds.has(avatarFramePreset);

            profilesMap[userId] = {
                userId,
                displayName:
                    typeof profile.displayName === "string"
                        ? profile.displayName
                        : undefined,
                bio: typeof profile.bio === "string" ? profile.bio : undefined,
                pronouns:
                    typeof profile.pronouns === "string"
                        ? profile.pronouns
                        : undefined,
                location:
                    typeof profile.location === "string"
                        ? profile.location
                        : undefined,
                website:
                    typeof profile.website === "string"
                        ? profile.website
                        : undefined,
                avatarFileId,
                avatarUrl: avatarFileId
                    ? getAvatarUrl(avatarFileId)
                    : undefined,
                profileBackgroundColor:
                    typeof profile.profileBackgroundColor === "string"
                        ? profile.profileBackgroundColor
                        : undefined,
                profileBackgroundGradient:
                    typeof profile.profileBackgroundGradient === "string"
                        ? profile.profileBackgroundGradient
                        : undefined,
                profileBackgroundImageFileId,
                profileBackgroundUrl: profileBackgroundImageFileId
                    ? getProfileBackgroundUrl(profileBackgroundImageFileId)
                    : undefined,
                avatarFramePreset,
                avatarFrameUrl: hasPredefinedFrame
                    ? getPredefinedAvatarFrameUrlByPresetId(avatarFramePreset)
                    : undefined,
                status: status
                    ? {
                          status: status.status,
                          customMessage: status.customMessage,
                          lastSeenAt: status.lastSeenAt,
                      }
                    : undefined,
            };
            successCount++;
        }

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

        return compressedResponse({
            profiles: profilesMap,
            visibleUserIds,
        });
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
