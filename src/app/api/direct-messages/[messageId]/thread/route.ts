import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Permission, Query, Role } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { upsertMentionInboxItems } from "@/lib/inbox-items";
import { logger } from "@/lib/newrelic-utils";
import type { DirectMessage, FileAttachment } from "@/lib/types";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";
import {
    buildAttachmentDocumentData,
    buildLegacyAttachmentDocumentData,
    isUnknownAttachmentAttributeError,
    normalizeFileAttachmentsInput,
} from "@/lib/file-attachments";

const MESSAGE_ATTACHMENTS_COLLECTION_ID =
    process.env.APPWRITE_MESSAGE_ATTACHMENTS_COLLECTION_ID ||
    "message_attachments";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function updateThreadMetadataWithRetries(params: {
    actualThreadId: string;
    conversationId: string;
    databases: ReturnType<typeof getServerClient>["databases"];
    env: ReturnType<typeof getEnvConfig>;
    maxUpdateAttempts: number;
    replyCreatedAt: string;
    userId: string;
}) {
    const {
        actualThreadId,
        conversationId,
        databases,
        env,
        maxUpdateAttempts,
        replyCreatedAt,
        userId,
    } = params;

    async function attemptUpdate(attempt: number): Promise<void> {
        const latestParent = (await databases.getDocument(
            env.databaseId,
            env.collections.directMessages,
            actualThreadId,
        )) as unknown as DirectMessage;

        let existingParticipants: string[] = [];
        if (Array.isArray(latestParent.threadParticipants)) {
            existingParticipants = latestParent.threadParticipants.filter(
                (participant): participant is string =>
                    typeof participant === "string",
            );
        } else if (typeof latestParent.threadParticipants === "string") {
            try {
                const parsedParticipants = JSON.parse(
                    latestParent.threadParticipants,
                );
                existingParticipants = Array.isArray(parsedParticipants)
                    ? parsedParticipants.filter(
                          (participant): participant is string =>
                              typeof participant === "string",
                      )
                    : [];
            } catch {
                existingParticipants = [];
            }
        }

        const nextParticipants = Array.from(
            new Set([...existingParticipants, userId]),
        );

        // Use authoritative thread reply total to avoid lost increments under concurrency.
        const replies = await databases.listDocuments(
            env.databaseId,
            env.collections.directMessages,
            [
                Query.equal("conversationId", conversationId),
                Query.equal("threadId", actualThreadId),
                Query.limit(1),
            ],
        );

        const nextCount = Math.max(
            latestParent.threadMessageCount || 0,
            replies.total,
        );
        try {
            await databases.updateDocument(
                env.databaseId,
                env.collections.directMessages,
                actualThreadId,
                {
                    threadMessageCount: nextCount,
                    threadParticipants: nextParticipants,
                    lastThreadReplyAt: replyCreatedAt,
                },
            );

            // Best-effort verification to reduce lost updates when concurrent writes race.
            const refreshedParent = (await databases.getDocument(
                env.databaseId,
                env.collections.directMessages,
                actualThreadId,
            )) as unknown as DirectMessage;
            const refreshedParticipants = Array.isArray(
                refreshedParent.threadParticipants,
            )
                ? refreshedParent.threadParticipants.filter(
                      (participant): participant is string =>
                          typeof participant === "string",
                  )
                : [];
            const refreshedCount =
                typeof refreshedParent.threadMessageCount === "number"
                    ? refreshedParent.threadMessageCount
                    : 0;

            if (
                !refreshedParticipants.includes(userId) ||
                refreshedCount < nextCount
            ) {
                throw new Error(
                    "Thread metadata reconciliation requires retry",
                );
            }
        } catch (updateError) {
            if (attempt >= maxUpdateAttempts - 1) {
                logger.warn(
                    "Failed to update DM thread metadata after retries",
                    {
                        actualThreadId,
                        userId,
                        threadMessageCount: nextCount,
                        participantCount: nextParticipants.length,
                        lastThreadReplyAt: replyCreatedAt,
                        error:
                            updateError instanceof Error
                                ? updateError.message
                                : String(updateError),
                    },
                );
                return;
            }

            const backoffMs = Math.min(400, 75 * 2 ** attempt);
            await sleep(backoffMs);
            await attemptUpdate(attempt + 1);
        }
    }

    await attemptUpdate(0);
}

