import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { getServerSession } from "@/lib/auth-server";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import { buildPinsResponse, listPinnedMessages } from "@/lib/pin-response";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
    returnForbidden,
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
        } catch (error) {
            if (isDocumentNotFoundError(error)) {
                return NextResponse.json(
                    { error: "Channel not found" },
                    { status: 404 },
                );
            }
            throw error;
        }

        const access = await getChannelAccessForUser(
            databases,
            env,
            channelId,
            user.$id,
        );
        if (!access.isMember || !access.canRead) {
            return returnForbidden();
        }

        const pinData = await listPinnedMessages({
            databases,
            env,
            contextType: "channel",
            contextId: channelId,
            messageCollectionId: env.collections.messages,
        });

        if (!pinData) {
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

        const response = buildPinsResponse(pinData.pins, pinData.messagesById);

        const duration = Date.now() - startTime;
        trackApiCall("/api/channels/[channelId]/pins", "GET", 200, duration);

        logger.info("Pinned messages fetched successfully", {
            channelId,
            userId: user.$id,
            count: response.total,
        });

        return NextResponse.json(response);
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
