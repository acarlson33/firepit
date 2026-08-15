import { ID, Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import { getBrowserDatabases } from "./appwrite-core";
import { listPages } from "./appwrite-pagination";
import { logger } from "./newrelic-utils";

const ROLES_COLLECTION_ID = "roles";
const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";

/**
 * Updates role member count.
 *
 * @param {Databases} databases - The databases value.
 * @param {string} databaseId - The database id value.
 * @param {string} roleId - The role id value.
 * @param {string} serverId - The server id value.
 * @returns {Promise<void>} The return value.
 */
async function updateRoleMemberCount(
    databases: Databases,
    databaseId: string,
    roleId: string,
    serverId: string,
): Promise<void> {
    try {
        const result = await databases.listDocuments(
            databaseId,
            ROLE_ASSIGNMENTS_COLLECTION_ID,
            [
                Query.equal("serverId", serverId),
                Query.containsAny("roleIds", [roleId]),
                Query.limit(1),
            ],
        );

        await databases.updateDocument(databaseId, ROLES_COLLECTION_ID, roleId, {
            memberCount: result.total,
        });
    } catch (error) {
        logger.warn("Failed to update role member count", {
            roleId,
            serverId,
            errorMessage:
                error instanceof Error ? error.message : String(error),
        });
    }
}

function isDuplicateConstraintError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { type?: unknown; code?: unknown };
    if (typeof candidate.code === "number" && candidate.code === 409) {
        return true;
    }
    if (typeof candidate.type !== "string") {
        return false;
    }

    return (
        candidate.type === "row_already_exists" ||
        candidate.type === "document_already_exists"
    );
}

async function findRoleAssignment(
    databases: Databases,
    databaseId: string,
    serverId: string,
    userId: string,
): Promise<Record<string, unknown> | null> {
    const result = await databases.listDocuments(
        databaseId,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
        ],
    );
    return result.documents[0]
        ? (result.documents[0] as unknown as Record<string, unknown>)
        : null;
}

// Merges a role into the user's assignment; tolerant of concurrent writers via
// a unique (serverId, userId) index on role_assignments (create in the
// Appwrite console). The create-race winner is the only successful create;
// losers re-read and merge into the winner's document.
async function ensureRoleInAssignment(
    databases: Databases,
    databaseId: string,
    serverId: string,
    userId: string,
    roleId: string,
): Promise<void> {
    const mergeInto = async (assignment: Record<string, unknown>) => {
        const currentRoleIds = Array.isArray(assignment.roleIds)
            ? (assignment.roleIds as string[])
            : [];
        if (currentRoleIds.includes(roleId)) {
            return;
        }
        await databases.updateDocument(
            databaseId,
            ROLE_ASSIGNMENTS_COLLECTION_ID,
            String(assignment.$id),
            { roleIds: [...currentRoleIds, roleId] },
        );
    };

    const existing = await findRoleAssignment(
        databases,
        databaseId,
        serverId,
        userId,
    );
    if (existing) {
        await mergeInto(existing);
        return;
    }

    try {
        await databases.createDocument(
            databaseId,
            ROLE_ASSIGNMENTS_COLLECTION_ID,
            ID.unique(),
            {
                userId,
                serverId,
                roleIds: [roleId],
            },
        );
    } catch (error) {
        if (!isDuplicateConstraintError(error)) {
            throw error;
        }
        const raced = await findRoleAssignment(
            databases,
            databaseId,
            serverId,
            userId,
        );
        if (raced) {
            await mergeInto(raced);
        }
    }
}

/**
 * Handles apply default role.
 *
 * @param {Databases} databases - The databases value.
 * @param {string} databaseId - The database id value.
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<boolean>} The return value.
 */
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

    try {
        await ensureRoleInAssignment(
            databases,
            databaseId,
            serverId,
            userId,
            defaultRoleId,
        );
    } catch (error) {
        logger.warn("Failed to apply default role assignment", {
            serverId,
            userId,
            defaultRoleId,
            errorMessage:
                error instanceof Error ? error.message : String(error),
        });
        return false;
    }

    await updateRoleMemberCount(databases, databaseId, defaultRoleId, serverId);
    return true;
}

/**
 * Handles assign default role server.
 *
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<boolean>} The return value.
 */
export async function assignDefaultRoleServer(
    serverId: string,
    userId: string,
): Promise<boolean> {
    const { databaseId } = getEnvConfig();
    const { databases } = getServerClient();
    return applyDefaultRole(databases, databaseId, serverId, userId);
}

/**
 * Handles assign default role browser.
 *
 * @param {string} serverId - The server id value.
 * @param {string} userId - The user id value.
 * @returns {Promise<boolean>} The return value.
 */
export async function assignDefaultRoleBrowser(
    serverId: string,
    userId: string,
): Promise<boolean> {
    const { databaseId } = getEnvConfig();
    const databases = getBrowserDatabases();
    return applyDefaultRole(databases as unknown as Databases, databaseId, serverId, userId);
}

/**
 * Handles enforce single default role.
 *
 * @param {Databases} databases - The databases value.
 * @param {string} databaseId - The database id value.
 * @param {string} serverId - The server id value.
 * @param {string} keepRoleId - The keep role id value.
 * @returns {Promise<void>} The return value.
 */
export async function enforceSingleDefaultRole(
    databases: Databases,
    databaseId: string,
    serverId: string,
    keepRoleId: string,
): Promise<void> {
    const existingDefaults = await listPages({
        databases,
        databaseId,
        collectionId: ROLES_COLLECTION_ID,
        baseQueries: [
            Query.equal("serverId", serverId),
            Query.equal("defaultOnJoin", true),
        ],
        pageSize: 100,
        warningContext: "enforceSingleDefaultRole",
    });

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
