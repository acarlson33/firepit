import { NextResponse } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { getServerSession } from "@/lib/auth-server";
import { buildPinsResponse, listPinnedMessages } from "@/lib/pin-response";
import { returnForbidden, logger } from "@/lib/newrelic-utils";

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

        let conversation: Record<string, unknown>;
        try {
            const conversationRes = await databases.getDocument(
                env.databaseId,
                env.collections.conversations,
                conversationId,
            );
            conversation = conversationRes as unknown as Record<
                string,
                unknown
            >;
        } catch (error) {
            if (isDocumentNotFoundError(error)) {
                return NextResponse.json(
                    { error: "Conversation not found" },
                    { status: 404 },
                );
            }
            throw error;
        }

        const participants = Array.isArray(conversation.participants)
            ? (conversation.participants as string[])
            : [];

        if (!participants.includes(user.$id)) {
            return returnForbidden();
        }

        const pinData = await listPinnedMessages({
            databases,
            env,
            contextType: "conversation",
            contextId: conversationId,
            messageCollectionId: env.collections.directMessages,
        });

        if (!pinData) {
            return NextResponse.json({
                items: [],
                pins: [],
                total: 0,
            });
        }

        return NextResponse.json(
            buildPinsResponse(pinData.pins, pinData.messagesById),
        );
    } catch (error) {
        logger.error("Failed to fetch pinned messages", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch pinned messages" },
            { status: 500 },
        );
    }
}
