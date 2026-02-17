import { ID, Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import { getBrowserDatabases } from "./appwrite-core";

const ROLES_COLLECTION_ID = "roles";
const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";

async function updateRoleMemberCount(
    databases: Databases,
    databaseId: string,
    roleId: string,
    serverId: string,
): Promise<void> {
    try {
        const assignments = await databases.listDocuments(
            databaseId,
            ROLE_ASSIGNMENTS_COLLECTION_ID,
            [Query.equal("serverId", serverId), Query.limit(1000)],
        );

        const memberCount = assignments.documents.filter((doc) => {
            const roleIds = (doc.roleIds as string[] | undefined) ?? [];
            return roleIds.includes(roleId);
        }).length;

        await databases.updateDocument(databaseId, ROLES_COLLECTION_ID, roleId, {
            memberCount,
        });
    } catch {
        // Non-critical; ignore count update failures
    }
}

async function applyDefaultRole(
    databases: Databases,
    databaseId: string,
    serverId: string,
    userId: string,
): Promise<boolean> {
    // Fetch the default role for the server (highest position if multiple)
    const roles = await databases.listDocuments(databaseId, ROLES_COLLECTION_ID, [
        Query.equal("serverId", serverId),
        Query.equal("defaultOnJoin", true),
        Query.orderDesc("position"),
        Query.limit(1),
    ]);

    const defaultRole = roles.documents[0];
    if (!defaultRole) {
        return false;
    }

    const defaultRoleId = String(defaultRole.$id);

    // Check existing role assignment for the user on this server
    const existingAssignments = await databases.listDocuments(
        databaseId,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        [Query.equal("serverId", serverId), Query.equal("userId", userId), Query.limit(1)],
    );

    if (existingAssignments.documents.length > 0) {
        const assignment = existingAssignments.documents[0];
        const currentRoleIds = (assignment.roleIds as string[] | undefined) ?? [];
        if (currentRoleIds.includes(defaultRoleId)) {
            return true;
        }
        const updatedRoleIds = [...currentRoleIds, defaultRoleId];
        await databases.updateDocument(
            databaseId,
            ROLE_ASSIGNMENTS_COLLECTION_ID,
            String(assignment.$id),
            { roleIds: updatedRoleIds },
        );
        await updateRoleMemberCount(databases, databaseId, defaultRoleId, serverId);
        return true;
    }

    await databases.createDocument(
        databaseId,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        ID.unique(),
        {
            userId,
            serverId,
            roleIds: [defaultRoleId],
        },
    );
    await updateRoleMemberCount(databases, databaseId, defaultRoleId, serverId);
    return true;
}

export async function assignDefaultRoleServer(
    serverId: string,
    userId: string,
): Promise<boolean> {
    const { databaseId } = getEnvConfig();
    const { databases } = getServerClient();
    return applyDefaultRole(databases, databaseId, serverId, userId);
}

export async function assignDefaultRoleBrowser(
    serverId: string,
    userId: string,
): Promise<boolean> {
    const { databaseId } = getEnvConfig();
    const databases = getBrowserDatabases();
    return applyDefaultRole(databases as unknown as Databases, databaseId, serverId, userId);
}

export async function enforceSingleDefaultRole(
    databases: Databases,
    databaseId: string,
    serverId: string,
    keepRoleId: string,
): Promise<void> {
    const existingDefaults = await databases.listDocuments(
        databaseId,
        ROLES_COLLECTION_ID,
        [
            Query.equal("serverId", serverId),
            Query.equal("defaultOnJoin", true),
            Query.limit(50),
        ],
    );

    const toDisable = existingDefaults.documents.filter(
        (doc) => String(doc.$id) !== keepRoleId,
    );

    await Promise.all(
        toDisable.map((doc) =>
            databases.updateDocument(databaseId, ROLES_COLLECTION_ID, String(doc.$id), {
                defaultOnJoin: false,
            }),
        ),
    );
}
