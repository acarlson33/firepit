import { NextResponse, type NextRequest } from "next/server";
import { Client, Databases, Query, ID } from "node-appwrite";
import type { Permission } from "@/lib/types";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const env = getEnvConfig();
const endpoint = env.endpoint;
const project = env.project;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = env.databaseId || "main";
const overridesCollectionId = "channel_permission_overrides";

if (!endpoint || !project || !apiKey) {
    throw new Error("Missing Appwrite configuration");
}

const client = new Client().setEndpoint(endpoint).setProject(project);
if (
    typeof (client as unknown as { setKey?: (k: string) => void }).setKey ===
    "function"
) {
    (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

async function requireManageChannelsAccessByServerId(serverId: string) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const access = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        session.$id,
    );

    if (!access.isMember || !access.permissions.manageChannels) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null;
}

async function requireManageChannelsAccessByChannelId(channelId: string) {
    const channel = await databases.getDocument(
        databaseId,
        env.collections.channels,
        channelId,
    );
    return requireManageChannelsAccessByServerId(String(channel.serverId));
}

// GET: List permission overrides for a channel
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const channelId = searchParams.get("channelId");

        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const authError =
            await requireManageChannelsAccessByChannelId(channelId);
        if (authError) {
            return authError;
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
        const body = await request.json();
        const { channelId, roleId, userId, allow, deny } = body;

        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const authError =
            await requireManageChannelsAccessByChannelId(channelId);
        if (authError) {
            return authError;
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

        const allowArray = (allow || []) as string[];
        const denyArray = (deny || []) as string[];

        const invalidAllow = allowArray.filter(
            (p) => !validPermissions.includes(p as Permission),
        );
        const invalidDeny = denyArray.filter(
            (p) => !validPermissions.includes(p as Permission),
        );

        if (invalidAllow.length > 0 || invalidDeny.length > 0) {
            return NextResponse.json(
                { error: "Invalid permission values" },
                { status: 400 },
            );
        }

        // Check if override already exists
        const queries = [Query.equal("channelId", channelId), Query.limit(1)];

        if (roleId) {
            queries.push(Query.equal("roleId", roleId));
        }
        if (userId) {
            queries.push(Query.equal("userId", userId));
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
        const authError = await requireManageChannelsAccessByChannelId(
            String(existingOverride.channelId),
        );
        if (authError) {
            return authError;
        }

        // Validate permissions
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

        const allowArray = (allow || []) as string[];
        const denyArray = (deny || []) as string[];

        const invalidAllow = allowArray.filter(
            (p) => !validPermissions.includes(p as Permission),
        );
        const invalidDeny = denyArray.filter(
            (p) => !validPermissions.includes(p as Permission),
        );

        if (invalidAllow.length > 0 || invalidDeny.length > 0) {
            return NextResponse.json(
                { error: "Invalid permission values" },
                { status: 400 },
            );
        }

        const override = await databases.updateDocument(
            databaseId,
            overridesCollectionId,
            overrideId,
            {
                allow: allowArray,
                deny: denyArray,
            },
        );

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
        const authError = await requireManageChannelsAccessByChannelId(
            String(existingOverride.channelId),
        );
        if (authError) {
            return authError;
        }

        await databases.deleteDocument(
            databaseId,
            overridesCollectionId,
            overrideId,
        );

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
