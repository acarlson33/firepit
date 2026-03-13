import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query, ID } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { Message } from "@/lib/types";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";
import { upsertMentionInboxItems } from "@/lib/inbox-items";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

/**
 * GET /api/messages/[messageId]/thread
 * Get all replies in a thread (messages where threadId = messageId)
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("GET /api/messages/[messageId]/thread");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated thread fetch attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;
        const url = new URL(request.url);
        const rawLimit = Number(url.searchParams.get("limit"));
        const limit =
            Number.isFinite(rawLimit) && rawLimit > 0
                ? Math.min(rawLimit, 100)
                : 50;
        const cursor = url.searchParams.get("cursor");

        addTransactionAttributes({
            messageId,
            userId: user.$id,
            limit,
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // First, get the parent message to verify it exists
        let parentMessage: Message;
        try {
            parentMessage = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                messageId,
            )) as unknown as Message;
        } catch {
            return NextResponse.json(
                { error: "Parent message not found" },
                { status: 404 },
            );
        }

        // Build query for thread replies
        const queries = [
            Query.equal("threadId", messageId),
            Query.orderAsc("$createdAt"),
            Query.limit(limit),
        ];

        if (cursor) {
            queries.push(Query.cursorAfter(cursor));
        }

        // Fetch thread replies
        const response = await databases.listDocuments(
            env.databaseId,
            env.collections.messages,
            queries,
        );

        const threadReplies = response.documents as unknown as Message[];

        const duration = Date.now() - startTime;
        trackApiCall("/api/messages/[messageId]/thread", "GET", 200, duration);

        logger.info("Thread replies fetched successfully", {
            messageId,
            userId: user.$id,
            replyCount: threadReplies.length,
        });

        return NextResponse.json({
            items: threadReplies,
            parentMessage,
            replies: threadReplies,
            total: response.total,
            hasMore: response.documents.length === limit,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to fetch thread replies", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/messages/[messageId]/thread",
            method: "GET",
        });
        trackApiCall("/api/messages/[messageId]/thread", "GET", 500, duration);

        return NextResponse.json(
            { error: "Failed to fetch thread replies" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/messages/[messageId]/thread
 * Reply to a thread (create a message with threadId set to the parent message)
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/messages/[messageId]/thread");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated thread reply attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { messageId } = await context.params;
        const body = await request.json();
        const { text, imageFileId, imageUrl, attachments, mentions } = body;

        if (
            !text &&
            !imageFileId &&
            (!attachments || attachments.length === 0)
        ) {
            return NextResponse.json(
                { error: "text, imageFileId, or attachments required" },
                { status: 400 },
            );
        }

        addTransactionAttributes({
            messageId,
            userId: user.$id,
            hasText: Boolean(text),
            hasImage: Boolean(imageFileId),
        });

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Get the parent message to inherit channelId/serverId
        let parentMessage: Message;
        try {
            parentMessage = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                messageId,
            )) as unknown as Message;
        } catch {
            return NextResponse.json(
                { error: "Parent message not found" },
                { status: 404 },
            );
        }

        // If parent is already a thread reply, use its threadId (flatten threads to single level)
        const actualThreadId = parentMessage.threadId ?? messageId;

        // Create the thread reply message
        const messageData: Record<string, unknown> = {
            userId: user.$id,
            userName: user.name,
            text: text || "",
            channelId: parentMessage.channelId,
            serverId: parentMessage.serverId,
            threadId: actualThreadId,
        };

        if (imageFileId) {
            messageData.imageFileId = imageFileId;
        }
        if (imageUrl) {
            messageData.imageUrl = imageUrl;
        }
        if (attachments && attachments.length > 0) {
            messageData.attachments = JSON.stringify(attachments);
        }
        if (mentions && mentions.length > 0) {
            messageData.mentions = JSON.stringify(mentions);
        }

        // Set permissions
        const permissions = perms.message(user.$id, {
            mod: env.teams.moderatorTeamId,
            admin: env.teams.adminTeamId,
        });

        // Create the thread reply
        const newReply = await databases.createDocument(
            env.databaseId,
            env.collections.messages,
            ID.unique(),
            messageData,
            permissions,
        );

        // Update parent message (thread root) with bounded retry on conflicts.
        const actualParentId = parentMessage.threadId ?? messageId;
        const maxUpdateAttempts = 3;

        for (let attempt = 0; attempt < maxUpdateAttempts; attempt += 1) {
            const actualParent = (await databases.getDocument(
                env.databaseId,
                env.collections.messages,
                actualParentId,
            )) as unknown as Message;

            let participants: string[] = [];
            if (actualParent.threadParticipants) {
                if (typeof actualParent.threadParticipants === "string") {
                    try {
                        participants = JSON.parse(
                            actualParent.threadParticipants,
                        );
                    } catch {
                        participants = [];
                    }
                } else if (Array.isArray(actualParent.threadParticipants)) {
                    participants = actualParent.threadParticipants;
                }
            }

            if (!participants.includes(user.$id)) {
                participants.push(user.$id);
            }

            const nextCount =
                (actualParent.threadMessageCount ??
                    actualParent.threadReplyCount ??
                    0) + 1;

            try {
                await databases.updateDocument(
                    env.databaseId,
                    env.collections.messages,
                    actualParentId,
                    {
                        threadMessageCount: nextCount,
                        threadParticipants: participants,
                        lastThreadReplyAt: new Date().toISOString(),
                    },
                );
                break;
            } catch (updateError) {
                if (attempt === maxUpdateAttempts - 1) {
                    throw updateError;
                }
            }
        }

        if (mentions && Array.isArray(mentions) && mentions.length > 0) {
            await upsertMentionInboxItems({
                authorUserId: user.$id,
                contextId: String(parentMessage.channelId),
                contextKind: "channel",
                latestActivityAt: String(
                    newReply.$createdAt ?? new Date().toISOString(),
                ),
                mentions,
                messageId: String(newReply.$id),
                parentMessageId: actualThreadId,
                previewText: text || "",
                serverId: parentMessage.serverId,
            });
        }

        const duration = Date.now() - startTime;
        trackApiCall("/api/messages/[messageId]/thread", "POST", 201, duration);

        logger.info("Thread reply created successfully", {
            messageId,
            replyId: newReply.$id,
            userId: user.$id,
        });

        return NextResponse.json(
            {
                success: true,
                message: newReply,
                reply: newReply,
                threadId: actualThreadId,
            },
            { status: 201 },
        );
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Failed to create thread reply", {
            error: error instanceof Error ? error.message : String(error),
        });
        recordError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/messages/[messageId]/thread",
            method: "POST",
        });
        trackApiCall("/api/messages/[messageId]/thread", "POST", 500, duration);

        return NextResponse.json(
            { error: "Failed to create thread reply" },
            { status: 500 },
        );
    }
}
