import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";
import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { getServerClient } from "@/lib/appwrite-server";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const membershipsCollectionId = env.collections.memberships || "memberships";
const profilesCollectionId = env.collections.profiles || "profiles";
const roleAssignmentsCollectionId = "role_assignments";
const bannedUsersCollectionId = env.collections.bannedUsers || "banned_users";
const mutedUsersCollectionId = env.collections.mutedUsers || "muted_users";

type RouteContext = {
    params: Promise<{ serverId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const { serverId } = await context.params;
        const { databases } = getServerClient();

        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageRoles) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Get all memberships for this server
        const memberships = await databases.listDocuments(
            databaseId,
            membershipsCollectionId,
            [Query.equal("serverId", serverId), Query.limit(100)],
        );

        const membershipUserIds = memberships.documents.map((membership) =>
            String(membership.userId),
        );

        // Get role assignments for this server
        const roleAssignments = await databases.listDocuments(
            databaseId,
            roleAssignmentsCollectionId,
            [Query.equal("serverId", serverId), Query.limit(100)],
        );

        // Get banned/muted status for this server
        const bannedUsers = await databases.listDocuments(
            databaseId,
            bannedUsersCollectionId,
            [Query.equal("serverId", serverId), Query.limit(5000)],
        );

        const mutedUsers = await databases.listDocuments(
            databaseId,
            mutedUsersCollectionId,
            [Query.equal("serverId", serverId), Query.limit(5000)],
        );

        // Create sets of banned/muted user IDs restricted to returned members
        const membershipIdSet = new Set(membershipUserIds);
        const bannedUserIds = new Set(
            bannedUsers.documents
                .map((doc) => String(doc.userId))
                .filter((id) => membershipIdSet.has(id)),
        );
        const mutedUserIds = new Set(
            mutedUsers.documents
                .map((doc) => String(doc.userId))
                .filter((id) => membershipIdSet.has(id)),
        );

        // Create a map of userId to roleIds
        const roleMap = new Map<string, string[]>();
        for (const assignment of roleAssignments.documents) {
            roleMap.set(
                assignment.userId as string,
                (assignment.roleIds as string[]) || [],
            );
        }

        const profilesResponse =
            membershipUserIds.length === 0
                ? { documents: [] }
                : await databases.listDocuments(
                      databaseId,
                      profilesCollectionId,
                      [
                          Query.equal("userId", membershipUserIds),
                          Query.limit(membershipUserIds.length),
                      ],
                  );
        const profilesByUserId = new Map(
            profilesResponse.documents.map((profile) => [
                String(profile.userId),
                profile,
            ]),
        );

        const members = [] as Array<{
            userId: string;
            userName?: string;
            displayName?: string;
            avatarUrl?: string;
            roleIds: string[];
            isBanned?: boolean;
            isMuted?: boolean;
        }>;

        for (const membership of memberships.documents) {
            const userId = membership.userId as string;
            try {
                const profile = profilesByUserId.get(userId);

                if (!profile) {
                    // User profile is gone (likely account deleted) — remove membership and any role assignments
                    await databases.deleteDocument(
                        databaseId,
                        membershipsCollectionId,
                        membership.$id,
                    );

                    const orphanAssignments = await databases.listDocuments(
                        databaseId,
                        roleAssignmentsCollectionId,
                        [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userId),
                            Query.limit(100),
                        ],
                    );

                    await Promise.all(
                        orphanAssignments.documents.map((assignment) =>
                            databases.deleteDocument(
                                databaseId,
                                roleAssignmentsCollectionId,
                                assignment.$id,
                            ),
                        ),
                    );

                    logger.info(
                        "Removed orphaned membership after user deletion",
                        {
                            serverId,
                            userId,
                        },
                    );
                    continue;
                }

                members.push({
                    userId,
                    userName: profile.userId as string,
                    displayName: profile.displayName as string | undefined,
                    avatarUrl: profile.avatarUrl as string | undefined,
                    roleIds: roleMap.get(userId) || [],
                    isBanned: bannedUserIds.has(userId),
                    isMuted: mutedUserIds.has(userId),
                });
            } catch (error) {
                logger.error("Failed to enrich membership", {
                    serverId,
                    userId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        return NextResponse.json({ members });
    } catch (error) {
        logger.error("Failed to list server members", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list server members" },
            { status: 500 },
        );
    }
}
