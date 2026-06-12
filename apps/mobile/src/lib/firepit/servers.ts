import { firepitRequest } from "@/lib/firepit/http";
import type {
    CategoryListResponse,
    CategoryResponse,
    ChannelListResponse,
    ChannelPermissionOverridesResponse,
    ChannelResponse,
    CreateServerInput,
    CreateServerResponse,
    InviteJoinResponse,
    InvitePreviewResponse,
    JoinResponse,
    PublicServerListResponse,
    RoleAssignmentListResponse,
    RoleListResponse,
    RoleResponse,
    ServerAuditLogResponse,
    ServerListResponse,
    ServerModerationResponse,
    ServerResponse,
    ServerStatsResponse,
} from "@/lib/firepit/types";

export async function createChannel(
    baseUrl: string,
    token: string,
    input: {
        serverId: string;
        name: string;
        type?: "text" | "voice" | "announcement";
        topic?: string;
        categoryId?: string | null;
    },
) {
    return firepitRequest<ChannelResponse>({
        baseUrl,
        path: "/api/channels",
        method: "POST",
        token,
        body: input,
    });
}

export async function updateChannel(
    baseUrl: string,
    token: string,
    channelId: string,
    input: {
        name?: string;
        categoryId?: string | null;
        position?: number;
        type?: "text" | "voice" | "announcement";
        topic?: string | null;
    },
) {
    return firepitRequest<ChannelResponse>({
        baseUrl,
        path: `/api/channels/${encodeURIComponent(channelId)}`,
        method: "PATCH",
        token,
        body: input,
    });
}

