import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { Message, PinnedMessage } from "@/lib/types";
import {
    getChannelAccessForUser,
    getServerPermissionsForUser,
} from "@/lib/server-channel-access";

const PIN_LIMIT = 50;

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

async function assertCanManageChannelMessage(
    userId: string,
    channelId: string,
    serverIdHint?: string,
): Promise<{ serverId: string }> {
    const env = getEnvConfig();
    const { databases } = getServerClient();

    const access = await getChannelAccessForUser(
        databases,
        env,
        channelId,
        userId,
    );
    if (!access.isMember || !access.canRead) {
        throw new Error("FORBIDDEN");
    }

    const serverId = serverIdHint || access.serverId;
    const serverAccess = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        userId,
    );

    const canManage =
        serverAccess.isServerOwner ||
        serverAccess.permissions.administrator ||
        serverAccess.permissions.manageMessages;

    if (!canManage) {
        throw new Error("FORBIDDEN");
    }

    return { serverId };
}

/**
 * POST /api/messages/[messageId]/pin
 * Pins a channel message in its channel context.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;
        const env = getEnvConfig();
        const { databases } = getServerClient();

        const message = (await databases.getDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
        )) as unknown as Message;

        if (!message.channelId) {
            return NextResponse.json(
                { error: "Message has no channel context" },
                { status: 400 },
            );
        }

        try {
            await assertCanManageChannelMessage(
                user.$id,
                message.channelId,
                message.serverId,
            );
        } catch (error) {
            if (error instanceof Error && error.message === "FORBIDDEN") {
                return NextResponse.json(
                    { error: "Forbidden" },
                    { status: 403 },
                );
            }
            throw error;
        }

        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", message.channelId),
                Query.equal("messageId", messageId),
                Query.limit(1),
            ],
        );

        if (existing.total > 0) {
            const d = existing.documents[0] as unknown as PinnedMessage;
            return NextResponse.json({ pin: d });
        }

        const count = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", message.channelId),
                Query.limit(PIN_LIMIT + 1),
            ],
        );

        if (count.total >= PIN_LIMIT) {
            return NextResponse.json(
                { error: "Pin limit reached for this channel" },
                { status: 409 },
            );
        }

        const now = new Date().toISOString();
        const created = await databases.createDocument(
            env.databaseId,
            env.collections.pinnedMessages,
            ID.unique(),
            {
                messageId,
                contextType: "channel",
                contextId: message.channelId,
                pinnedBy: user.$id,
                pinnedAt: now,
            },
        );

        return NextResponse.json({ pin: created });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to pin message",
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/messages/[messageId]/pin
 * Unpins a channel message.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;
        const env = getEnvConfig();
        const { databases } = getServerClient();

        const message = (await databases.getDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
        )) as unknown as Message;

        if (!message.channelId) {
            return NextResponse.json(
                { error: "Message has no channel context" },
                { status: 400 },
            );
        }

        try {
            await assertCanManageChannelMessage(
                user.$id,
                message.channelId,
                message.serverId,
            );
        } catch (error) {
            if (error instanceof Error && error.message === "FORBIDDEN") {
                return NextResponse.json(
                    { error: "Forbidden" },
                    { status: 403 },
                );
            }
            throw error;
        }

        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", message.channelId),
                Query.equal("messageId", messageId),
                Query.limit(1),
            ],
        );

        if (existing.total === 0) {
            return NextResponse.json({ success: true });
        }

        await databases.deleteDocument(
            env.databaseId,
            env.collections.pinnedMessages,
            String(existing.documents[0].$id),
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to unpin message",
            },
            { status: 500 },
        );
    }
}
