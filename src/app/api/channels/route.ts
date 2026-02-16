import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Channel, ChannelPermissionOverride, Role } from "@/lib/types";
import { compressedResponse } from "@/lib/api-compression";

const ROLE_ASSIGNMENTS_COLLECTION_ID = "role_assignments";
const ROLES_COLLECTION_ID = "roles";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID =
    "channel_permission_overrides";

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

        const server = await databases.getDocument(
            env.databaseId,
            env.collections.servers,
            serverId,
        );

        const isServerOwner = String(server.ownerId) === userId;

        if (!isServerOwner) {
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
                return NextResponse.json(
                    { error: "Forbidden" },
                    { status: 403 },
                );
            }
        }

        const queries: string[] = [
            Query.equal("serverId", serverId),
            Query.limit(limit),
            Query.orderAsc("$createdAt"),
        ];

        if (cursor) {
            queries.push(Query.cursorAfter(cursor));
        }

        const channelsRes = await databases.listDocuments(
            env.databaseId,
            env.collections.channels,
            queries,
        );

        const allChannels: Channel[] = channelsRes.documents.map((doc) => {
            const d = doc as unknown as Record<string, unknown>;
            return {
                $id: String(d.$id),
                serverId: String(d.serverId),
                name: String(d.name),
                $createdAt: String(d.$createdAt ?? ""),
            } satisfies Channel;
        });

        let channels = allChannels;
        if (!isServerOwner && allChannels.length > 0) {
            const roleAssignmentRes = await databases.listDocuments(
                env.databaseId,
                ROLE_ASSIGNMENTS_COLLECTION_ID,
                [
                    Query.equal("serverId", serverId),
                    Query.equal("userId", userId),
                    Query.limit(1),
                ],
            );

            const roleIds =
                roleAssignmentRes.documents.length > 0 &&
                Array.isArray(roleAssignmentRes.documents[0].roleIds)
                    ? (roleAssignmentRes.documents[0].roleIds as string[])
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

            const channelIds = allChannels.map((channel) => channel.$id);
            const overridesRes = await databases.listDocuments(
                env.databaseId,
                CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
                [Query.equal("channelId", channelIds), Query.limit(1000)],
            );

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
