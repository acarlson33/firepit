import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import type { EnvConfig } from "@/lib/appwrite-core";
import { getEffectivePermissions } from "@/lib/permissions";
import type {
    ChannelPermissionOverride,
    EffectivePermissions,
    Role,
} from "@/lib/types";

const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";
const ROLES_COLLECTION_ID = "roles";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID =
    "channel_permission_overrides";

type ChannelAccess = {
    serverId: string;
    isServerOwner: boolean;
    isMember: boolean;
    canRead: boolean;
    canSend: boolean;
};

type ServerAccess = {
    serverId: string;
    isServerOwner: boolean;
    isMember: boolean;
    permissions: EffectivePermissions;
};

function mapRoleDocument(doc: Record<string, unknown>): Role {
    return {
        $id: String(doc.$id),
        serverId: String(doc.serverId),
        name: String(doc.name),
        color: String(doc.color ?? "#6B7280"),
        position: typeof doc.position === "number" ? doc.position : 0,
        readMessages: Boolean(doc.readMessages),
        sendMessages: Boolean(doc.sendMessages),
        manageMessages: Boolean(doc.manageMessages),
        manageChannels: Boolean(doc.manageChannels),
        manageRoles: Boolean(doc.manageRoles),
        manageServer: Boolean(doc.manageServer),
        mentionEveryone: Boolean(doc.mentionEveryone),
        administrator: Boolean(doc.administrator),
        mentionable: Boolean(doc.mentionable),
        $createdAt: String(doc.$createdAt ?? ""),
        memberCount:
            typeof doc.memberCount === "number" ? doc.memberCount : undefined,
    } satisfies Role;
}

const NO_PERMISSIONS: EffectivePermissions = {
    readMessages: false,
    sendMessages: false,
    manageMessages: false,
    manageChannels: false,
    manageRoles: false,
    manageServer: false,
    mentionEveryone: false,
    administrator: false,
};

export async function getServerPermissionsForUser(
    databases: Databases,
    env: EnvConfig,
    serverId: string,
    userId: string,
): Promise<ServerAccess> {
    const server = await databases.getDocument(
        env.databaseId,
        env.collections.servers,
        serverId,
    );

    const isServerOwner = String(server.ownerId) === userId;
    if (isServerOwner) {
        return {
            serverId,
            isServerOwner: true,
            isMember: true,
            permissions: getEffectivePermissions([], [], true),
        };
    }

    const membership = await databases.listDocuments(
        env.databaseId,
        env.collections.memberships,
        [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
        ],
    );

    if (membership.documents.length === 0) {
        return {
            serverId,
            isServerOwner: false,
            isMember: false,
            permissions: NO_PERMISSIONS,
        };
    }

    const roleAssignment = await databases.listDocuments(
        env.databaseId,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
        ],
    );

    const roleIds =
        roleAssignment.documents.length > 0 &&
        Array.isArray(roleAssignment.documents[0].roleIds)
            ? (roleAssignment.documents[0].roleIds as string[])
            : [];

    const roles: Role[] =
        roleIds.length > 0
            ? (
                  await databases.listDocuments(
                      env.databaseId,
                      ROLES_COLLECTION_ID,
                      [
                          Query.equal("serverId", serverId),
                          Query.equal("$id", roleIds),
                          Query.limit(100),
                      ],
                  )
              ).documents.map((doc) =>
                  mapRoleDocument(doc as Record<string, unknown>),
              )
            : [];

    return {
        serverId,
        isServerOwner: false,
        isMember: true,
        permissions: getEffectivePermissions(roles, [], false),
    };
}

export async function getChannelAccessForUser(
    databases: Databases,
    env: EnvConfig,
    channelId: string,
    userId: string,
): Promise<ChannelAccess> {
    const channel = await databases.getDocument(
        env.databaseId,
        env.collections.channels,
        channelId,
    );

    const serverId = String(channel.serverId);
    const serverAccess = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        userId,
    );

    if (!serverAccess.isMember) {
        return {
            serverId,
            isServerOwner: serverAccess.isServerOwner,
            isMember: false,
            canRead: false,
            canSend: false,
        };
    }

    if (serverAccess.isServerOwner || serverAccess.permissions.administrator) {
        return {
            serverId,
            isServerOwner: serverAccess.isServerOwner,
            isMember: true,
            canRead: true,
            canSend: true,
        };
    }

    const roleAssignment = await databases.listDocuments(
        env.databaseId,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
        ],
    );

    const roleIds =
        roleAssignment.documents.length > 0 &&
        Array.isArray(roleAssignment.documents[0].roleIds)
            ? (roleAssignment.documents[0].roleIds as string[])
            : [];

    const overrides = await databases.listDocuments(
        env.databaseId,
        CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
        [Query.equal("channelId", channelId), Query.limit(1000)],
    );

    const applicableOverrides: ChannelPermissionOverride[] = overrides.documents
        .map((doc) => {
            const d = doc as Record<string, unknown>;
            const roleId = typeof d.roleId === "string" ? d.roleId : "";
            const overrideUserId = typeof d.userId === "string" ? d.userId : "";

            const appliesToUser = overrideUserId === userId;
            const appliesToRole = roleId !== "" && roleIds.includes(roleId);
            if (!appliesToUser && !appliesToRole) {
                return null;
            }

            return {
                $id: String(d.$id),
                channelId,
                roleId,
                userId: overrideUserId,
                allow: Array.isArray(d.allow)
                    ? (d.allow as ChannelPermissionOverride["allow"])
                    : [],
                deny: Array.isArray(d.deny)
                    ? (d.deny as ChannelPermissionOverride["deny"])
                    : [],
                $createdAt: String(d.$createdAt ?? ""),
            } satisfies ChannelPermissionOverride;
        })
        .filter((override): override is ChannelPermissionOverride =>
            Boolean(override),
        );

    const effective = getEffectivePermissions(
        roleIds.length > 0
            ? (
                  await databases.listDocuments(
                      env.databaseId,
                      ROLES_COLLECTION_ID,
                      [
                          Query.equal("serverId", serverId),
                          Query.equal("$id", roleIds),
                          Query.limit(100),
                      ],
                  )
              ).documents.map((doc) =>
                  mapRoleDocument(doc as Record<string, unknown>),
              )
            : [],
        applicableOverrides,
        false,
    );

    return {
        serverId,
        isServerOwner: false,
        isMember: true,
        canRead: effective.readMessages,
        canSend: effective.sendMessages,
    };
}
