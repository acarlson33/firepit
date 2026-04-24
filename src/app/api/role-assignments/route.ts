import { ID, Query } from "node-appwrite";
import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { listPages } from "@/lib/appwrite-pagination";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const roleAssignmentsCollectionId = "role_assignments";
const rolesCollectionId = "roles";
const membershipsCollectionId = env.collections.memberships || "memberships";
const profilesCollectionId = env.collections.profiles || "profiles";
const QUERY_ARRAY_LIMIT = 100;

function getDatabases() {
    return getServerClient().databases;
}

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

async function requireManageRolesAccess(serverId: string) {
    const databases = getDatabases();
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

    return null;
}

async function listRoleAssignmentsForServer(params: {
    canQueryContains: boolean;
    databases: ReturnType<typeof getDatabases>;
    pageSize: number;
    roleId?: string | null;
    serverId: string;
}) {
    const { canQueryContains, databases, pageSize, roleId, serverId } = params;
    const baseQueries: string[] = [Query.equal("serverId", serverId)];

    if (roleId && canQueryContains) {
        baseQueries.push(Query.contains("roleIds", [roleId]));
    }

    const { documents, truncated } = await listPages({
        databases,
        databaseId,
        collectionId: roleAssignmentsCollectionId,
        baseQueries,
        pageSize,
        warningContext: "role-assignments",
    });

    if (roleId && !canQueryContains) {
        const filteredDocuments = documents.filter((document) => {
            const roleIds = Array.isArray(document.roleIds)
                ? (document.roleIds as string[])
                : [];
            return roleIds.includes(roleId);
        });

        return {
            documents: filteredDocuments,
            total: filteredDocuments.length,
            truncated,
        };
    }

    return {
        documents,
        truncated,
    };
}

