import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { Message, PinnedMessage } from "@/lib/types";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";

type RouteContext = {
    params: Promise<{
        channelId: string;
    }>;
};

/**
 * GET /api/channels/[channelId]/pins
 * Get all pinned messages in a channel
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("GET /api/channels/[channelId]/pins");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated pins fetch attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { channelId } = await context.params;

        addTransactionAttributes({
            channelId,
            userId: user.$id,
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Verify channel exists
        try {
            await databases.getDocument(
                env.databaseId,
                env.collections.channels,
                channelId,
            );
        } catch {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 },
            );
        }

        const pinDocs = await databases.listDocuments(
            env.databaseId,
            env.collections.pinnedMessages,
            [
                Query.equal("contextType", "channel"),
                Query.equal("contextId", channelId),
                Query.orderDesc("pinnedAt"),
                Query.limit(50),
            ],
        );

        const pins = pinDocs.documents as unknown as PinnedMessage[];
        const messageIds = pins.map((pin) => pin.messageId);

        if (messageIds.length === 0) {
            const duration = Date.now() - startTime;
            trackApiCall(
                "/api/channels/[channelId]/pins",
                "GET",
                200,
                duration,
            );

            return NextResponse.json({
                items: [],
                pins: [],
                total: 0,
            });
        }

        const messageDocs = await databases.listDocuments(
            env.databaseId,
            env.collections.messages,
            [Query.equal("$id", messageIds), Query.limit(50)],
        );

        const messagesById = new Map<string, Message>();
        for (const doc of messageDocs.documents) {
            const message = doc as unknown as Message;
            messagesById.set(String(message.$id), message);
        }

        const items = pins
            .map((pin) => {
                const message = messagesById.get(pin.messageId);
                if (!message) {
                    return null;
                }

                const enrichedMessage: Message = {
                    ...message,
                    isPinned: true,
                    pinnedAt: pin.pinnedAt,
                    pinnedBy: pin.pinnedBy,
                };

                return {
                    pin,
                    message: enrichedMessage,
                };
            })
            .filter(Boolean) as Array<{ pin: PinnedMessage; message: Message }>;

        const pinnedMessages = items.map((item) => item.message);

        const duration = Date.now() - startTime;
        trackApiCall("/api/channels/[channelId]/pins", "GET", 200, duration);

        logger.info("Pinned messages fetched successfully", {
            channelId,
            userId: user.$id,
            count: pinnedMessages.length,
        });

        return NextResponse.json({
            items,
            pins: pinnedMessages,
            total: pinnedMessages.length,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to fetch pinned messages", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/channels/[channelId]/pins",
            method: "GET",
        });
        trackApiCall("/api/channels/[channelId]/pins", "GET", 500, duration);

        return NextResponse.json(
            { error: "Failed to fetch pinned messages" },
            { status: 500 },
        );
    }
}
