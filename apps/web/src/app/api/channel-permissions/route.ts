import { NextResponse, type NextRequest } from "next/server";
import { Query, ID } from "node-appwrite";
import type { Permission } from "@/lib/types";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import {
    logger,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { invalidateChannelAccessCache } from "@/lib/server-channel-access";
import { invalidateChannelsServerCaches } from "@/lib/channels-route-cache";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const overridesCollectionId = "channel_permission_overrides";

const validPermissions: Permission[] = [
    "readMessages",
    "sendMessages",
    "manageMessages",
    "manageChannels",
    "manageRoles",
    "manageServer",
    "mentionEveryone",
    "administrator",
];

function getDatabases() {
    return getServerClient().databases;
}

function validateAllowDeny(
    allow: unknown,
    deny: unknown,
): { allowArray: string[]; denyArray: string[] } | null {
    const allowArray = allow === undefined ? [] : allow;
    const denyArray = deny === undefined ? [] : deny;
    if (!Array.isArray(allowArray) || !Array.isArray(denyArray)) {
        return null;
    }

    const invalid = [...allowArray, ...denyArray].filter(
        (permission) => !validPermissions.includes(permission as Permission),
    );
    if (invalid.length > 0) {
        return null;
    }

    return { allowArray, denyArray };
}

type AuthResult =
    | { response: NextResponse }
    | { serverId: string };

async function requireManageChannelsAccessByServerId(
    serverId: string,
): Promise<AuthResult> {
    const databases = getDatabases();
    const session = await getServerSession();
    if (!session?.$id) {
        return { response: returnUnauthorized() };
    }

    const access = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        session.$id,
    );

    if (!access.isMember || !access.permissions.manageChannels) {
        return { response: returnForbidden() };
    }

    return { serverId };
}

async function requireManageChannelsAccessByChannelId(
    channelId: string,
): Promise<AuthResult> {
    const databases = getDatabases();
    const channel = await databases.getDocument(
        databaseId,
        env.collections.channels,
        channelId,
    );
    return requireManageChannelsAccessByServerId(String(channel.serverId));
}

function isAuthError(
    authResult: AuthResult,
): authResult is { response: NextResponse } {
    return "response" in authResult;
}

// GET: List permission overrides for a channel
export async function GET(request: NextRequest) {
    try {
        const databases = getDatabases();
        const { searchParams } = new URL(request.url);
        const channelId = searchParams.get("channelId");

        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const authResult =
            await requireManageChannelsAccessByChannelId(channelId);
        if (isAuthError(authResult)) {
            return authResult.response;
        }

        const overrides = await databases.listDocuments(
            databaseId,
            overridesCollectionId,
            [Query.equal("channelId", channelId), Query.limit(100)],
        );

        return NextResponse.json({ overrides: overrides.documents });
    } catch (error) {
        logger.error("Failed to list channel permissions", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list channel permissions" },
            { status: 500 },
        );
    }
}

// POST: Create permission override
export async function POST(request: NextRequest) {
    try {
        const databases = getDatabases();
        const body = await request.json();
        const { channelId, roleId, userId, allow, deny } = body;

        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const authResult =
            await requireManageChannelsAccessByChannelId(channelId);
        if (isAuthError(authResult)) {
            return authResult.response;
        }

        if (!roleId && !userId) {
            return NextResponse.json(
                { error: "Either roleId or userId must be provided" },
                { status: 400 },
            );
        }

        if (roleId && userId) {
            return NextResponse.json(
                { error: "Cannot specify both roleId and userId" },
                { status: 400 },
            );
        }

        // Validate permissions
        const allowDeny = validateAllowDeny(allow, deny);
        if (!allowDeny) {
            return NextResponse.json(
                { error: "Invalid permission values" },
                { status: 400 },
            );
        }
        const { allowArray, denyArray } = allowDeny;

        // Check if override already exists
        const queries = [Query.equal("channelId", channelId), Query.limit(1)];

        if (roleId) {
            queries.push(
                Query.equal("roleId", roleId),
                Query.equal("userId", ""),
            );
        }
        if (userId) {
            queries.push(
                Query.equal("userId", userId),
                Query.equal("roleId", ""),
            );
        }

        const existing = await databases.listDocuments(
            databaseId,
            overridesCollectionId,
            queries,
        );

        if (existing.documents.length > 0) {
            return NextResponse.json(
                {
                    error: "Override already exists for this role/user in this channel",
                },
                { status: 400 },
            );
        }

        // Create override
        const overrideData: Record<string, unknown> = {
            channelId,
            allow: allowArray,
            deny: denyArray,
        };

        if (roleId) {
            overrideData.roleId = roleId;
            overrideData.userId = ""; // Ensure userId is empty string for role overrides
        } else if (userId) {
            overrideData.userId = userId;
            overrideData.roleId = ""; // Ensure roleId is empty string for user overrides
        }

        const override = await databases.createDocument(
            databaseId,
            overridesCollectionId,
            ID.unique(),
            overrideData,
        );

        invalidateChannelsServerCaches(authResult.serverId);
        invalidateChannelAccessCache(databaseId, channelId);

        return NextResponse.json({ override }, { status: 201 });
    } catch (error) {
        logger.error("Failed to create channel permission", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to create channel permission" },
            { status: 500 },
        );
    }
}

// PUT: Update permission override
export async function PUT(request: NextRequest) {
    try {
        const databases = getDatabases();
        const body = await request.json();
        const { overrideId, allow, deny } = body;

        if (!overrideId) {
            return NextResponse.json(
                { error: "overrideId is required" },
                { status: 400 },
            );
        }

        const existingOverride = await databases.getDocument(
            databaseId,
            overridesCollectionId,
            overrideId,
        );
        const channelId = String(existingOverride.channelId);
        const authResult = await requireManageChannelsAccessByChannelId(
            channelId,
        );
        if (isAuthError(authResult)) {
            return authResult.response;
        }

        // Validate permissions
        const allowDeny = validateAllowDeny(allow, deny);
        if (!allowDeny) {
            return NextResponse.json(
                { error: "Invalid permission values" },
                { status: 400 },
            );
        }
        const { allowArray, denyArray } = allowDeny;

        const override = await databases.updateDocument(
            databaseId,
            overridesCollectionId,
            overrideId,
            {
                allow: allowArray,
                deny: denyArray,
            },
        );

        invalidateChannelsServerCaches(authResult.serverId);
        invalidateChannelAccessCache(databaseId, channelId);

        return NextResponse.json({ override });
    } catch (error) {
        logger.error("Failed to update channel permission", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update channel permission" },
            { status: 500 },
        );
    }
}

// DELETE: Delete permission override
export async function DELETE(request: NextRequest) {
    try {
        const databases = getDatabases();
        const { searchParams } = new URL(request.url);
        const overrideId = searchParams.get("overrideId");

        if (!overrideId) {
            return NextResponse.json(
                { error: "overrideId is required" },
                { status: 400 },
            );
        }

        const existingOverride = await databases.getDocument(
            databaseId,
            overridesCollectionId,
            overrideId,
        );
        const channelId = String(existingOverride.channelId);
        const authResult = await requireManageChannelsAccessByChannelId(
            channelId,
        );
        if (isAuthError(authResult)) {
            return authResult.response;
        }

        await databases.deleteDocument(
            databaseId,
            overridesCollectionId,
            overrideId,
        );

        invalidateChannelsServerCaches(authResult.serverId);
        invalidateChannelAccessCache(databaseId, channelId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete channel permission", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to delete channel permission" },
            { status: 500 },
        );
    }
}
