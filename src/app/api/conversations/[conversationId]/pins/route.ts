import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { DirectMessage, PinnedMessage } from "@/lib/types";

type RouteContext = {
    params: Promise<{
        conversationId: string;
    }>;
};

/**
 * GET /api/conversations/[conversationId]/pins
 * Lists pinned messages for a DM conversation.
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

        const { conversationId } = await context.params;
        const env = getEnvConfig();
        const { databases } = getServerClient();

        const conversation = await databases.getDocument(
            env.databaseId,
            env.collections.conversations,
            conversationId,
        );

        const participants = Array.isArray(conversation.participants)
            ? (conversation.participants as string[])
            : [];

        if (!participants.includes(user.$id)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const pinDocs = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "conversation"),
                Query.equal("contextId", conversationId),
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
            env.collections.directMessages,
            [Query.equal("$id", messageIds), Query.limit(50)],
        );

        const messagesById = new Map<string, DirectMessage>();
        for (const doc of messageDocs.documents) {
            const d = doc as unknown as Record<string, unknown>;
            messagesById.set(String(d.$id), {
                $id: String(d.$id),
                conversationId: String(d.conversationId),
                senderId: String(d.senderId),
                receiverId: d.receiverId as string | undefined,
                text: String(d.text || ""),
                imageFileId: d.imageFileId as string | undefined,
                imageUrl: d.imageUrl as string | undefined,
                $createdAt: String(d.$createdAt || ""),
                editedAt: d.editedAt as string | undefined,
                removedAt: d.removedAt as string | undefined,
                removedBy: d.removedBy as string | undefined,
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
