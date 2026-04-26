import { NextResponse, type NextRequest } from "next/server";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { invalidateChannelsServerCaches } from "@/lib/channels-route-cache";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const CHANNEL_TYPES = ["text", "voice", "announcement"] as const;
type ChannelType = (typeof CHANNEL_TYPES)[number];

function getDatabases() {
    return getServerClient().databases;
}

async function requireManageChannelsAccess(channelId: string) {
    const databases = getDatabases();
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const channel = await databases.getDocument(
        databaseId,
        env.collections.channels,
        channelId,
    );
    const access = await getServerPermissionsForUser(
        databases,
        env,
        String(channel.serverId),
        session.$id,
    );

    if (!access.isMember || !access.permissions.manageChannels) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null;
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ channelId: string }> },
) {
    try {
        const databases = getDatabases();
        const { channelId } = await context.params;
        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const authError = await requireManageChannelsAccess(channelId);
        if (authError) {
            return authError;
        }

        const body = (await request.json()) as {
            categoryId?: string | null;
            position?: number;
            name?: string;
            type?: ChannelType;
            topic?: string | null;
        };

        const updateData: Record<string, string | number> = {};
        if (body.name !== undefined) {
            const nextName = body.name.trim();
            if (!nextName) {
                return NextResponse.json(
                    { error: "Channel name cannot be empty" },
                    { status: 400 },
                );
            }
            updateData.name = nextName;
        }
        if (body.categoryId !== undefined) {
            updateData.categoryId = body.categoryId?.trim() || "";
        }
        if (body.position !== undefined) {
            if (!Number.isInteger(body.position) || body.position < 0) {
                return NextResponse.json(
                    { error: "position must be a non-negative integer" },
                    { status: 400 },
                );
            }
            updateData.position = body.position;
        }
        if (body.type !== undefined) {
            if (!CHANNEL_TYPES.includes(body.type)) {
                return NextResponse.json(
                    { error: "type must be text, voice, or announcement" },
                    { status: 400 },
                );
            }

            updateData.type = body.type;
        }
        if (body.topic !== undefined) {
            const nextTopic = body.topic?.trim() || "";
            if (nextTopic.length > 500) {
                return NextResponse.json(
                    { error: "topic must be 500 characters or fewer" },
                    { status: 400 },
                );
            }

            updateData.topic = nextTopic;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No channel updates provided" },
                { status: 400 },
            );
        }

        const channel = await databases.updateDocument(
            databaseId,
            env.collections.channels,
            channelId,
            updateData,
        );

        invalidateChannelsServerCaches(String(channel.serverId));

        return NextResponse.json({ channel });
    } catch (error) {
        logger.error("Failed to update channel", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update channel" },
            { status: 500 },
        );
    }
}
