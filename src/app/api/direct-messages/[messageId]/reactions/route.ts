import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { DirectMessage } from "@/lib/types";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

/**
 * POST /api/direct-messages/[messageId]/reactions
 * Add a reaction to a direct message
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/direct-messages/[messageId]/reactions");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated DM reaction attempt");
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

        const message = (await databases.getDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

        let participants: string[] = [];
        if (message.conversationId) {
            try {
                const conversation = await databases.getDocument(
                    env.databaseId,
                    env.collections.conversations,
                    message.conversationId,
                );
                const conversationParticipants = Array.isArray(
                    conversation.participants,
                )
                    ? (conversation.participants as string[])
                    : [];
                if (conversationParticipants.length > 0) {
                    participants = conversationParticipants;
                }
            } catch {
                // Fall back to sender/receiver when the conversation cannot be fetched
            }
        }

        if (participants.length === 0) {
            participants = Array.from(
                new Set(
                    [message.senderId, message.receiverId].filter(
                        Boolean,
                    ) as string[],
                ),
            );
        }

        if (!participants.includes(user.$id)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        // Initialize reactions array if it doesn't exist
        // Parse reactions from JSON string if needed
        let reactions: Array<{
            emoji: string;
            userIds: string[];
            count: number;
        }> = [];

        if (message.reactions) {
            if (typeof message.reactions === "string") {
                try {
                    reactions = JSON.parse(message.reactions);
                } catch {
                    reactions = [];
                }
            } else if (Array.isArray(message.reactions)) {
                reactions = message.reactions as Array<{
                    emoji: string;
                    userIds: string[];
                    count: number;
                }>;
            }
        }

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
        const updatedMessage = (await databases.updateDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
            {
                reactions: JSON.stringify(reactions),
            },
        )) as unknown as DirectMessage;

        const duration = Date.now() - startTime;
        trackApiCall(
            "/api/direct-messages/[messageId]/reactions",
            "POST",
            200,
            duration,
        );

        logger.info("DM reaction added successfully", {
            messageId,
            userId: user.$id,
            emoji,
            totalReactions: reactions.length,
        });

        return NextResponse.json({
            success: true,
            reactions: updatedMessage.reactions,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to add DM reaction", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/direct-messages/[messageId]/reactions",
            method: "POST",
        });
        trackApiCall(
            "/api/direct-messages/[messageId]/reactions",
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
 * DELETE /api/direct-messages/[messageId]/reactions
 * Remove a reaction from a direct message
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("DELETE /api/direct-messages/[messageId]/reactions");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated DM reaction removal attempt");
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

        const message = (await databases.getDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

        let participants: string[] = [];
        if (message.conversationId) {
            try {
                const conversation = await databases.getDocument(
                    env.databaseId,
                    env.collections.conversations,
                    message.conversationId,
                );
                const conversationParticipants = Array.isArray(
                    conversation.participants,
                )
                    ? (conversation.participants as string[])
                    : [];
                if (conversationParticipants.length > 0) {
                    participants = conversationParticipants;
                }
            } catch {
                // Fall back to sender/receiver when the conversation cannot be fetched
            }
        }

        if (participants.length === 0) {
            participants = Array.from(
                new Set(
                    [message.senderId, message.receiverId].filter(
                        Boolean,
                    ) as string[],
                ),
            );
        }

        if (!participants.includes(user.$id)) {
            logger.warn("User not authorized for this DM", {
                messageId,
                userId: user.$id,
            });
            return NextResponse.json(
                { error: "Not authorized" },
                { status: 403 },
            );
        }

        // Initialize reactions array if it doesn't exist
        // Parse reactions from JSON string if needed
        let reactions: Array<{
            emoji: string;
            userIds: string[];
            count: number;
        }> = [];

        if (message.reactions) {
            if (typeof message.reactions === "string") {
                try {
                    reactions = JSON.parse(message.reactions);
                } catch {
                    reactions = [];
                }
            } else if (Array.isArray(message.reactions)) {
                reactions = message.reactions as Array<{
                    emoji: string;
                    userIds: string[];
                    count: number;
                }>;
            }
        }

        // Find existing reaction for this emoji
        const existingReaction = reactions.find((r) => r.emoji === emoji);

        if (!existingReaction) {
            logger.info("DM reaction not found", {
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
        const updatedMessage = (await databases.updateDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
            {
                reactions: JSON.stringify(reactions),
            },
        )) as unknown as DirectMessage;

        const duration = Date.now() - startTime;
        trackApiCall(
            "/api/direct-messages/[messageId]/reactions",
            "DELETE",
            200,
            duration,
        );

        logger.info("DM reaction removed successfully", {
            messageId,
            userId: user.$id,
            emoji,
            totalReactions: reactions.length,
        });

        return NextResponse.json({
            success: true,
            reactions: updatedMessage.reactions,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to remove DM reaction", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/direct-messages/[messageId]/reactions",
            method: "DELETE",
        });
        trackApiCall(
            "/api/direct-messages/[messageId]/reactions",
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
