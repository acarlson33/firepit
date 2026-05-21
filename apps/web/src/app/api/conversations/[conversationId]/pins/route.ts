import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { buildPinsResponse } from "@/lib/pin-response";
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
                Query.orderDesc("pinnedAt"),
                Query.limit(50),
            ],
        );

        const pins = pinDocs.documents as unknown as PinnedMessage[];
        const messageIds = pins.map((pin) => pin.messageId);

        if (messageIds.length === 0) {
            return NextResponse.json({
                items: [],
                pins: [],
                total: 0,
            });
        }

        const messageDocs = await databases.listDocuments(
            env.databaseId,
            env.collections.directMessages,
            [Query.equal("$id", messageIds), Query.limit(50)],
        );

        const messagesById = new Map<string, DirectMessage>();
        for (const doc of messageDocs.documents) {
            const message = doc as unknown as DirectMessage;
            messagesById.set(String(message.$id), message);
        }

        return NextResponse.json(buildPinsResponse(pins, messagesById));
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
