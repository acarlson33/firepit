import { ID, Query } from "node-appwrite";
import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { listPages } from "@/lib/appwrite-pagination";
import { logger,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { invalidateChannelsUserCaches } from "@/lib/channels-route-cache";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";

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

function isConflictError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }

    const candidate = error as { code?: number; message?: string };
    if (candidate.code === 409) {
        return true;
    }

    return typeof candidate.message === "string"
        ? candidate.message.toLowerCase().includes("already exists")
        : false;
}

async function requireManageRolesAccess(serverId: string) {
    const databases = getDatabases();
    const session = await getServerSession();
    if (!session?.$id) {
        return returnUnauthorized();
    }

    const access = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        session.$id,
    );

    if (!access.isMember || !access.permissions.manageRoles) {
        return returnForbidden();
    }

    return null;
}

// Verifies the target role exists and belongs to the given server, so a
// request can never assign or remove a role from a different server.
async function validateRoleBelongsToServer(
    roleId: string,
    serverId: string,
): Promise<NextResponse | null> {
    const databases = getDatabases();
    let roleDocument: unknown;
    try {
        roleDocument = await databases.getDocument(
            databaseId,
            rolesCollectionId,
            roleId,
        );
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return NextResponse.json(
                { error: "Role not found" },
                { status: 404 },
            );
        }
        throw error;
    }

    if (String((roleDocument as { serverId?: unknown }).serverId) !== serverId) {
        return NextResponse.json(
            { error: "Role does not belong to this server" },
            { status: 400 },
        );
    }

    return null;
}

async function listRoleAssignmentsForServer(params: {
    databases: ReturnType<typeof getDatabases>;
    pageSize: number;
    roleId?: string | null;
    serverId: string;
}) {
    const { databases, pageSize, roleId, serverId } = params;
    const baseQueries: string[] = [Query.equal("serverId", serverId)];

    if (roleId) {
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

    return {
        documents,
        total: documents.length,
        truncated,
    };
}

async function enrichAssignmentsWithProfiles(
    databases: ReturnType<typeof getDatabases>,
    assignments: Array<Record<string, unknown>>,
) {
    const validAssignments = assignments.filter(
        (assignment) =>
            typeof assignment.userId === "string" &&
            assignment.userId.length > 0,
    );

    const profileUserIds = validAssignments.map(
        (assignment) => assignment.userId,
    ) as string[];
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
                                  Query.limit(QUERY_ARRAY_LIMIT),
                              ],
                          ),
                      ),
                  )
              ).flatMap((profilePage) => profilePage.documents);

    const profilesByUserId = new Map(
        profileDocuments.map((profile) => [String(profile.userId), profile]),
    );

    return validAssignments.map((assignment) => {
        const profile = profilesByUserId.get(String(assignment.userId));
        return {
            userId: assignment.userId,
            displayName: profile?.displayName,
            userName: profile?.userName,
            avatarUrl: profile?.avatarUrl,
            roleIds: assignment.roleIds as string[],
        };
    });
}

async function updateRoleMemberCount(roleId: string, serverId: string): Promise<void> {
    try {
        const databases = getDatabases();
        let memberCount: number | null = null;

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
                databases,
                pageSize: 100,
                roleId,
                serverId,
            });
            const members = await enrichAssignmentsWithProfiles(
                databases,
                roleAssignmentsResult.documents,
            );

            return NextResponse.json({
                members,
                total: roleAssignmentsResult.total,
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
                    Query.limit(1),
                ],
            );
            const members = await enrichAssignmentsWithProfiles(
                databases,
                userAssignments.documents,
            );

            return NextResponse.json({
                members,
                total: userAssignments.documents.length,
                truncated: false,
            });
        }

        const assignmentsResult = await listPages({
            databases,
            databaseId,
            collectionId: roleAssignmentsCollectionId,
            baseQueries: [Query.equal("serverId", serverId)],
            pageSize: 100,
            warningContext: "role-assignments-all",
        });

        const members = await enrichAssignmentsWithProfiles(
            databases,
            assignmentsResult.documents,
        );

        return NextResponse.json({
            members,
            total: assignmentsResult.documents.length,
            truncated: assignmentsResult.truncated,
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

        const roleError = await validateRoleBelongsToServer(roleId, serverId);
        if (roleError) {
            return roleError;
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

            invalidateChannelsUserCaches({
                serverId,
                userId,
            });

            await updateRoleMemberCount(roleId, serverId);

            return NextResponse.json({ assignment: updatedAssignment });
        }

        let assignment;
        try {
            assignment = await databases.createDocument(
                databaseId,
                roleAssignmentsCollectionId,
                ID.unique(),
                { userId, serverId, roleIds: [roleId] },
            );
        } catch (error) {
            // The (userId, serverId) unique index means a concurrent request
            // may have created the assignment first. Re-read and update it.
            if (!isConflictError(error)) {
                throw error;
            }

            const raced = await databases.listDocuments(
                databaseId,
                roleAssignmentsCollectionId,
                [
                    Query.equal("userId", userId),
                    Query.equal("serverId", serverId),
                    Query.limit(1),
                ],
            );
            if (raced.documents.length === 0) {
                throw error;
            }

            const racedAssignment = raced.documents[0];
            const racedRoleIds =
                (racedAssignment.roleIds as string[]) || [];
            if (racedRoleIds.includes(roleId)) {
                return NextResponse.json(
                    { error: "User already has this role" },
                    { status: 400 },
                );
            }

            assignment = await databases.updateDocument(
                databaseId,
                roleAssignmentsCollectionId,
                racedAssignment.$id,
                { roleIds: [...racedRoleIds, roleId] },
            );
        }

        invalidateChannelsUserCaches({
            serverId,
            userId,
        });

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

        const roleError = await validateRoleBelongsToServer(roleId, serverId);
        if (roleError) {
            return roleError;
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

        invalidateChannelsUserCaches({
            serverId,
            userId,
        });

        await updateRoleMemberCount(roleId, serverId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to remove role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: "Failed to remove role" }, { status: 500 });
    }
}