async function updateRoleMemberCount(roleId: string, serverId: string): Promise<void> {
    try {
        const databases = getDatabases();
        const canQueryContains = typeof Query.contains === "function";
        let memberCount: number | null = null;

        if (canQueryContains) {
            try {
                const res = await databases.listDocuments(
                    databaseId,
                    roleAssignmentsCollectionId,
                    [
                        Query.equal("serverId", serverId),
                        Query.contains("roleIds", [roleId]),
                        Query.limit(1),
                    ],
                );
                memberCount = typeof res.total === "number" ? res.total : 0;
            } catch (error) {
                logger.warn("Failed to query role assignment count using contains", {
                    roleId,
                    serverId,
                    error: error instanceof Error ? error.message : String(error),
                });
                memberCount = null;
            }
        } else {
            const pagedRoleAssignments = await listRoleAssignmentsForServer({
                canQueryContains,
                databases,
                pageSize: 100,
                roleId,
                serverId,
            });

            if (pagedRoleAssignments.truncated) {
                logger.warn(
                    "Skipping role memberCount update due to truncated role assignment pagination",
                    { roleId, serverId },
                );
                memberCount = null;
            } else {
                memberCount = pagedRoleAssignments.documents.length;
            }
        }

        if (memberCount === null) {
            return;
        }

        await databases.updateDocument(databaseId, rolesCollectionId, roleId, {
            memberCount,
        });
    } catch (error) {
        logger.error("Failed to update role member count", {
            roleId,
            serverId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export async function GET(request: NextRequest) {
    try {
        const databases = getDatabases();
        const canQueryContains = typeof Query.contains === "function";
        const { searchParams } = new URL(request.url);
        const serverId = searchParams.get("serverId");
        const roleId = searchParams.get("roleId");
        const userId = searchParams.get("userId");

        if (!serverId) {
            return NextResponse.json({ error: "serverId is required" }, { status: 400 });
        }

        const authError = await requireManageRolesAccess(serverId);
        if (authError) {
            return authError;
        }

        if (roleId) {
            const roleAssignmentsResult = await listRoleAssignmentsForServer({
                canQueryContains,
                databases,
                pageSize: 100,
                roleId,
                serverId,
            });
            const roleAssignments = roleAssignmentsResult.documents;

            const profileUserIds = roleAssignments.map((assignment) => String(assignment.userId));
            const profileChunks = chunkValues(profileUserIds, QUERY_ARRAY_LIMIT);
            const profileDocuments =
                profileChunks.length === 0
                    ? []
                    : (
                          await Promise.all(
                              profileChunks.map((profileUserIdChunk) =>
                                  databases.listDocuments(
                                      databaseId,
                                      profilesCollectionId,
                                      [
                                          Query.equal("userId", profileUserIdChunk),
                                          Query.limit(profileUserIdChunk.length),
                                      ],
                                  ),
                              ),
                          )
                      ).flatMap((profilePage) => profilePage.documents);

            const profilesByUserId = new Map(
                profileDocuments.map((profile) => [String(profile.userId), profile]),
            );

            const members = roleAssignments.map((assignment) => {
                const profile = profilesByUserId.get(String(assignment.userId));
                return {
                    userId: assignment.userId,
                    displayName: profile?.displayName,
                    userName: profile?.userId,
                    avatarUrl: profile?.avatarUrl,
                    roleIds: assignment.roleIds as string[],
                };
            });

            return NextResponse.json({
                members,
                ...(roleAssignmentsResult.total !== undefined ? { total: roleAssignmentsResult.total } : {}),
                truncated: roleAssignmentsResult.truncated,
            });
        }

        if (userId) {
            const userAssignments = await databases.listDocuments(
                databaseId,
                roleAssignmentsCollectionId,
                [
                    Query.equal("serverId", serverId),
                    Query.equal("userId", userId),
                ],
            );

            return NextResponse.json({ assignments: userAssignments.documents });
        }

        const assignments = await listPages({
            databases,
            databaseId,
            collectionId: roleAssignmentsCollectionId,
            baseQueries: [Query.equal("serverId", serverId)],
            pageSize: 100,
            warningContext: "role-assignments-all",
        });

        return NextResponse.json({
            assignments: assignments.documents,
            truncated: assignments.truncated,
        });
    } catch (error) {
        logger.error("Failed to list role assignments", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: "Failed to list role assignments" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const databases = getDatabases();
        const body = await request.json();
        const { userId, serverId, roleId } = body;

        if (!userId || !serverId || !roleId) {
            return NextResponse.json(
                { error: "userId, serverId, and roleId are required" },
                { status: 400 },
            );
        }

        const authError = await requireManageRolesAccess(serverId);
        if (authError) {
            return authError;
        }

        const memberships = await databases.listDocuments(
            databaseId,
            membershipsCollectionId,
            [
                Query.equal("userId", userId),
                Query.equal("serverId", serverId),
                Query.limit(1),
            ],
        );

        if (memberships.documents.length === 0) {
            return NextResponse.json(
                { error: "User is not a member of this server" },
                { status: 400 },
            );
        }

        const existing = await databases.listDocuments(
            databaseId,
            roleAssignmentsCollectionId,
            [
                Query.equal("userId", userId),
                Query.equal("serverId", serverId),
                Query.limit(1),
            ],
        );

        if (existing.documents.length > 0) {
            const assignment = existing.documents[0];
            const currentRoleIds = (assignment.roleIds as string[]) || [];

            if (currentRoleIds.includes(roleId)) {
                return NextResponse.json(
                    { error: "User already has this role" },
                    { status: 400 },
                );
            }

            const updatedAssignment = await databases.updateDocument(
                databaseId,
                roleAssignmentsCollectionId,
                assignment.$id,
                { roleIds: [...currentRoleIds, roleId] },
            );

            await updateRoleMemberCount(roleId, serverId);

            return NextResponse.json({ assignment: updatedAssignment });
        }

        const assignment = await databases.createDocument(
            databaseId,
            roleAssignmentsCollectionId,
            ID.unique(),
            { userId, serverId, roleIds: [roleId] },
        );

        await updateRoleMemberCount(roleId, serverId);

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error) {
        logger.error("Failed to assign role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: "Failed to assign role" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const databases = getDatabases();
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");
        const serverId = searchParams.get("serverId");
        const roleId = searchParams.get("roleId");

        if (!userId || !serverId || !roleId) {
            return NextResponse.json(
                { error: "userId, serverId, and roleId are required" },
                { status: 400 },
            );
        }

        const authError = await requireManageRolesAccess(serverId);
        if (authError) {
            return authError;
        }

        const assignments = await databases.listDocuments(
            databaseId,
            roleAssignmentsCollectionId,
            [
                Query.equal("userId", userId),
                Query.equal("serverId", serverId),
                Query.limit(1),
            ],
        );

        if (assignments.documents.length === 0) {
            return NextResponse.json(
                { error: "Role assignment not found" },
                { status: 404 },
            );
        }

        const assignment = assignments.documents[0];
        const currentRoleIds = (assignment.roleIds as string[]) || [];
        const updatedRoleIds = currentRoleIds.filter((id) => id !== roleId);

        if (updatedRoleIds.length === currentRoleIds.length) {
            return NextResponse.json(
                { error: "User does not have this role" },
                { status: 400 },
            );
        }

        if (updatedRoleIds.length === 0) {
            await databases.deleteDocument(
                databaseId,
                roleAssignmentsCollectionId,
                assignment.$id,
            );
        } else {
            await databases.updateDocument(
                databaseId,
                roleAssignmentsCollectionId,
                assignment.$id,
                { roleIds: updatedRoleIds },
            );
        }

        await updateRoleMemberCount(roleId, serverId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to remove role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: "Failed to remove role" }, { status: 500 });
    }
}