async function createAttachments(
    messageId: string,
    attachments: FileAttachment[],
): Promise<void> {
    if (!attachments || attachments.length === 0) {
        return;
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();
    const createdAttachmentIds: string[] = [];

    try {
        for (const attachment of attachments) {
            const payload = buildAttachmentDocumentData({
                attachment,
                messageId,
                messageType: "dm",
            });

            try {
                const documentId = ID.unique();
                await databases.createDocument(
                    env.databaseId,
                    MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    documentId,
                    payload,
                );
                createdAttachmentIds.push(documentId);
            } catch (error) {
                if (!isUnknownAttachmentAttributeError(error)) {
                    throw error;
                }

                logger.info(
                    "Using legacy attachment payload fallback for DM thread attachment write",
                    {
                        attachmentFileId: attachment.fileId,
                        attachmentFileName: attachment.fileName,
                        messageId,
                        reason:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );

                const legacyDocumentId = ID.unique();
                await databases.createDocument(
                    env.databaseId,
                    MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    legacyDocumentId,
                    buildLegacyAttachmentDocumentData({
                        attachment,
                        messageId,
                        messageType: "dm",
                    }),
                );
                createdAttachmentIds.push(legacyDocumentId);
            }
        }
    } catch (error) {
        const rollbackResults = await Promise.allSettled(
            createdAttachmentIds.map((attachmentDocumentId) =>
                databases.deleteDocument(
                    env.databaseId,
                    MESSAGE_ATTACHMENTS_COLLECTION_ID,
                    attachmentDocumentId,
                ),
            ),
        );

        for (const [index, rollbackResult] of rollbackResults.entries()) {
            if (rollbackResult.status !== "rejected") {
                continue;
            }

            logger.warn("Failed to rollback DM thread attachment document", {
                attachmentDocumentId: createdAttachmentIds[index],
                messageId,
                reason:
                    rollbackResult.reason instanceof Error
                        ? rollbackResult.reason.message
                        : String(rollbackResult.reason),
            });
        }

        throw error;
    }
}

function parseLimit(url: string): number {
    const { searchParams } = new URL(url);
    const raw = Number(searchParams.get("limit") || "50");
    if (!Number.isFinite(raw) || raw < 1) {
        return 50;
    }
    return Math.min(raw, 100);
}

function parseCursor(url: string): string | null {
    const { searchParams } = new URL(url);
    return searchParams.get("cursor");
}

async function getConversationParticipants(
    conversationId: string,
): Promise<string[]> {
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
 * GET /api/direct-messages/[messageId]/thread
 * Returns thread replies for a parent DM message.
 */
export async function GET(request: NextRequest, context: RouteContext) {
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
        const limit = parseLimit(request.url);
        const cursor = parseCursor(request.url);

        const parent = (await databases.getDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

        const actualThreadId = parent.threadId ?? messageId;

        if (!parent.conversationId) {
            return NextResponse.json(
                { error: "Parent message has no conversation context" },
                { status: 400 },
            );
        }

        const participants = await getConversationParticipants(
            parent.conversationId,
        );
        if (!participants.includes(user.$id)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const docs = await databases.listDocuments(
            env.databaseId,
            env.collections.directMessages,
            [
                Query.equal("conversationId", parent.conversationId),
                Query.equal("threadId", actualThreadId),
                Query.orderAsc("$createdAt"),
                Query.limit(limit),
                ...(cursor ? [Query.cursorAfter(cursor)] : []),
            ],
        );

        const items = docs.documents.map((doc) => {
            return doc as unknown as DirectMessage;
        });

        const parentMessage = parent.threadId
            ? ((await databases.getDocument(
                  env.databaseId,
                  env.collections.directMessages,
                  actualThreadId,
              )) as unknown as DirectMessage)
            : parent;

        return NextResponse.json({
            items,
            parentMessage,
            replies: items,
            total: docs.total,
            hasMore: docs.documents.length === limit,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch thread",
            },
            { status: 500 },
        );
    }
}

/**
 * POST /api/direct-messages/[messageId]/thread
 * Creates a thread reply for a parent DM message.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { text, imageFileId, imageUrl, mentions, attachments } = body as {
            text?: string;
            imageFileId?: string;
            imageUrl?: string;
            mentions?: string[];
            attachments?: unknown;
        };

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

        if (
            (!text || text.trim().length === 0) &&
            !imageFileId &&
            normalizedAttachments.length === 0
        ) {
            return NextResponse.json(
                {
                    error: "text, imageFileId, or attachments are required",
                },
                { status: 400 },
            );
        }

        if (text && text.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json(
                {
                    error: MESSAGE_TOO_LONG_ERROR,
                    maxLength: MAX_MESSAGE_LENGTH,
                },
                { status: 400 },
            );
        }

        const { messageId } = await context.params;
        const env = getEnvConfig();
        const { databases } = getServerClient();

        const parent = (await databases.getDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

        const actualThreadId = parent.threadId ?? messageId;

        if (!parent.conversationId) {
            return NextResponse.json(
                { error: "Parent message has no conversation context" },
                { status: 400 },
            );
        }

        const participants = await getConversationParticipants(
            parent.conversationId,
        );
        if (!participants.includes(user.$id)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const permissions = [
            ...participants.map((id) => Permission.read(Role.user(id))),
            Permission.update(Role.user(user.$id)),
            Permission.delete(Role.user(user.$id)),
        ];

        const receiverId =
            parent.receiverId ||
            participants.find((id) => id !== user.$id) ||
            user.$id;

        const payload: Record<string, unknown> = {
            conversationId: parent.conversationId,
            senderId: user.$id,
            receiverId,
            text: text?.trim() || "",
            threadId: actualThreadId,
        };

        if (imageFileId) {
            payload.imageFileId = imageFileId;
        }
        if (imageUrl) {
            payload.imageUrl = imageUrl;
        }
        if (mentions && mentions.length > 0) {
            payload.mentions = mentions;
        }

        const created = await databases.createDocument(
            env.databaseId,
            env.collections.directMessages,
            ID.unique(),
            payload,
            permissions,
        );

        if (normalizedAttachments.length > 0) {
            try {
                await createAttachments(String(created.$id), normalizedAttachments);
            } catch (attachmentError) {
                try {
                    await databases.deleteDocument(
                        env.databaseId,
                        env.collections.directMessages,
                        String(created.$id),
                    );
                } catch (rollbackError) {
                    logger.warn(
                        "Failed to roll back DM thread reply after attachment error",
                        {
                            replyId: String(created.$id),
                            error:
                                rollbackError instanceof Error
                                    ? rollbackError.message
                                    : String(rollbackError),
                        },
                    );
                }

                logger.error("Failed to create DM thread attachments", {
                    replyId: String(created.$id),
                    error:
                        attachmentError instanceof Error
                            ? attachmentError.message
                            : String(attachmentError),
                });

                throw attachmentError;
            }
        }

        const maxUpdateAttempts = 3;
        try {
            await updateThreadMetadataWithRetries({
                actualThreadId,
                conversationId: parent.conversationId,
                databases,
                env,
                maxUpdateAttempts,
                replyCreatedAt: String(
                    created.$createdAt || new Date().toISOString(),
                ),
                userId: user.$id,
            });
        } catch (metadataError) {
            logger.warn("DM thread metadata reconciliation failed", {
                actualThreadId,
                conversationId: parent.conversationId,
                replyId: String(created.$id),
                userId: user.$id,
                error:
                    metadataError instanceof Error
                        ? metadataError.message
                        : String(metadataError),
            });
        }

        if (mentions && mentions.length > 0) {
            try {
                await upsertMentionInboxItems({
                    authorUserId: user.$id,
                    contextId: parent.conversationId,
                    contextKind: "conversation",
                    latestActivityAt: String(
                        created.$createdAt || new Date().toISOString(),
                    ),
                    mentions,
                    messageId: String(created.$id),
                    parentMessageId: actualThreadId,
                    previewText: text?.trim() || "",
                });
            } catch (mentionsError) {
                logger.warn("DM thread mention inbox upsert failed", {
                    authorUserId: user.$id,
                    conversationId: parent.conversationId,
                    messageId: String(created.$id),
                    parentMessageId: actualThreadId,
                    error:
                        mentionsError instanceof Error
                            ? mentionsError.message
                            : String(mentionsError),
                });
            }
        }

        const d = created as unknown as Record<string, unknown>;
        const message: DirectMessage = {
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
            attachments: normalizedAttachments,
        };

        return NextResponse.json(
            {
                success: true,
                message,
                reply: message,
                threadId: actualThreadId,
            },
            { status: 201 },
        );
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create thread reply",
            },
            { status: 500 },
        );
    }
}
