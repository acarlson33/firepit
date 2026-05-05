import { NextResponse, type NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
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

        const overridesResponse = await databases.listDocuments(
            databaseId,
            channelPermissionOverridesCollectionId,
            [Query.equal("channelId", channelId), Query.limit(1000)],
        );

        const applicableOverrides: ChannelPermissionOverride[] = [];
        for (const document of overridesResponse.documents) {
            const override = mapOverride(
                document as Record<string, unknown>,
                channelId,
            );
            const appliesToUser = override.userId === userId;
            const roleId = override.roleId ?? "";
            const appliesToRole =
                roleId !== "" && serverAccess.roleIds.includes(roleId);

            if (appliesToUser || appliesToRole) {
                applicableOverrides.push(override);
            }
        }

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
