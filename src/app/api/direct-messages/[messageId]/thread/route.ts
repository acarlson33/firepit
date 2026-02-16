import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Permission, Query, Role } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { DirectMessage, FileAttachment } from "@/lib/types";
import {
    MAX_MESSAGE_LENGTH,
    MESSAGE_TOO_LONG_ERROR,
} from "@/lib/message-constraints";

const MESSAGE_ATTACHMENTS_COLLECTION_ID =
    process.env.APPWRITE_MESSAGE_ATTACHMENTS_COLLECTION_ID ||
    "message_attachments";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

async function createAttachments(
    messageId: string,
    attachments: FileAttachment[],
): Promise<void> {
    if (!attachments || attachments.length === 0) {
        return;
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();

    await Promise.all(
        attachments.map((attachment) =>
            databases.createDocument(
                env.databaseId,
                MESSAGE_ATTACHMENTS_COLLECTION_ID,
                ID.unique(),
                {
                    messageId,
                    messageType: "dm",
                    fileId: attachment.fileId,
                    fileName: attachment.fileName,
                    fileSize: attachment.fileSize,
                    fileType: attachment.fileType,
                    fileUrl: attachment.fileUrl,
                    thumbnailUrl: attachment.thumbnailUrl || null,
                },
            ),
        ),
    );
}

function parseLimit(url: string): number {
    const { searchParams } = new URL(url);
    const raw = Number(searchParams.get("limit") || "50");
    if (!Number.isFinite(raw) || raw < 1) {
        return 50;
    }
    return Math.min(raw, 100);
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

        const parent = (await databases.getDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
        )) as unknown as DirectMessage;

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
                Query.equal("threadId", messageId),
                Query.orderAsc("$createdAt"),
                Query.limit(limit),
            ],
        );

        const items = docs.documents.map((doc) => {
            const d = doc as Record<string, unknown>;
            return {
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
                mentions: Array.isArray(d.mentions)
                    ? (d.mentions as string[])
                    : undefined,
            } satisfies DirectMessage;
        });

        return NextResponse.json({ items });
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
            attachments?: FileAttachment[];
        };

        if (
            (!text || text.trim().length === 0) &&
            !imageFileId &&
            (!attachments || attachments.length === 0)
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
            threadId: messageId,
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

        if (attachments && attachments.length > 0) {
            await createAttachments(String(created.$id), attachments);
        }

        const existingParticipants = Array.isArray(parent.threadParticipants)
            ? parent.threadParticipants
            : [];
        const nextParticipants = Array.from(
            new Set([...existingParticipants, user.$id]),
        );
        const nextCount = (parent.threadMessageCount || 0) + 1;

        await databases.updateDocument(
            env.databaseId,
            env.collections.directMessages,
            messageId,
            {
                threadMessageCount: nextCount,
                threadParticipants: nextParticipants,
                lastThreadReplyAt: new Date().toISOString(),
            },
        );

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
            mentions: Array.isArray(d.mentions)
                ? (d.mentions as string[])
                : undefined,
            attachments,
        };

        return NextResponse.json({ message });
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
