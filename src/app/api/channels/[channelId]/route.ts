import { NextResponse, type NextRequest } from "next/server";
import type { Models } from "appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { deleteChannel } from "@/lib/appwrite-servers";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { invalidateChannelsServerCaches } from "@/lib/channels-route-cache";
import type { Channel } from "@/lib/types";

type ChannelDocument = Models.Document & Channel;

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
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

function normalizeChannel(doc: Record<string, unknown>): Channel {
    return {
        $id: String(doc.$id),
        serverId: String(doc.serverId),
        name: String(doc.name),
        type: normalizeChannelType(doc.type),
        topic:
            typeof doc.topic === "string" && doc.topic.length > 0
                ? doc.topic
                : undefined,
        categoryId:
            typeof doc.categoryId === "string" && doc.categoryId.length > 0
                ? doc.categoryId
                : undefined,
        position:
            typeof doc.position === "number" ? doc.position : undefined,
        $createdAt: String(doc.$createdAt ?? ""),
        $updatedAt:
            typeof doc.$updatedAt === "string" ? doc.$updatedAt : undefined,
    };
}

function getDatabases() {
    return getServerClient().databases;
}

function isChannel(value: unknown): value is Channel {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<Channel>;
    return (
        typeof candidate.serverId === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.$id === "string"
    );
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

    let channel: Channel;
    try {
        const fetchedChannel = await databases.getDocument<ChannelDocument>(
            databaseId,
            env.collections.channels,
            channelId,
        );

        if (!isChannel(fetchedChannel)) {
            throw new Error("Invalid channel document");
        }

        channel = fetchedChannel;
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 },
            );
        }

        throw error;
    }
    const access = await getServerPermissionsForUser(
        databases,
        env,
        String(channel.serverId),
        session.$id,
    );

    if (
        !access.isMember &&
        !access.isServerOwner &&
        !access.permissions.manageChannels
    ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return { channel };
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

        const accessResult = await requireManageChannelsAccess(channelId);
        if (accessResult instanceof NextResponse) {
            return accessResult;
        }

        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (typeof parsed !== "object" || parsed === null) {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
        }

        const body = parsed as Record<string, unknown>;

        const updateData: Record<string, string | number | null> = {};
        if (body.name !== undefined) {
            if (typeof body.name !== "string") {
                return NextResponse.json({ error: "name must be a string" }, { status: 400 });
            }
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
            if (body.categoryId !== null && typeof body.categoryId !== "string") {
                return NextResponse.json({ error: "categoryId must be a string or null" }, { status: 400 });
            }
            updateData.categoryId = (body.categoryId === null ? "" : String(body.categoryId).trim()) || "";
        }
        if (body.position !== undefined) {
            if (!Number.isInteger(body.position as number) || (body.position as number) < 0) {
                return NextResponse.json(
                    { error: "position must be a non-negative integer" },
                    { status: 400 },
                );
            }
            updateData.position = body.position as number;
        }
        if (body.type !== undefined) {
            if (typeof body.type !== "string") {
                return NextResponse.json({ error: "type must be a string" }, { status: 400 });
            }
            const normalized = normalizeChannelType(body.type);
            if (body.type !== normalized) {
                return NextResponse.json(
                    { error: "type must be text, voice, or announcement" },
                    { status: 400 },
                );
            }

            updateData.type = normalized as string;
        }
        if (body.topic !== undefined) {
            if (body.topic !== null && typeof body.topic !== "string") {
                return NextResponse.json({ error: "topic must be a string or null" }, { status: 400 });
            }
            const nextTopic = (body.topic === null ? "" : String(body.topic).trim()) || "";
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

        return NextResponse.json({ channel: normalizeChannel(channel) });
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 },
            );
        }

        logger.error("Failed to update channel", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update channel" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ channelId: string }> },
) {
    try {
        const { channelId } = await context.params;
        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const accessResult = await requireManageChannelsAccess(channelId);
        if (accessResult instanceof NextResponse) {
            return accessResult;
        }

        try {
            await deleteChannel(channelId);
        } catch (error) {
            if (isDocumentNotFoundError(error)) {
                return NextResponse.json(
                    { error: "Channel not found" },
                    { status: 404 },
                );
            }

            throw error;
        }

        invalidateChannelsServerCaches(String(accessResult.channel.serverId));

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        logger.error("Failed to delete channel", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to delete channel" },
            { status: 500 },
        );
    }
}
