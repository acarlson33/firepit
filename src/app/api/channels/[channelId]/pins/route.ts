import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import type { Message, PinnedMessage } from "@/lib/types";

type RouteContext = {
    params: Promise<{
        channelId: string;
    }>;
};

/**
 * GET /api/channels/[channelId]/pins
 * Lists pinned messages for a channel.
 */
export async function GET(_request: Request, context: RouteContext) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { channelId } = await context.params;
        const env = getEnvConfig();
        const { databases } = getServerClient();

        const access = await getChannelAccessForUser(
            databases,
            env,
            channelId,
            user.$id,
        );
        if (!access.isMember || !access.canRead) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const pinDocs = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", channelId),
                Query.orderDesc("$createdAt"),
                Query.limit(50),
            ],
        );

        const pins = pinDocs.documents as unknown as PinnedMessage[];
        const messageIds = pins.map((pin) => pin.messageId);

        if (messageIds.length === 0) {
            return NextResponse.json({ items: [] });
        }

        const messageDocs = await databases.listDocuments(
            env.databaseId,
            env.collections.messages,
            [Query.equal("$id", messageIds), Query.limit(50)],
        );

        const messagesById = new Map<string, Message>();
        for (const doc of messageDocs.documents) {
            const d = doc as unknown as Record<string, unknown>;
            messagesById.set(String(d.$id), {
                $id: String(d.$id),
                userId: String(d.userId),
                userName: d.userName as string | undefined,
                text: String(d.text || ""),
                $createdAt: String(d.$createdAt || ""),
                channelId: d.channelId as string | undefined,
                serverId: d.serverId as string | undefined,
                editedAt: d.editedAt as string | undefined,
                removedAt: d.removedAt as string | undefined,
                removedBy: d.removedBy as string | undefined,
                imageFileId: d.imageFileId as string | undefined,
                imageUrl: d.imageUrl as string | undefined,
                replyToId: d.replyToId as string | undefined,
                threadId: d.threadId as string | undefined,
                threadMessageCount:
                    typeof d.threadMessageCount === "number"
                        ? d.threadMessageCount
                        : undefined,
                threadParticipants: Array.isArray(d.threadParticipants)
                    ? (d.threadParticipants as string[])
                    : undefined,
                lastThreadReplyAt: d.lastThreadReplyAt as string | undefined,
                mentions: Array.isArray(d.mentions)
                    ? (d.mentions as string[])
                    : undefined,
            });
        }

        const items = pins
            .map((pin) => {
                const message = messagesById.get(pin.messageId);
                if (!message) {
                    return null;
                }

                return {
                    pin,
                    message,
                };
            })
            .filter(Boolean);

        return NextResponse.json({ items });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch pinned messages",
            },
            { status: 500 },
        );
    }
}
