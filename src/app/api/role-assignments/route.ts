import { NextResponse, type NextRequest } from "next/server";
import { Query, ID } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { getServerClient } from "@/lib/appwrite-server";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const roleAssignmentsCollectionId = "role_assignments";
const rolesCollectionId = "roles";
const membershipsCollectionId = env.collections.memberships || "memberships";
const profilesCollectionId = env.collections.profiles || "profiles";

function getDatabases() {
    return getServerClient().databases;
}

type QueryWithPagination = typeof Query & {
    cursorAfter?: (cursor: string) => string;
    orderAsc?: (field: string) => string;
};

async function listRoleAssignmentsForServer(params: {
    canQueryContains: boolean;
    databases: ReturnType<typeof getDatabases>;
    pageSize: number;
    roleId?: string;
    serverId: string;
}) {
    const { canQueryContains, databases, pageSize, roleId, serverId } = params;
    const documents: Array<Record<string, unknown>> = [];
    const queryWithPagination = Query as QueryWithPagination;
    const supportsCursorAfter =
        typeof queryWithPagination.cursorAfter === "function";
    let cursorAfter: string | null = null;

    while (true) {
        const pageQueries = [
            Query.equal("serverId", serverId),
            ...(roleId && canQueryContains
                ? [Query.contains("roleIds", [roleId])]
                : []),
            ...(typeof queryWithPagination.orderAsc === "function"
                ? [queryWithPagination.orderAsc("$id")]
                : []),
            Query.limit(pageSize),
            ...(cursorAfter && supportsCursorAfter
                ? [queryWithPagination.cursorAfter(cursorAfter)]
                : []),
        ];

        const response = await databases.listDocuments(
            databaseId,
            roleAssignmentsCollectionId,
            pageQueries,
        );

        if (roleId && !canQueryContains) {
            for (const document of response.documents) {
                const roleIds = Array.isArray(document.roleIds)
                    ? (document.roleIds as string[])
                    : [];
                if (roleIds.includes(roleId)) {
                    documents.push(document as Record<string, unknown>);
                }
            }
        } else {
            for (const document of response.documents) {
                documents.push(document as Record<string, unknown>);
            }
        }

        if (response.documents.length < pageSize) {
            break;
        }

        if (!supportsCursorAfter) {
            logger.warn(
                "Role assignment pagination cursor helper unavailable; stopping after first full page",
                {
                    pageSize,
                    roleId,
                    serverId,
                },
            );
            break;
        }

        const lastDocument = response.documents.at(-1);
        cursorAfter =
            lastDocument && typeof lastDocument.$id === "string"
                ? lastDocument.$id
                : null;

        if (!cursorAfter) {
            break;
        }
    }

    return documents;
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

// Helper function to update role member count
async function updateRoleMemberCount(
    roleId: string,
    serverId: string,
): Promise<void> {
    try {
        const databases = getDatabases();
        const canQueryContains = typeof Query.contains === "function";
        const memberCount = canQueryContains
            ? (
                  await databases.listDocuments(
                      databaseId,
                      roleAssignmentsCollectionId,
                      [
                          Query.equal("serverId", serverId),
                          Query.contains("roleIds", [roleId]),
                          Query.limit(1),
                      ],
                  )
              ).total
            : (
                  await listRoleAssignmentsForServer({
                      canQueryContains,
                      databases,
                      pageSize: 100,
                      roleId,
                      serverId,
                  })
              ).length;

        // Update role document
        await databases.updateDocument(databaseId, rolesCollectionId, roleId, {
            memberCount,
        });
    } catch (error) {
        logger.error("Failed to update role member count", {
            roleId,
            serverId,
            error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - this is a non-critical update
    }
}

// GET: List role assignments
export async function GET(request: NextRequest) {
    try {
        const databases = getDatabases();
        const canQueryContains = typeof Query.contains === "function";
        const { searchParams } = new URL(request.url);
        const serverId = searchParams.get("serverId");
        const roleId = searchParams.get("roleId");
        const userId = searchParams.get("userId");

        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        const authError = await requireManageRolesAccess(serverId);
        if (authError) {
            return authError;
        }

        const queries = [
            Query.equal("serverId", serverId),
            Query.limit(100),
        ];

        if (roleId) {
            const roleAssignments = await listRoleAssignmentsForServer({
                canQueryContains,
                databases,
                pageSize: 100,
                roleId,
                serverId,
            });

            const profileUserIds = roleAssignments.map((assignment) =>
                String(assignment.userId),
            );
            const profiles =
                profileUserIds.length === 0
                    ? { documents: [] }
                    : await databases.listDocuments(
                          databaseId,
                          profilesCollectionId,
                          [
                              Query.equal("userId", profileUserIds),
                              Query.limit(profileUserIds.length),
                          ],
                      );
            const profilesByUserId = new Map(
                profiles.documents.map((profile) => [
                    String(profile.userId),
                    profile,
                ]),
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

            return NextResponse.json({ members });
        }

        if (userId) {
            // Get roles for a specific user
            const userAssignments = await databases.listDocuments(
                databaseId,
                roleAssignmentsCollectionId,
                [...queries, Query.equal("userId", userId)],
            );

            return NextResponse.json({
                assignments: userAssignments.documents,
            });
        }

        // Get all assignments
        const assignments = await databases.listDocuments(
            databaseId,
            roleAssignmentsCollectionId,
            queries,
        );

        return NextResponse.json({ assignments: assignments.documents });
    } catch (error) {
        logger.error("Failed to list role assignments", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list role assignments" },
            { status: 500 },
        );
    }
}

// POST: Assign role to user
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

        // Check if user is a member of the server
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

        // Check if assignment already exists
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
            // Update existing assignment
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

            // Update role member count
            await updateRoleMemberCount(roleId, serverId);

            return NextResponse.json({ assignment: updatedAssignment });
        }

        // Create new assignment
        const assignment = await databases.createDocument(
            databaseId,
            roleAssignmentsCollectionId,
            ID.unique(),
            {
                userId,
                serverId,
                roleIds: [roleId],
            },
        );

        // Update role member count
        await updateRoleMemberCount(roleId, serverId);

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error) {
        logger.error("Failed to assign role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to assign role" },
            { status: 500 },
        );
    }
}

// DELETE: Remove role from user
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

        // Find the assignment
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
            // Delete the assignment if no roles left
            await databases.deleteDocument(
                databaseId,
                roleAssignmentsCollectionId,
                assignment.$id,
            );
        } else {
            // Update with remaining roles
            await databases.updateDocument(
                databaseId,
                roleAssignmentsCollectionId,
                assignment.$id,
                { roleIds: updatedRoleIds },
            );
        }

        // Update role member count
        await updateRoleMemberCount(roleId, serverId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to remove role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to remove role" },
            { status: 500 },
        );
    }
}
