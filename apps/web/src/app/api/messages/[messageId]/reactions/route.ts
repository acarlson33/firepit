import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import type { Message } from "@/lib/types";
import { parseReactions } from "@/lib/reactions-utils";
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
        messageId: string;
    }>;
};

/**
 * POST /api/messages/[messageId]/reactions
 * Add a reaction to a message
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/messages/[messageId]/reactions");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated reaction attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;
        const body = await request.json();
        const { emoji } = body;

        if (!emoji || typeof emoji !== "string") {
            return NextResponse.json(
                { error: "emoji is required and must be a string" },
                { status: 400 },
            );
        }

        addTransactionAttributes({
            messageId,
            userId: user.$id,
            emoji,
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const maxUpdateAttempts = 3;
        let updatedMessage: Message | null = null;

        for (let attempt = 0; attempt < maxUpdateAttempts; attempt += 1) {
            // Get the current message
            const message = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                messageId,
            )) as unknown as Message;

            if (message.channelId) {
                const access = await getChannelAccessForUser(
                    databases,
                    env,
                    message.channelId,
                    user.$id,
                );
                if (!access.isMember || !access.canRead) {
                    return returnForbidden();
                }
            }

            const reactions = parseReactions(message.reactions);

            // Find existing reaction for this emoji
            const existingReaction = reactions.find((r) => r.emoji === emoji);

            if (existingReaction) {
                // Check if user already reacted with this emoji
                if (existingReaction.userIds.includes(user.$id)) {
                    logger.info("User already reacted with this emoji", {
                        messageId,
                        userId: user.$id,
                        emoji,
                    });
                    return NextResponse.json(
                        { error: "You already reacted with this emoji" },
                        { status: 400 },
                    );
                }

                // Add user to existing reaction
                existingReaction.userIds.push(user.$id);
                existingReaction.count = existingReaction.userIds.length;
            } else {
                // Create new reaction
                reactions.push({
                    emoji,
                    userIds: [user.$id],
                    count: 1,
                });
            }

            // Update the message with new reactions
            try {
                updatedMessage = (await databases.updateDocument(
                    env.databaseId,
                    env.collections.messages,
                    messageId,
                    {
                        reactions: JSON.stringify(reactions),
                    },
                )) as unknown as Message;
                break;
            } catch (updateError) {
                const isConflict =
                    !!updateError &&
                    typeof updateError === "object" &&
                    (updateError as { code?: unknown }).code === 409;
                if (!isConflict) {
                    throw updateError;
                }
                logger.warn("Reaction update conflict, retrying", {
                    attempt: attempt + 1,
                    messageId,
                    emoji,
                });
            }
        }

        if (!updatedMessage) {
            return NextResponse.json(
                { error: "Failed to add reaction" },
                { status: 500 },
            );
        }

        const duration = Date.now() - startTime;
        trackApiCall(
            "/api/messages/[messageId]/reactions",
            "POST",
            200,
            duration,
        );

        logger.info("Reaction added successfully", {
            messageId,
            userId: user.$id,
            emoji,
            totalReactions: parseReactions(updatedMessage.reactions).length,
        });

        return NextResponse.json({
            success: true,
            reactions: updatedMessage.reactions,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to add reaction", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/messages/[messageId]/reactions",
            method: "POST",
        });
        trackApiCall(
            "/api/messages/[messageId]/reactions",
            "POST",
            500,
            duration,
        );

        return NextResponse.json(
            { error: "Failed to add reaction" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/messages/[messageId]/reactions
 * Remove a reaction from a message
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("DELETE /api/messages/[messageId]/reactions");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated reaction removal attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;
        const url = new URL(request.url);
        const emoji = url.searchParams.get("emoji");

        if (!emoji) {
            return NextResponse.json(
                { error: "emoji query parameter is required" },
                { status: 400 },
            );
        }

        addTransactionAttributes({
            messageId,
            userId: user.$id,
            emoji,
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const maxUpdateAttempts = 3;
        let updatedMessage: Message | null = null;

        for (let attempt = 0; attempt < maxUpdateAttempts; attempt += 1) {
            // Get the current message
            const message = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                messageId,
            )) as unknown as Message;

            if (message.channelId) {
                const access = await getChannelAccessForUser(
                    databases,
                    env,
                    message.channelId,
                    user.$id,
                );
                if (!access.isMember || !access.canRead) {
                    return returnForbidden();
                }
            }

            let reactions = parseReactions(message.reactions);

            // Find existing reaction for this emoji
            const existingReaction = reactions.find((r) => r.emoji === emoji);

            if (!existingReaction) {
                logger.info("Reaction not found", {
                    messageId,
                    userId: user.$id,
                    emoji,
                });
                return NextResponse.json(
                    { error: "Reaction not found" },
                    { status: 404 },
                );
            }

            // Check if user has reacted with this emoji
            if (!existingReaction.userIds.includes(user.$id)) {
                logger.info("User has not reacted with this emoji", {
                    messageId,
                    userId: user.$id,
                    emoji,
                });
                return NextResponse.json(
                    { error: "You have not reacted with this emoji" },
                    { status: 400 },
                );
            }

            // Remove user from reaction
            existingReaction.userIds = existingReaction.userIds.filter(
                (id) => id !== user.$id,
            );
            existingReaction.count = existingReaction.userIds.length;

            // If no users left, remove the entire reaction
            if (existingReaction.count === 0) {
                reactions = reactions.filter((r) => r.emoji !== emoji);
            }

            // Update the message with new reactions
            try {
                updatedMessage = (await databases.updateDocument(
                    env.databaseId,
                    env.collections.messages,
                    messageId,
                    {
                        reactions: JSON.stringify(reactions),
                    },
                )) as unknown as Message;
                break;
            } catch (updateError) {
                const isConflict =
                    !!updateError &&
                    typeof updateError === "object" &&
                    (updateError as { code?: unknown }).code === 409;
                if (!isConflict) {
                    throw updateError;
                }
                logger.warn("Reaction update conflict, retrying", {
                    attempt: attempt + 1,
                    messageId,
                    emoji,
                });
            }
        }

        if (!updatedMessage) {
            return NextResponse.json(
                { error: "Failed to remove reaction" },
                { status: 500 },
            );
        }

        const duration = Date.now() - startTime;
        trackApiCall(
            "/api/messages/[messageId]/reactions",
            "DELETE",
            200,
            duration,
        );

        logger.info("Reaction removed successfully", {
            messageId,
            userId: user.$id,
            emoji,
            totalReactions: parseReactions(updatedMessage.reactions).length,
        });

        return NextResponse.json({
            success: true,
            reactions: updatedMessage.reactions,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to remove reaction", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/messages/[messageId]/reactions",
            method: "DELETE",
        });
        trackApiCall(
            "/api/messages/[messageId]/reactions",
            "DELETE",
            500,
            duration,
        );

        return NextResponse.json(
            { error: "Failed to remove reaction" },
            { status: 500 },
        );
    }
}
