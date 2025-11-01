import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Query, Permission, Role } from "node-appwrite";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { FileAttachment } from "@/lib/types";
import {
	logger,
	recordError,
	setTransactionName,
	trackApiCall,
	trackMessage,
	addTransactionAttributes,
} from "@/lib/newrelic-utils";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const CONVERSATIONS_COLLECTION = env.collections.conversations;
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const MESSAGE_ATTACHMENTS_COLLECTION_ID = env.collections.messageAttachments;

/**
 * Helper to create attachment records for a direct message
 */
async function createAttachments(
	messageId: string,
	attachments: FileAttachment[],
): Promise<void> {
	if (!attachments || attachments.length === 0) {
		return;
	}

	if (!MESSAGE_ATTACHMENTS_COLLECTION_ID) {
		return;
	}

	const { databases } = getServerClient();

	await Promise.all(
		attachments.map((attachment) =>
			databases.createDocument(
				DATABASE_ID,
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

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  return NextResponse.json(data, {
    ...init,
    headers,
  });
}

// Handle preflight requests
export async function OPTIONS() {
  return jsonResponse({});
}

/**
 * GET /api/direct-messages
 * 
 * Operations:
 * - List conversations: ?type=conversations
 * - List messages: ?type=messages&conversationId=xxx
 * - Get/create conversation: ?type=conversation&userId1=xxx&userId2=xxx
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const session = await getServerSession();
    if (!session?.$id) {
      logger.warn("Unauthorized DM access attempt");
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams} = new URL(request.url);
    const type = searchParams.get("type");
    
    setTransactionName(`GET /api/direct-messages?type=${type || "unknown"}`);
    addTransactionAttributes({ 
      userId: session.$id, 
      operationType: type || "unknown" 
    });

    // List all conversations for current user
    if (type === "conversations") {
      if (!CONVERSATIONS_COLLECTION) {
        return jsonResponse({ conversations: [] });
      }

      const { databases } = getServerClient();
      const dbStartTime = Date.now();
      const response = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal("participants", session.$id),
          Query.orderDesc("lastMessageAt"),
          Query.limit(100),
        ]
      );
      
      trackApiCall(
        "/api/direct-messages",
        "GET",
        200,
        Date.now() - dbStartTime,
        { operation: "listConversations", count: response.documents.length }
      );

      const conversations = response.documents.map((doc) => ({
        $id: doc.$id,
        participants: doc.participants as string[],
        lastMessageAt: doc.lastMessageAt as string | undefined,
        $createdAt: doc.$createdAt,
      }));
      
      logger.info("Listed conversations", { 
        userId: session.$id, 
        count: conversations.length 
      });

      return jsonResponse({ conversations });
    }

    // Get or create a conversation between two users
    if (type === "conversation") {
      const userId1 = searchParams.get("userId1");
      const userId2 = searchParams.get("userId2");

      if (!userId1 || !userId2) {
        return jsonResponse(
          { error: "userId1 and userId2 are required" },
          { status: 400 }
        );
      }

      if (!CONVERSATIONS_COLLECTION) {
        return jsonResponse(
          { error: "Conversations not configured" },
          { status: 500 }
        );
      }

      // Sort user IDs to ensure consistent ordering
      const [user1, user2] = [userId1, userId2].sort();
      const participants = [user1, user2];

      const { databases } = getServerClient();

      // Try to find existing conversation
      try {
        const existing = await databases.listDocuments(
          DATABASE_ID,
          CONVERSATIONS_COLLECTION,
          [
            Query.equal("participants", user1),
            Query.equal("participants", user2),
            Query.limit(1),
          ]
        );

        if (existing.documents.length > 0) {
          const doc = existing.documents[0];
          return jsonResponse({
            conversation: {
              $id: doc.$id,
              participants: doc.participants,
              lastMessageAt: doc.lastMessageAt,
              $createdAt: doc.$createdAt,
            },
          });
        }
      } catch {
        // Continue to create new conversation if not found
      }

      // Create new conversation
      const permissions = [
        Permission.read(Role.user(user1)),
        Permission.read(Role.user(user2)),
        Permission.update(Role.user(user1)),
        Permission.update(Role.user(user2)),
        Permission.delete(Role.user(user1)),
        Permission.delete(Role.user(user2)),
      ];

      const newConv = await databases.createDocument(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        ID.unique(),
        {
          participants,
          lastMessageAt: new Date().toISOString(),
        },
        permissions
      );

      return jsonResponse({
        conversation: {
          $id: newConv.$id,
          participants: newConv.participants,
          lastMessageAt: newConv.lastMessageAt,
          $createdAt: newConv.$createdAt,
        },
      });
    }

    // List messages in a conversation
    if (type === "messages") {
      const conversationId = searchParams.get("conversationId");
      const limit = Number.parseInt(searchParams.get("limit") || "50");
      const cursor = searchParams.get("cursor") || undefined;

      if (!conversationId) {
        return jsonResponse(
          { error: "conversationId is required" },
          { status: 400 }
        );
      }

      if (!DIRECT_MESSAGES_COLLECTION) {
        return jsonResponse({ items: [], nextCursor: null });
      }

      const { databases } = getServerClient();
      const queries = [
        Query.equal("conversationId", conversationId),
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
      ];

      if (cursor) {
        queries.push(Query.cursorAfter(cursor));
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        DIRECT_MESSAGES_COLLECTION,
        queries
      );

      const items = response.documents.map((doc) => ({
        $id: doc.$id,
        conversationId: doc.conversationId as string,
        senderId: doc.senderId as string,
        receiverId: doc.receiverId as string,
        text: doc.text as string,
        imageFileId: doc.imageFileId as string | undefined,
        imageUrl: doc.imageUrl as string | undefined,
        $createdAt: doc.$createdAt,
        editedAt: (doc.editedAt as string | undefined),
        removedAt: (doc.removedAt as string | undefined),
        removedBy: (doc.removedBy as string | undefined),
        replyToId: (doc.replyToId as string | undefined),
        mentions: Array.isArray(doc.mentions) ? doc.mentions as string[] : undefined,
      }));

      const last = items.at(-1);
      return jsonResponse({
        items,
        nextCursor: items.length === limit && last ? last.$id : null,
      });
    }

    return jsonResponse({ error: "Invalid type parameter" }, { status: 400 });
  } catch (error) {
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "GET /api/direct-messages",
        endpoint: "/api/direct-messages",
      }
    );
    
    logger.error("DM GET error", {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
    
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/direct-messages
 * Send a new direct message
 * 
 * Body: { conversationId, senderId, receiverId, text, imageFileId?, imageUrl? }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    setTransactionName("POST /api/direct-messages");
    
    const session = await getServerSession();
    if (!session?.$id) {
      logger.warn("Unauthorized DM send attempt");
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      conversationId: string;
      senderId: string;
      receiverId: string;
      text: string;
      imageFileId?: string;
      imageUrl?: string;
      attachments?: unknown[];
      replyToId?: string;
      mentions?: string[];
    };

    const { conversationId, senderId, receiverId, text, imageFileId, imageUrl, attachments, replyToId, mentions } = body;
    
    addTransactionAttributes({
      userId: session.$id,
      conversationId,
      hasImage: !!imageFileId,
      hasAttachments: !!(attachments && attachments.length > 0),
      attachmentCount: attachments?.length || 0,
      isReply: !!replyToId,
    });

    // Validate sender is the authenticated user
    if (senderId !== session.$id) {
      return jsonResponse(
        { error: "Cannot send message as another user" },
        { status: 403 }
      );
    }

    // Require either text, image, or attachments
    if (!conversationId || !senderId || !receiverId || (!text?.trim() && !imageFileId && (!attachments || attachments.length === 0))) {
      return jsonResponse(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!DIRECT_MESSAGES_COLLECTION || !CONVERSATIONS_COLLECTION) {
      return jsonResponse(
        { error: "Direct messages not configured" },
        { status: 500 }
      );
    }

    const { databases } = getServerClient();

    const permissions = [
      Permission.read(Role.user(senderId)),
      Permission.read(Role.user(receiverId)),
      Permission.update(Role.user(senderId)),
      Permission.delete(Role.user(senderId)),
    ];

    const messageData: Record<string, unknown> = {
      conversationId,
      senderId,
      receiverId,
      text: text || "",
    };

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
    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      messageData.mentions = mentions;
    }

    const dbStartTime = Date.now();
    const message = await databases.createDocument(
      DATABASE_ID,
      DIRECT_MESSAGES_COLLECTION,
      ID.unique(),
      messageData,
      permissions
    );
    
    trackApiCall(
      "/api/direct-messages",
      "POST",
      200,
      Date.now() - dbStartTime,
      { operation: "createDocument", collection: "direct_messages" }
    );

    // Create attachment records if any
    if (attachments && attachments.length > 0) {
      try {
        await createAttachments(String(message.$id), attachments as FileAttachment[]);
      } catch (attachmentError) {
        logger.error("Failed to create attachments", {
          messageId: message.$id,
          error: attachmentError instanceof Error ? attachmentError.message : String(attachmentError),
        });
        // Continue even if attachment creation fails
      }
    }

    // Update conversation's lastMessageAt
    try {
      await databases.updateDocument(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        conversationId,
        {
          lastMessageAt: new Date().toISOString(),
        }
      );
    } catch {
      // Don't fail if conversation update fails
    }
    
    // Track DM sent event
    trackMessage("sent", "dm", {
      messageId: message.$id,
      senderId,
      receiverId,
      conversationId,
      hasImage: !!imageFileId,
      hasAttachments: !!(attachments && attachments.length > 0),
      attachmentCount: attachments?.length || 0,
      isReply: !!replyToId,
      textLength: text?.length || 0,
    });
    
    logger.info("DM sent", {
      messageId: message.$id,
      senderId,
      conversationId,
      duration: Date.now() - startTime,
    });

    const responseMessage: Record<string, unknown> = {
      $id: message.$id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      text: message.text,
      imageFileId: message.imageFileId,
      imageUrl: message.imageUrl,
      $createdAt: message.$createdAt,
      replyToId: message.replyToId,
    };

    // Include attachments in response if any
    if (attachments && attachments.length > 0) {
      responseMessage.attachments = attachments as FileAttachment[];
    }

    return jsonResponse({ message: responseMessage });
  } catch (error) {
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "POST /api/direct-messages",
        endpoint: "/api/direct-messages",
      }
    );
    
    logger.error("DM POST error", {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
    
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/direct-messages?id=MESSAGE_ID
 * Edit a direct message
 * 
 * Body: { text }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.$id) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");

    if (!messageId) {
      return jsonResponse(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json() as { text: string };
    const { text } = body;

    if (!text?.trim()) {
      return jsonResponse(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (!DIRECT_MESSAGES_COLLECTION) {
      return jsonResponse(
        { error: "Direct messages not configured" },
        { status: 500 }
      );
    }

    const { databases } = getServerClient();

    // Get the message to verify ownership
    const message = await databases.getDocument(
      DATABASE_ID,
      DIRECT_MESSAGES_COLLECTION,
      messageId
    );

    // Only the sender can edit their message
    if (message.senderId !== session.$id) {
      return jsonResponse(
        { error: "You can only edit your own messages" },
        { status: 403 }
      );
    }

    const updated = await databases.updateDocument(
      DATABASE_ID,
      DIRECT_MESSAGES_COLLECTION,
      messageId,
      {
        text: text.trim(),
        editedAt: new Date().toISOString(),
      }
    );

    return jsonResponse({
      message: {
        $id: updated.$id,
        conversationId: updated.conversationId,
        senderId: updated.senderId,
        receiverId: updated.receiverId,
        text: updated.text,
        $createdAt: updated.$createdAt,
        editedAt: updated.editedAt,
      },
    });
  } catch (error) {
    console.error("PATCH /api/direct-messages error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/direct-messages?id=MESSAGE_ID
 * Soft delete a direct message
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.$id) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");

    if (!messageId) {
      return jsonResponse(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    if (!DIRECT_MESSAGES_COLLECTION) {
      return jsonResponse(
        { error: "Direct messages not configured" },
        { status: 500 }
      );
    }

    const { databases } = getServerClient();

    // Get the message to verify ownership
    const message = await databases.getDocument(
      DATABASE_ID,
      DIRECT_MESSAGES_COLLECTION,
      messageId
    );

    // Only the sender can delete their message
    if (message.senderId !== session.$id) {
      return jsonResponse(
        { error: "You can only delete your own messages" },
        { status: 403 }
      );
    }

    await databases.updateDocument(
      DATABASE_ID,
      DIRECT_MESSAGES_COLLECTION,
      messageId,
      {
        removedAt: new Date().toISOString(),
        removedBy: session.$id,
      }
    );

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("DELETE /api/direct-messages error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
