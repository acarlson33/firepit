import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { DirectMessage, PinnedMessage } from "@/lib/types";

const PIN_LIMIT = 50;

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

async function getParticipants(conversationId: string): Promise<string[]> {
    const env = getEnvConfig();
    const { databases } = getServerClient();

    const conversation = await databases.getDocument(
        env.databaseId,
        env.collections.conversations,
        conversationId,
    );

    if (!Array.isArray(conversation.participants)) {
        return [];
    }

    return conversation.participants as string[];
}

/**
 * POST /api/direct-messages/[messageId]/pin
 * Pins a DM message in its conversation context.
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
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

        if (!message.conversationId) {
            return NextResponse.json(
                { error: "Message has no conversation context" },
                { status: 400 },
            );
        }

        const participants = await getParticipants(message.conversationId);
        if (!participants.includes(user.$id)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "conversation"),
                Query.equal("contextId", message.conversationId),
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
                Query.equal("contextType", "conversation"),
                Query.equal("contextId", message.conversationId),
                Query.limit(PIN_LIMIT + 1),
            ],
        );

        if (count.total >= PIN_LIMIT) {
            return NextResponse.json(
                { error: "Pin limit reached for this conversation" },
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
                contextType: "conversation",
                contextId: message.conversationId,
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
 * DELETE /api/direct-messages/[messageId]/pin
 * Unpins a DM message.
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
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

        if (!message.conversationId) {
            return NextResponse.json(
                { error: "Message has no conversation context" },
                { status: 400 },
            );
        }

        const participants = await getParticipants(message.conversationId);
        if (!participants.includes(user.$id)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "conversation"),
                Query.equal("contextId", message.conversationId),
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
