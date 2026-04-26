import { NextResponse, type NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { listPages } from "@/lib/appwrite-pagination";
import { getEffectivePermissions } from "@/lib/permissions";
import type { ChannelPermissionOverride } from "@/lib/types";
import { logger } from "@/lib/newrelic-utils";
import {
    getChannelAccessForUser,
    getServerPermissionsForUser,
} from "@/lib/server-channel-access";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const channelPermissionOverridesCollectionId = "channel_permission_overrides";

function getDatabases() {
    return getServerClient().databases;
}


function mapOverride(
    doc: Record<string, unknown>,
    channelId: string,
): ChannelPermissionOverride {
    return {
        $id: String(doc.$id),
        channelId,
        roleId: typeof doc.roleId === "string" ? doc.roleId : "",
        userId: typeof doc.userId === "string" ? doc.userId : "",
        allow: Array.isArray(doc.allow)
            ? (doc.allow as ChannelPermissionOverride["allow"])
            : [],
        deny: Array.isArray(doc.deny)
            ? (doc.deny as ChannelPermissionOverride["deny"])
            : [],
        $createdAt: String(doc.$createdAt ?? ""),
    };
}

type QueryWithIn = typeof Query & {
    in?: (attribute: string, values: string[]) => string;
};

const QUERY_ARRAY_LIMIT = 100;

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}


function buildRoleIdMembershipQuery(roleIds: string[]): string {
    const queryWithIn = Query as QueryWithIn;
    if (typeof queryWithIn.in === "function") {
        return queryWithIn.in("roleId", roleIds);
    }

    // Appwrite accepts Query.equal(field, [v1, v2]) as an IN-style fallback.
    return Query.equal("roleId", roleIds);
}

async function listOverridePages(params: {
    databases: ReturnType<typeof getDatabases>;
    pageSize: number;
    queries: string[];
    warningContext: string;
}) {
    const { databases, pageSize, queries, warningContext } = params;

    const { documents, truncated } = await listPages({
        databases,
        databaseId,
        collectionId: channelPermissionOverridesCollectionId,
        baseQueries: queries,
        pageSize,
        warningContext,
    });

    if (truncated) {
        throw new Error(
            `listOverridePages truncated for ${channelPermissionOverridesCollectionId} (${warningContext})`,
        );
    }

    return documents;
}

// GET: Get user's effective permissions for a server/channel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const databases = getDatabases();
        const { serverId } = await params;
        const { searchParams } = new URL(request.url);
        const channelId = searchParams.get("channelId");
        const userId = searchParams.get("userId");

        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        if (!userId) {
            return NextResponse.json(
                { error: "userId is required" },
                { status: 400 },
            );
        }

        const serverAccess = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            userId,
        );

        if (!channelId || !serverAccess.isMember) {
            return NextResponse.json({
                ...serverAccess.permissions,
                canRead: serverAccess.permissions.readMessages,
                canSend: serverAccess.permissions.sendMessages,
            });
        }

        if (
            serverAccess.isServerOwner ||
            serverAccess.permissions.administrator
        ) {
            return NextResponse.json({
                ...serverAccess.permissions,
                canRead: true,
                canSend: true,
            });
        }

        const userOverrideDocumentsPromise = listOverridePages({
            databases,
            pageSize: 500,
            queries: [
                Query.equal("channelId", channelId),
                Query.equal("userId", userId),
            ],
            warningContext: "user-overrides",
        });

        const roleOverrideDocumentsPromise =
            serverAccess.roleIds.length > 0
                ? Promise.all(
                      chunkValues(serverAccess.roleIds, QUERY_ARRAY_LIMIT).map(
                          (roleIdChunk) =>
                              listOverridePages({
                                  databases,
                                  pageSize: 500,
                                  queries: [
                                      Query.equal("channelId", channelId),
                                      buildRoleIdMembershipQuery(roleIdChunk),
                                  ],
                                  warningContext: "role-overrides",
                              }),
                      ),
                  ).then((chunks) => chunks.flat())
                : Promise.resolve([] as Array<Record<string, unknown>>);

        const [userOverrideDocuments, roleOverrideDocuments] =
            await Promise.all([
                userOverrideDocumentsPromise,
                roleOverrideDocumentsPromise,
            ]);

        const applicableOverrideDocuments = [
            ...userOverrideDocuments,
            ...roleOverrideDocuments,
        ];
        const applicableOverridesById = new Map<string, ChannelPermissionOverride>();
        for (const document of applicableOverrideDocuments) {
            const mappedOverride = mapOverride(
                document as Record<string, unknown>,
                channelId,
            );
            applicableOverridesById.set(mappedOverride.$id, mappedOverride);
        }
        const applicableOverrides = Array.from(applicableOverridesById.values());

        const effectivePerms = getEffectivePermissions(
            serverAccess.roles,
            applicableOverrides,
            serverAccess.isServerOwner,
        );

        const channelAccess = await getChannelAccessForUser(
            databases,
            env,
            channelId,
            userId,
        );

        return NextResponse.json({
            ...effectivePerms,
            canRead: channelAccess.canRead,
            canSend: channelAccess.canSend,
        });
    } catch (error) {
        logger.error("Failed to get permissions", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to get permissions" },
            { status: 500 },
        );
    }
}
