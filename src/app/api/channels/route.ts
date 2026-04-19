import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Channel, ChannelPermissionOverride, Role } from "@/lib/types";
import { compressedResponse } from "@/lib/api-compression";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { apiCache } from "@/lib/cache-utils";

function sortChannels(channels: Channel[]) {
    return [...channels].sort((left, right) => {
        const leftCategory = left.categoryId ?? "~uncategorized";
        const rightCategory = right.categoryId ?? "~uncategorized";

        if (leftCategory !== rightCategory) {
            return leftCategory.localeCompare(rightCategory);
        }

        const leftPosition = left.position ?? 0;
        const rightPosition = right.position ?? 0;
        if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
        }

        return left.$createdAt.localeCompare(right.$createdAt);
    });
}

const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";
const ROLES_COLLECTION_ID = "roles";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID =
    "channel_permission_overrides";
const CHANNEL_TYPES = ["text", "voice", "announcement"] as const;
const CHANNELS_ROUTE_CACHE_TTL_MS = 10 * 1000;

function canUseChannelsRouteCache(): boolean {
    return process.env.NODE_ENV !== "test";
}

function dedupeChannelsRouteCache<T>(
    key: string,
    fetcher: () => Promise<T>,
): Promise<T> {
    if (!canUseChannelsRouteCache()) {
        return fetcher();
    }

    return apiCache.dedupe(key, fetcher, CHANNELS_ROUTE_CACHE_TTL_MS);
}

function stableIdsKey(ids: string[]): string {
    return Array.from(new Set(ids.filter((id) => id.length > 0)))
        .sort()
        .join(",");
}

function normalizeChannelType(value: unknown): Channel["type"] {
    if (
        typeof value === "string" &&
        CHANNEL_TYPES.includes(value as (typeof CHANNEL_TYPES)[number])
    ) {
        return value as Channel["type"];
    }

    return "text";
}