export async function deleteChannel(
    baseUrl: string,
    token: string,
    channelId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/channels/${encodeURIComponent(channelId)}`,
        method: "DELETE",
        token,
    });
}

export async function fetchChannels(
    baseUrl: string,
    token: string,
    serverId: string,
    limit = 100,
) {
    return firepitRequest<ChannelListResponse>({
        baseUrl,
        path: "/api/channels",
        token,
        query: {
            serverId,
            limit,
        },
    });
}

export async function fetchMyServers(baseUrl: string, token: string) {
    return firepitRequest<ServerListResponse>({
        baseUrl,
        path: "/api/servers",
        token,
    });
}

export async function fetchServer(
    baseUrl: string,
    token: string,
    serverId: string,
) {
    return firepitRequest<ServerResponse>({
        baseUrl,
        path: `/api/servers/${serverId}`,
        token,
    });
}

export async function fetchPublicServers(baseUrl: string) {
    return firepitRequest<PublicServerListResponse>({
        baseUrl,
        path: "/api/servers/public",
    });
}

export async function createServer(
    baseUrl: string,
    token: string,
    input: CreateServerInput,
) {
    return firepitRequest<CreateServerResponse>({
        baseUrl,
        path: "/api/servers/create",
        method: "POST",
        token,
        body: input,
    });
}

export async function fetchInvitePreview(baseUrl: string, code: string) {
    return firepitRequest<InvitePreviewResponse>({
        baseUrl,
        path: `/api/invites/${encodeURIComponent(code)}`,
    });
}

export async function joinInvite(baseUrl: string, token: string, code: string) {
    return firepitRequest<InviteJoinResponse>({
        baseUrl,
        path: `/api/invites/${encodeURIComponent(code)}/join`,
        method: "POST",
        token,
    });
}

export async function joinServer(
    baseUrl: string,
    token: string,
    serverId: string,
) {
    return firepitRequest<JoinResponse>({
        baseUrl,
        path: "/api/servers/join",
        method: "POST",
        token,
        body: { serverId },
    });
}

export async function fetchServerCategories(
    baseUrl: string,
    token: string,
    serverId: string,
) {
    return firepitRequest<CategoryListResponse>({
        baseUrl,
        path: "/api/categories",
        token,
        query: { serverId },
    });
}

export async function createServerCategory(
    baseUrl: string,
    token: string,
    serverId: string,
    name: string,
) {
    return firepitRequest<CategoryResponse>({
        baseUrl,
        path: "/api/categories",
        method: "POST",
        token,
        body: { serverId, name },
    });
}

export async function updateServerCategory(
    baseUrl: string,
    token: string,
    input: {
        categoryId: string;
        name?: string;
        position?: number;
        allowedRoleIds?: string[] | null;
    },
) {
    return firepitRequest<CategoryResponse>({
        baseUrl,
        path: "/api/categories",
        method: "PUT",
        token,
        body: input,
    });
}

export async function deleteServerCategory(
    baseUrl: string,
    token: string,
    categoryId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/categories",
        method: "DELETE",
        token,
        query: { categoryId },
    });
}

export async function fetchServerRoles(baseUrl: string, token: string, serverId: string) {
    return firepitRequest<RoleListResponse>({
        baseUrl,
        path: "/api/roles",
        token,
        query: { serverId },
    });
}

export async function createServerRole(
    baseUrl: string,
    token: string,
    input: {
        serverId: string;
        name: string;
        color?: string;
        position?: number;
        readMessages?: boolean;
        sendMessages?: boolean;
        manageMessages?: boolean;
        manageChannels?: boolean;
        manageRoles?: boolean;
        manageServer?: boolean;
        mentionEveryone?: boolean;
        administrator?: boolean;
        mentionable?: boolean;
        defaultOnJoin?: boolean;
    },
) {
    return firepitRequest<RoleResponse>({
        baseUrl,
        path: "/api/roles",
        method: "POST",
        token,
        body: input,
    });
}

export async function updateServerRole(
    baseUrl: string,
    token: string,
    input: { $id: string } & Record<string, unknown>,
) {
    return firepitRequest<RoleResponse>({
        baseUrl,
        path: "/api/roles",
        method: "PUT",
        token,
        body: input,
    });
}

export async function deleteServerRole(
    baseUrl: string,
    token: string,
    roleId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/roles",
        method: "DELETE",
        token,
        query: { roleId },
    });
}

export async function fetchRoleAssignments(
    baseUrl: string,
    token: string,
    params: { serverId: string; roleId?: string; userId?: string },
) {
    return firepitRequest<RoleAssignmentListResponse>({
        baseUrl,
        path: "/api/role-assignments",
        token,
        query: params,
    });
}

export async function assignRole(
    baseUrl: string,
    token: string,
    input: { serverId: string; userId: string; roleId: string },
) {
    return firepitRequest<RoleAssignmentListResponse>({
        baseUrl,
        path: "/api/role-assignments",
        method: "POST",
        token,
        body: input,
    });
}

export async function removeRoleAssignment(
    baseUrl: string,
    token: string,
    params: { serverId: string; userId: string; roleId: string },
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/role-assignments",
        method: "DELETE",
        token,
        query: params,
    });
}

export async function fetchChannelPermissionOverrides(
    baseUrl: string,
    token: string,
    channelId: string,
) {
    return firepitRequest<ChannelPermissionOverridesResponse>({
        baseUrl,
        path: "/api/channel-permissions",
        token,
        query: { channelId },
    });
}

export async function createChannelPermissionOverride(
    baseUrl: string,
    token: string,
    input: {
        channelId: string;
        roleId?: string;
        userId?: string;
        allow: string[];
        deny: string[];
    },
) {
    return firepitRequest<ChannelPermissionOverridesResponse>({
        baseUrl,
        path: "/api/channel-permissions",
        method: "POST",
        token,
        body: input,
    });
}

export async function updateChannelPermissionOverride(
    baseUrl: string,
    token: string,
    input: {
        overrideId: string;
        allow: string[];
        deny: string[];
    },
) {
    return firepitRequest<ChannelPermissionOverridesResponse>({
        baseUrl,
        path: "/api/channel-permissions",
        method: "PUT",
        token,
        body: input,
    });
}

export async function deleteChannelPermissionOverride(
    baseUrl: string,
    token: string,
    overrideId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/channel-permissions",
        method: "DELETE",
        token,
        query: { overrideId },
    });
}

export async function moderateServerMember(
    baseUrl: string,
    token: string,
    serverId: string,
    action: "ban" | "mute" | "kick" | "unban" | "unmute",
    userId: string,
    reason?: string,
) {
    return firepitRequest<ServerModerationResponse>({
        baseUrl,
        path: `/api/servers/${serverId}/moderation`,
        method: "POST",
        token,
        body: { action, userId, reason },
    });
}

export async function fetchServerAuditLogs(
    baseUrl: string,
    token: string,
    serverId: string,
    limit = 50,
) {
    return firepitRequest<ServerAuditLogResponse>({
        baseUrl,
        path: `/api/servers/${serverId}/audit-logs`,
        token,
        query: { limit },
    });
}

export async function fetchServerStats(baseUrl: string, token: string, serverId: string) {
    return firepitRequest<ServerStatsResponse>({
        baseUrl,
        path: `/api/servers/${serverId}/stats`,
        token,
    });
}

export async function fetchServerInvites(baseUrl: string, token: string, serverId: string) {
    return firepitRequest<{ invites?: Array<Record<string, unknown>> }>({
        baseUrl,
        path: `/api/servers/${serverId}/invites`,
        token,
    });
}
