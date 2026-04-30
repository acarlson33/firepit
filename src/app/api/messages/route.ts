import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import type { Message, FileAttachment } from "@/lib/types";
import {
    logger,
    recordError,
    recordEvent,
    setTransactionName,
    trackApiCall,
    trackMessage,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import { upsertMentionInboxItems } from "@/lib/inbox-items";
import { resolveMessageImageUrl } from "@/lib/message-image-url";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import {
    buildMessagePoll,
    isPollCommand,
    parsePollCommand,
    serializePollOptions,
} from "@/lib/polls";
import {
    buildAttachmentDocumentData,
    buildLegacyAttachmentDocumentData,
    isUnknownAttachmentAttributeError,
    normalizeFileAttachmentsInput,
} from "@/lib/file-attachments";
import { normalizeMentionIds } from "@/lib/mentions";

const MESSAGE_ATTACHMENTS_COLLECTION_ID =
    process.env.APPWRITE_MESSAGE_ATTACHMENTS_COLLECTION_ID ||
    "message_attachments";

async function getMessageDocument(
    messageId: string,
): Promise<Record<string, unknown> | null> {
    const env = getEnvConfig();
    const { databases } = getServerClient();

    try {
        return (await databases.getDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
        )) as unknown as Record<string, unknown>;
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

function normalizeStringField(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

// Helper function to create attachment records
async function createAttachments(
    messageId: string,
    messageType: "channel" | "dm",
    attachments: FileAttachment[],
): Promise<void> {
    if (!attachments || attachments.length === 0) {
        return;
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();

    await Promise.all(
        attachments.map(async (attachment) => {
            const payload = buildAttachmentDocumentData({
                attachment,
                messageId,
                messageType,
            });

            try {
                await databases.createDocument(
                    env.databaseId,
                    MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    ID.unique(),
                    payload,
                );
            } catch (error) {
                if (!isUnknownAttachmentAttributeError(error)) {
                    throw error;
                }

                logger.warn(
                    "Using legacy attachment payload fallback for message attachment write",
                    {
                        attachmentFileId: attachment.fileId,
                        attachmentMediaKind: attachment.mediaKind,
                        attachmentSource: attachment.source,
                        messageId,
                        messageType,
                        reason:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );

                await databases.createDocument(
                    env.databaseId,
                    MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    ID.unique(),
                    buildLegacyAttachmentDocumentData({
                        attachment,
                        messageId,
                        messageType,
                    }),
                );
            }
        }),
    );
}

/**
 * POST /api/messages
 * Sends a message to a channel
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/messages");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated message attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const env = getEnvConfig();
        const body = await request.json();
        const {
            text,
            channelId,
            imageFileId,
            imageUrl,
            replyToId,
            mentions,
            attachments,
        } = body;

        const normalizedAttachmentsResult = normalizeFileAttachmentsInput(
            attachments,
        );
        if (!normalizedAttachmentsResult.ok) {
            return NextResponse.json(
                { error: normalizedAttachmentsResult.error },
                { status: 400 },
            );
        }
        const normalizedAttachments = normalizedAttachmentsResult.attachments;

        const normalizedText = typeof text === "string" ? text : "";
        const creatingPoll = isPollCommand(normalizedText);
        const validMentions = !creatingPoll ? normalizeMentionIds(mentions) : [];
        const hasValidMentions = validMentions.length > 0;
        let parsedPoll: ReturnType<typeof parsePollCommand> | null = null;

        if (creatingPoll) {
            try {
                parsedPoll = parsePollCommand(normalizedText);
            } catch (error) {
                return NextResponse.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Invalid poll command.",
                    },
                    { status: 400 },
                );
            }
        }

        if (creatingPoll && (imageFileId || normalizedAttachments.length > 0)) {
            return NextResponse.json(
                {
                    error: "Poll messages do not support image or file attachments.",
                },
                { status: 400 },
            );
        }

        if (normalizedText && normalizedText.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
            );
        }

        if (
            (!text &&
                !imageFileId &&
                normalizedAttachments.length === 0) ||
            !channelId
        ) {
            return NextResponse.json(
                {
                    error: "text, imageFileId, or attachments, and channelId are required",
                },
                { status: 400 },
            );
        }

        const userId = user.$id;
        const userName = user.name;

        addTransactionAttributes({
            userId,
            channelId,
            serverId: "unresolved",
            hasImage: !!imageFileId,
            hasAttachments: normalizedAttachments.length > 0,
            isReply: !!replyToId,
            hasMentions: hasValidMentions,
        }); // Create message permissions
        const permissions = perms.message(userId, {
            mod: env.teams.moderatorTeamId,
            admin: env.teams.adminTeamId,
        });

        const { databases } = getServerClient();

        const access = await getChannelAccessForUser(
            databases,
            env,
            String(channelId),
            userId,
        );
        if (!access.isMember || !access.canSend) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const normalizedChannelId = normalizeStringField(channelId);
        if (!normalizedChannelId) {
            return NextResponse.json(
                { error: "Invalid channelId" },
                { status: 400 },
            );
        }
        const normalizedServerId = normalizeStringField(access.serverId);

        const transactionAttributes: Record<string, string | number | boolean> =
            {
                channelId: normalizedChannelId,
            };
        if (normalizedServerId) {
            transactionAttributes.serverId = normalizedServerId;
        }

        addTransactionAttributes(transactionAttributes);

        const messageData: Record<string, unknown> = {
            userId,
            text: parsedPoll ? parsedPoll.question : normalizedText || "",
            userName,
            channelId: normalizedChannelId,
        };

        if (normalizedServerId) {
            messageData.serverId = normalizedServerId;
        }

        // Add image fields if provided
        if (imageFileId) {
            messageData.imageFileId = imageFileId;
        }
        if (imageUrl) {
            messageData.imageUrl = imageUrl;
        }
        // Add reply field if provided
        if (replyToId) {
            messageData.replyToId = replyToId;
        }
        // Add mentions array if provided
        if (hasValidMentions) {
            messageData.mentions = validMentions;
        }

        const dbStartTime = Date.now();
        const res = await databases.createDocument(
            env.databaseId,
            env.collections.messages,
            ID.unique(),
            messageData,
            permissions,
        );

        let pollResponse: Message["poll"];

        if (parsedPoll) {
            const serializedOptions = serializePollOptions(parsedPoll.options);
            const pollDocument = await databases.createDocument(
                env.databaseId,
                env.collections.polls,
                ID.unique(),
                {
                    messageId: String(res.$id),
                    channelId: normalizedChannelId,
                    question: parsedPoll.question,
                    options: serializedOptions,
                    status: "open",
                    createdBy: userId,
                },
                permissions,
            );

            pollResponse = buildMessagePoll({
                poll: {
                    $id: String(pollDocument.$id),
                    messageId: String(res.$id),
                    channelId: normalizedChannelId,
                    question: parsedPoll.question,
                    options: serializedOptions,
                    status: "open",
                    createdBy: userId,
                },
                votes: [],
            });
        }

        // Track database operation
        trackApiCall("/api/messages", "POST", 200, Date.now() - dbStartTime, {
            operation: "createDocument",
            collection: "messages",
        });

        // Create attachment records if provided
        if (normalizedAttachments.length > 0) {
            await createAttachments(
                String(res.$id),
                "channel",
                normalizedAttachments,
            );
        }

        if (hasValidMentions) {
            await upsertMentionInboxItems({
                authorUserId: userId,
                contextId: normalizedChannelId,
                contextKind: "channel",
                latestActivityAt: String(
                    res.$createdAt ?? new Date().toISOString(),
                ),
                mentions: validMentions,
                messageId: String(res.$id),
                previewText: text || "",
                serverId: normalizedServerId,
            });
        }

        const doc = res as unknown as Record<string, unknown>;
        const message: Message = {
            $id: String(doc.$id),
            userId: String(doc.userId),
            userName: doc.userName as string | undefined,
            text: String(doc.text),
            $createdAt: String(doc.$createdAt ?? ""),
            channelId: doc.channelId as string | undefined,
            removedAt: doc.removedAt as string | undefined,
            removedBy: doc.removedBy as string | undefined,
            serverId: doc.serverId as string | undefined,
            imageFileId: doc.imageFileId as string | undefined,
            imageUrl: resolveMessageImageUrl({
                imageFileId: doc.imageFileId,
                imageUrl: doc.imageUrl,
            }),
            replyToId: doc.replyToId as string | undefined,
            mentions: Array.isArray(doc.mentions)
                ? (doc.mentions as string[])
                : undefined,
            poll: pollResponse,
        };

        // Track message sent event
        trackMessage("sent", "channel", {
            messageId: message.$id,
            userId,
            channelId: normalizedChannelId,
            serverId: normalizedServerId,
            hasImage: !!imageFileId,
            hasAttachments: normalizedAttachments.length > 0,
            attachmentCount: normalizedAttachments.length,
            isReply: !!replyToId,
            textLength: normalizedText.length,
        });

        recordEvent("message_sent", {
            actorUserId: userId,
            channelId: normalizedChannelId,
            hasAttachments: normalizedAttachments.length > 0,
            hasImage: Boolean(imageFileId),
            isReply: Boolean(replyToId),
            isPoll: Boolean(parsedPoll),
            messageId: message.$id,
            messageType: "channel",
            serverId: normalizedServerId,
            totalQueryTimeMs: Date.now() - startTime,
        });

        logger.info("Message sent", {
            messageId: message.$id,
            userId,
            channelId,
            hasAttachments: normalizedAttachments.length > 0,
            isPoll: Boolean(parsedPoll),
            duration: Date.now() - startTime,
        });

        // Add attachments to message object for response (they'll be fetched when listing messages)
        if (normalizedAttachments.length > 0) {
            message.attachments = normalizedAttachments;
        }

        return NextResponse.json({ message });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/messages",
            endpoint: "/api/messages",
        });

        logger.error("Failed to send message", {
            error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to send message",
            },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/messages?id=MESSAGE_ID
 * Edits a message (user must own the message)
 */
export async function PATCH(request: NextRequest) {
    const startTime = Date.now();

    try {
        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("id");
        const body = await request.json();
        const { text } = body;

        if (!messageId || !text) {
            return NextResponse.json(
                { error: "id and text are required" },
                { status: 400 },
            );
        }

        if (text.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const existing = await getMessageDocument(messageId);
        if (!existing) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 },
            );
        }

        if (String(existing.userId) !== user.$id) {
            return NextResponse.json(
                { error: "You can only edit your own messages" },
                { status: 403 },
            );
        }

        // Update the message with new text and editedAt timestamp
        const editedAt = new Date().toISOString();
        const res = await databases.updateDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
            { text, editedAt },
        );

        const doc = res as unknown as Record<string, unknown>;
        const message: Message = {
            $id: String(doc.$id),
            userId: String(doc.userId),
            userName: doc.userName as string | undefined,
            text: String(doc.text),
            $createdAt: String(doc.$createdAt ?? ""),
            channelId: normalizeStringField(doc.channelId),
            editedAt: normalizeStringField(doc.editedAt),
            removedAt: normalizeStringField(doc.removedAt),
            removedBy: normalizeStringField(doc.removedBy),
            serverId: normalizeStringField(doc.serverId),
            imageFileId: normalizeStringField(doc.imageFileId),
            imageUrl: normalizeStringField(doc.imageUrl),
            replyToId: normalizeStringField(doc.replyToId),
        };

        recordEvent("message_edited", {
            actorUserId: user.$id,
            channelId: message.channelId,
            messageId,
            messageType: "channel",
            serverId: message.serverId,
            totalQueryTimeMs: Date.now() - startTime,
        });

        return NextResponse.json({ message });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to edit message",
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/messages?id=MESSAGE_ID
 * Deletes a message (user must own the message)
 */
export async function DELETE(request: NextRequest) {
    const startTime = Date.now();

    try {
        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("id");

        if (!messageId) {
            return NextResponse.json(
                { error: "id is required" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const existing = await getMessageDocument(messageId);
        if (!existing) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 },
            );
        }

        if (String(existing.userId) !== user.$id) {
            return NextResponse.json(
                { error: "You can only delete your own messages" },
                { status: 403 },
            );
        }

        await databases.deleteDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
        );

        const normalizedDeletedChannelId = normalizeStringField(
            existing.channelId,
        );
        const normalizedDeletedServerId = normalizeStringField(
            existing.serverId,
        );

        recordEvent("message_deleted", {
            actorUserId: user.$id,
            channelId: normalizedDeletedChannelId,
            messageId,
            messageType: "channel",
            serverId: normalizedDeletedServerId,
            totalQueryTimeMs: Date.now() - startTime,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to delete message",
            },
            { status: 500 },
        );
    }
}