/**
 * POST /api/channels
 * Creates a channel for a specific server
 * Body:
 *   - serverId: server ID (required)
 *   - name: channel name (required)
 *   - type: text | voice | announcement (optional, defaults to text)
 *   - topic: channel topic (optional, max 500 chars)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = (await request.json()) as {
            name?: string;
            serverId?: string;
            topic?: string | null;
            type?: "text" | "voice" | "announcement";
        };

        const serverId = body.serverId?.trim();
        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        const name = body.name?.trim();
        if (!name) {
            return NextResponse.json(
                { error: "name is required" },
                { status: 400 },
            );
        }

        const type = normalizeChannelType(body.type);
        if (body.type !== undefined && body.type !== type) {
            return NextResponse.json(
                { error: "type must be text, voice, or announcement" },
                { status: 400 },
            );
        }

        const topic = body.topic?.trim() || "";
        if (topic.length > 500) {
            return NextResponse.json(
                { error: "topic must be 500 characters or fewer" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();
        const serverAccess = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!serverAccess.isMember) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (
            !serverAccess.isServerOwner &&
            !serverAccess.permissions.manageChannels
        ) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const highestPositionRes = await databases.listDocuments(
            env.databaseId,
            env.collections.channels,
            [
                Query.equal("serverId", serverId),
                Query.orderDesc("position"),
                Query.limit(1),
            ],
        );

        const highestPosition =
            typeof highestPositionRes.documents[0]?.position === "number"
                ? highestPositionRes.documents[0].position
                : -1;

        const created = await databases.createDocument(
            env.databaseId,
            env.collections.channels,
            ID.unique(),
            {
                name,
                serverId,
                type,
                topic,
                position: highestPosition + 1,
            },
            ['read("any")'],
        );

        const channel = created as unknown as Record<string, unknown>;
        return NextResponse.json(
            {
                channel: {
                    $id: String(channel.$id),
                    serverId: String(channel.serverId),
                    name: String(channel.name),
                    type: normalizeChannelType(channel.type),
                    topic:
                        typeof channel.topic === "string" &&
                        channel.topic.length > 0
                            ? channel.topic
                            : undefined,
                    categoryId:
                        typeof channel.categoryId === "string" &&
                        channel.categoryId.length > 0
                            ? channel.categoryId
                            : undefined,
                    position:
                        typeof channel.position === "number"
                            ? channel.position
                            : undefined,
                    $createdAt: String(channel.$createdAt ?? ""),
                    $updatedAt:
                        typeof channel.$updatedAt === "string"
                            ? channel.$updatedAt
                            : undefined,
                } satisfies Channel,
            },
            { status: 201 },
        );
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create channel",
            },
            { status: 500 },
        );
    }
}

/**
 * GET /api/channels
 * Lists channels for a specific server with pagination
 * Query params:
 *   - serverId: server ID (required)
 *   - limit: number of channels to return (default: 50)
 *   - cursor: cursor for pagination
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const userId = session.$id;
        const searchParams = request.nextUrl.searchParams;
        const serverId = searchParams.get("serverId");
        const parsedLimit = Number.parseInt(
            searchParams.get("limit") || "50",
            10,
        );
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 50;
        const cursor = searchParams.get("cursor");

        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const server = await dedupeChannelsRouteCache(
            `api:channels:server:${serverId}`,
            () =>
                databases.getDocument(
                    env.databaseId,
                    env.collections.servers,
                    serverId,
                ),
        );

        const isServerOwner = String(server.ownerId) === userId;

        if (!isServerOwner) {
            const membership = await dedupeChannelsRouteCache(
                `api:channels:membership:${serverId}:${userId}`,
                () =>
                    databases.listDocuments(env.databaseId, env.collections.memberships, [
                        Query.equal("serverId", serverId),
                        Query.equal("userId", userId),
                        Query.limit(1),
                    ]),
            );

            if (membership.documents.length === 0) {
                return NextResponse.json(
                    { error: "Forbidden" },
                    { status: 403 },
                );
            }
        }

        const queries: string[] = [
            Query.equal("serverId", serverId),
            Query.limit(limit),
        ];

        if (cursor) {
            queries.push(Query.cursorAfter(cursor));
        }

        const channelsRes = await dedupeChannelsRouteCache(
            `api:channels:list:${serverId}:${limit}:${cursor ?? ""}`,
            () =>
                databases.listDocuments(
                    env.databaseId,
                    env.collections.channels,
                    queries,
                ),
        );

        const allChannels: Channel[] = channelsRes.documents.map((doc) => {
            const d = doc as unknown as Record<string, unknown>;
            return {
                $id: String(d.$id),
                serverId: String(d.serverId),
                name: String(d.name),
                type: normalizeChannelType(d.type),
                topic:
                    typeof d.topic === "string" && d.topic.length > 0
                        ? d.topic
                        : undefined,
                categoryId:
                    typeof d.categoryId === "string" && d.categoryId.length > 0
                        ? d.categoryId
                        : undefined,
                position:
                    typeof d.position === "number" ? d.position : undefined,
                $createdAt: String(d.$createdAt ?? ""),
                $updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
            } satisfies Channel;
        });

        const orderedChannels = sortChannels(allChannels);

        let channels = orderedChannels;
        if (!isServerOwner && orderedChannels.length > 0) {
            const channelIds = orderedChannels.map((channel) => channel.$id);
            const [roleAssignmentRes, overridesRes] = await Promise.all([
                dedupeChannelsRouteCache(
                    `api:channels:role-assignment:${serverId}:${userId}`,
                    () =>
                        databases.listDocuments(
                            env.databaseId,
                            ROLE_ASSIGNMENTS_COLLECTION_ID,
                            [
                                Query.equal("serverId", serverId),
                                Query.equal("userId", userId),
                                Query.limit(1),
                            ],
                        ),
                ),
                dedupeChannelsRouteCache(
                    `api:channels:overrides:${serverId}:${stableIdsKey(channelIds)}`,
                    () =>
                        databases.listDocuments(
                            env.databaseId,
                            CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
                            [Query.equal("channelId", channelIds), Query.limit(1000)],
                        ),
                ),
            ]);

            const roleIds =
                roleAssignmentRes.documents.length > 0 &&
                Array.isArray(roleAssignmentRes.documents[0].roleIds)
                    ? (roleAssignmentRes.documents[0].roleIds as string[])
                    : [];

            const roles: Role[] =
                roleIds.length > 0
                    ? (
                          await dedupeChannelsRouteCache(
                              `api:channels:roles:${serverId}:${stableIdsKey(roleIds)}`,
                              () =>
                                  databases.listDocuments(
                                      env.databaseId,
                                      ROLES_COLLECTION_ID,
                                      [
                                          Query.equal("serverId", serverId),
                                          Query.equal("$id", roleIds),
                                          Query.limit(100),
                                      ],
                                  ),
                          )
                      ).documents.map((doc) => {
                          const d = doc as Record<string, unknown>;
                          return {
                              $id: String(d.$id),
                              serverId: String(d.serverId),
                              name: String(d.name),
                              color: String(d.color ?? "#6B7280"),
                              position:
                                  typeof d.position === "number"
                                      ? d.position
                                      : 0,
                              readMessages: Boolean(d.readMessages),
                              sendMessages: Boolean(d.sendMessages),
                              manageMessages: Boolean(d.manageMessages),
                              manageChannels: Boolean(d.manageChannels),
                              manageRoles: Boolean(d.manageRoles),
                              manageServer: Boolean(d.manageServer),
                              mentionEveryone: Boolean(d.mentionEveryone),
                              administrator: Boolean(d.administrator),
                              mentionable: Boolean(d.mentionable),
                              $createdAt: String(d.$createdAt ?? ""),
                              memberCount:
                                  typeof d.memberCount === "number"
                                      ? d.memberCount
                                      : undefined,
                          } satisfies Role;
                      })
                    : [];

            const overridesByChannel = new Map<
                string,
                ChannelPermissionOverride[]
            >();
            for (const doc of overridesRes.documents) {
                const d = doc as Record<string, unknown>;
                const channelId = String(d.channelId);
                const roleId = typeof d.roleId === "string" ? d.roleId : "";
                const overrideUserId =
                    typeof d.userId === "string" ? d.userId : "";
                const appliesToUser = overrideUserId === userId;
                const appliesToRole = roleId !== "" && roleIds.includes(roleId);

                if (!appliesToUser && !appliesToRole) {
                    continue;
                }

                const existing = overridesByChannel.get(channelId) ?? [];
                existing.push({
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
                });
                overridesByChannel.set(channelId, existing);
            }

            const hasAnyOverrides = overridesRes.documents.length > 0;
            channels = orderedChannels.filter((channel) => {
                const channelOverrides =
                    overridesByChannel.get(channel.$id) ?? [];
                if (roles.length === 0 && !hasAnyOverrides) {
                    return true;
                }
                const effective = getEffectivePermissions(
                    roles,
                    channelOverrides,
                    false,
                );
                return effective.readMessages;
            });
        }

        const last = channels.at(-1);
        const nextCursor = channels.length === limit && last ? last.$id : null;

        // Use compressed response for large payloads (60-70% bandwidth reduction)
        const response = compressedResponse(
            {
                channels,
                nextCursor,
            },
            {
                headers: {
                    // Cache channels for 60 seconds with 5 minute stale-while-revalidate
                    "Cache-Control":
                        "public, s-maxage=60, stale-while-revalidate=300",
                },
            },
        );

        return response;
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch channels",
            },
            { status: 500 },
        );
    }
}
