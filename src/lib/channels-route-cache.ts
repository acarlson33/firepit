import { apiCache } from "@/lib/cache-utils";

export function channelsMembershipCacheKey(
    serverId: string,
    userId: string,
): string {
    return `api:channels:membership:${serverId}:${userId}`;
}

export function channelsRoleAssignmentCacheKey(
    serverId: string,
    userId: string,
): string {
    return `api:channels:role-assignment:${serverId}:${userId}`;
}

export function invalidateChannelsServerCaches(serverId: string): void {
    apiCache.clear(`api:channels:server:${serverId}`);
    apiCache.clearPrefix(`api:channels:list:${serverId}:`);
    apiCache.clearPrefix(`api:channels:overrides:${serverId}:`);
    apiCache.clearPrefix(`api:channels:roles:${serverId}:`);
}

export function invalidateChannelsUserCaches(params: {
    serverId: string;
    userId: string;
}): void {
    const { serverId, userId } = params;
    apiCache.clear(channelsMembershipCacheKey(serverId, userId));
    apiCache.clear(channelsRoleAssignmentCacheKey(serverId, userId));
    invalidateChannelsServerCaches(serverId);
}
