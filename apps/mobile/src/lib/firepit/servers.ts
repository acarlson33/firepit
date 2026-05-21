import { firepitRequest } from "@/lib/firepit/http";
import type {
    ChannelListResponse,
    JoinResponse,
    PublicServerListResponse,
    ServerResponse,
    ServerListResponse,
} from "@/lib/firepit/types";

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
