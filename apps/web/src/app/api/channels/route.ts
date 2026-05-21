import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { getServerSession } from "@/lib/auth-server";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Channel, ChannelPermissionOverride, Role } from "@/lib/types";
import { compressedResponse } from "@/lib/api-compression";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { apiCache } from "@/lib/cache-utils";
import { invalidateChannelsServerCaches } from "@/lib/channels-route-cache";
import { listPages } from "@/lib/appwrite-pagination";

const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";
const ROLES_COLLECTION_ID = "roles";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID =
    "channel_permission_overrides";
const CHANNELS_ROUTE_CACHE_TTL_MS = 10 * 1000;
const QUERY_ARRAY_LIMIT = 100;

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

function stableIdsHashKey(ids: string[]): string {
    return createHash("sha256").update(stableIdsKey(ids)).digest("hex");
}

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

const CHANNEL_TYPES = ["text", "voice", "announcement"] as const;

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

        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (typeof parsed !== "object" || parsed === null) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const body = parsed as Record<string, unknown>;

        if (typeof body.serverId !== "string") {
            return NextResponse.json(
                { error: "serverId must be a string" },
                { status: 400 },
            );
        }
        const serverId = body.serverId.trim();
        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        if (typeof body.name !== "string") {
            return NextResponse.json(
                { error: "name must be a string" },
                { status: 400 },
            );
        }
        const name = body.name.trim();
        if (!name) {
            return NextResponse.json(
                { error: "name is required" },
                { status: 400 },
            );
        }

        const rawType = body.type;
        // Validate explicit type when provided
        if (rawType !== undefined && typeof rawType !== "string") {
            return NextResponse.json(
                { error: "type must be a string" },
                { status: 400 },
            );
        }
        const type = normalizeChannelType(rawType);
        if (rawType !== undefined && rawType !== type) {
            return NextResponse.json(
                { error: "type must be text, voice, or announcement" },
                { status: 400 },
            );
        }

        if (body.topic !== undefined && body.topic !== null && typeof body.topic !== "string") {
            return NextResponse.json(
                { error: "topic must be a string" },
                { status: 400 },
            );
        }
        const topic = (typeof body.topic === "string" ? body.topic.trim() : "") || "";
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

        invalidateChannelsServerCaches(serverId);

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

        let server: { ownerId: string | number } | null = null;
        try {
            const serverDoc = (await dedupeChannelsRouteCache(
                `api:channels:server:${serverId}`,
                () =>
                    databases.getDocument(
                        env.databaseId,
                        env.collections.servers,
                        serverId,
                    ),
            )) as unknown as { ownerId: string | number };
            server = serverDoc;
        } catch (error) {
            if (isDocumentNotFoundError(error)) {
                return NextResponse.json(
                    { error: "Server not found" },
                    { status: 404 },
                );
            }
            throw error;
        }

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
            Query.orderAsc("categoryId"),
            Query.orderAsc("position"),
            Query.orderAsc("$createdAt"),
            Query.orderAsc("$id"),
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

        let channels = allChannels;
        if (!isServerOwner && allChannels.length > 0) {
            const channelIds = allChannels.map((channel) => channel.$id);
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
                    `api:channels:overrides:${serverId}:${stableIdsHashKey(channelIds)}`,
                    async () => {
                        const overridePages = await listPages({
                            databases,
                            databaseId: env.databaseId,
                            collectionId:
                                CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
                            baseQueries: [Query.equal("channelId", channelIds)],
                            pageSize: 1000,
                            warningContext: "channels-route-overrides",
                        });

                        if (overridePages.truncated) {
                            throw new Error(
                                "Channel override lookup truncated; refusing partial visibility evaluation",
                            );
                        }

                        return {
                            documents: overridePages.documents,
                        };
                    },
                ),
            ]);

            const roleIds =
                roleAssignmentRes.documents.length > 0 &&
                Array.isArray(roleAssignmentRes.documents[0].roleIds)
                    ? (roleAssignmentRes.documents[0].roleIds as string[])
                    : [];

            const roles: Role[] =
                roleIds.length > 0
                    ? await dedupeChannelsRouteCache(
                          `api:channels:roles:${serverId}:${stableIdsHashKey(roleIds)}`,
                          async () => {
                              const rolePages = await Promise.all(
                                  chunkValues(roleIds, QUERY_ARRAY_LIMIT).map(
                                      (roleIdChunk) =>
                                          databases.listDocuments(
                                              env.databaseId,
                                              ROLES_COLLECTION_ID,
                                              [
                                                  Query.equal(
                                                      "serverId",
                                                      serverId,
                                                  ),
                                                  Query.equal(
                                                      "$id",
                                                      roleIdChunk,
                                                  ),
                                                  Query.limit(
                                                      roleIdChunk.length,
                                                  ),
                                              ],
                                          ),
                                  ),
                              );

                              const rolesById = new Map<string, Role>();
                              for (const rolePage of rolePages) {
                                  for (const document of rolePage.documents) {
                                      const d = document as Record<
                                          string,
                                          unknown
                                      >;
                                      const role = {
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
                                          manageMessages: Boolean(
                                              d.manageMessages,
                                          ),
                                          manageChannels: Boolean(
                                              d.manageChannels,
                                          ),
                                          manageRoles: Boolean(d.manageRoles),
                                          manageServer: Boolean(
                                              d.manageServer,
                                          ),
                                          mentionEveryone: Boolean(
                                              d.mentionEveryone,
                                          ),
                                          administrator: Boolean(
                                              d.administrator,
                                          ),
                                          mentionable: Boolean(d.mentionable),
                                          $createdAt: String(
                                              d.$createdAt ?? "",
                                          ),
                                          memberCount:
                                              typeof d.memberCount ===
                                              "number"
                                                  ? d.memberCount
                                                  : undefined,
                                      } satisfies Role;
                                      rolesById.set(role.$id, role);
                                  }
                              }

                              return roleIds.flatMap((roleId) => {
                                  const role = rolesById.get(roleId);
                                  return role ? [role] : [];
                              });
                          },
                      )
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
            channels = allChannels.filter((channel) => {
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

        const lastRawDoc = channelsRes.documents.at(-1);
        const nextCursor = channelsRes.documents.length === limit && lastRawDoc
            ? String(lastRawDoc.$id)
            : null;

        // Use compressed response for large payloads (60-70% bandwidth reduction)
        const response = compressedResponse(
            {
                channels,
                nextCursor,
            },
            {
                headers: {
                    // User-specific data; responses are not cached.
                    "Cache-Control": "private, no-store",
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
