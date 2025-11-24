import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

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
import { getProfilesByUserIds, getAvatarUrl } from "@/lib/appwrite-profiles";

/**
 * Enrich direct messages with sender profile data
 */
async function enrichDirectMessagesWithProfiles(
	messages: DirectMessage[]
): Promise<DirectMessage[]> {
	if (messages.length === 0) {
		return messages;
	}

	// Batch fetch profiles for all unique senders
	const uniqueSenderIds = [...new Set(messages.map((msg) => msg.senderId))];
	const profilesMap = await getProfilesByUserIds(uniqueSenderIds);

	// Enrich with sender profile data
	return messages.map((msg) => {
		const profile = profilesMap.get(msg.senderId);
		return {
			...msg,
			senderDisplayName: profile?.displayName,
			senderAvatarUrl: profile?.avatarFileId
				? getAvatarUrl(profile.avatarFileId)
				: undefined,
			senderPronouns: profile?.pronouns,
		};
	});
}

type RouteContext = {
	params: Promise<{
		messageId: string;
	}>;
};

/**
 * GET /api/direct-messages/[messageId]/thread
 * Fetch all replies in a DM thread
 */
export async function GET(_request: NextRequest, context: RouteContext) {
	const startTime = Date.now();

	try {
		setTransactionName("GET /api/direct-messages/[messageId]/thread");

		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			logger.warn("Unauthenticated DM thread fetch attempt");
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const { messageId } = await context.params;

		addTransactionAttributes({
			messageId,
			userId: user.$id,
		});

		const env = getEnvConfig();
		const { databases } = getServerClient();

		// Verify parent message exists and user has access
		let parentMessage: DirectMessage;
		try {
			parentMessage = (await databases.getDocument(
				env.databaseId,
				env.collections.directMessages,
				messageId
			)) as unknown as DirectMessage;

			// Verify user is either sender or receiver
			if (
				parentMessage.senderId !== user.$id &&
				parentMessage.receiverId !== user.$id
			) {
				return NextResponse.json(
					{ error: "Access denied" },
					{ status: 403 }
				);
			}
		} catch {
			return NextResponse.json(
				{ error: "Parent message not found" },
				{ status: 404 }
			);
		}

		// Fetch thread replies
		const response = await databases.listDocuments(
			env.databaseId,
			env.collections.directMessages,
			[
				Query.equal("threadId", messageId),
				Query.orderAsc("$createdAt"),
				Query.limit(1000), // Reasonable limit for thread size
			]
		);

		// Filter replies user has access to (must be sender or receiver)
		const accessibleReplies = (
			response.documents as unknown as DirectMessage[]
		).filter(
			(reply) =>
				reply.senderId === user.$id || reply.receiverId === user.$id
		);

		// Enrich messages with profile data
		const enrichedMessages = await enrichDirectMessagesWithProfiles(
			accessibleReplies
		);

		const duration = Date.now() - startTime;
		trackApiCall("/api/direct-messages/[messageId]/thread", "GET", 200, duration);

		logger.info("DM thread replies fetched successfully", {
			messageId,
			replyCount: enrichedMessages.length,
		});

		return NextResponse.json({
			success: true,
			replies: enrichedMessages,
		});
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error("Failed to fetch DM thread replies", {
			error: error instanceof Error ? error.message : String(error),
		});
		recordError(error instanceof Error ? error : new Error(String(error)), {
			endpoint: "/api/direct-messages/[messageId]/thread",
			method: "GET",
		});
		trackApiCall("/api/direct-messages/[messageId]/thread", "GET", 500, duration);

		return NextResponse.json(
			{ error: "Failed to fetch thread replies" },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/direct-messages/[messageId]/thread
 * Create a reply in a DM thread
 */
export async function POST(request: NextRequest, context: RouteContext) {
	const startTime = Date.now();

	try {
		setTransactionName("POST /api/direct-messages/[messageId]/thread");

		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			logger.warn("Unauthenticated DM thread reply attempt");
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const { messageId } = await context.params;
		const body = await request.json();
		const { text, imageFileId, imageUrl, attachments, mentions } = body;

		// Validate that either text or image is provided
		if (!text && !imageFileId && !imageUrl && (!attachments || attachments.length === 0)) {
			return NextResponse.json(
				{ error: "Text, image, or attachment is required" },
				{ status: 400 }
			);
		}

		addTransactionAttributes({
			messageId,
			userId: user.$id,
			hasText: Boolean(text),
			hasImage: Boolean(imageFileId || imageUrl),
			hasAttachments: Boolean(attachments && attachments.length > 0),
		});

		const env = getEnvConfig();
		const { databases } = getServerClient();

		// Retry logic for optimistic locking when updating parent message
		const maxRetries = 3;
		let parentMessage: DirectMessage | null = null;
		let newReply: DirectMessage | null = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				// Get the parent message (refetch on each retry for latest state)
				parentMessage = (await databases.getDocument(
					env.databaseId,
					env.collections.directMessages,
					messageId
				)) as unknown as DirectMessage;

				// Verify user has access (must be sender or receiver)
				if (
					parentMessage.senderId !== user.$id &&
					parentMessage.receiverId !== user.$id
				) {
					return NextResponse.json(
						{ error: "Access denied" },
						{ status: 403 }
					);
				}

				// Determine receiver (the other participant)
				const receiverId =
					parentMessage.senderId === user.$id
						? parentMessage.receiverId
						: parentMessage.senderId;

				// Create the thread reply
				const replyData: Record<string, unknown> = {
					senderId: user.$id,
					receiverId,
					text: text || "",
					threadId: messageId,
					conversationId: parentMessage.conversationId,
				};

				if (imageFileId) {
					replyData.imageFileId = imageFileId;
				}
				if (imageUrl) {
					replyData.imageUrl = imageUrl;
				}
				if (attachments && Array.isArray(attachments)) {
					replyData.attachments = JSON.stringify(attachments);
				}
				if (mentions && Array.isArray(mentions)) {
					replyData.mentions = JSON.stringify(mentions);
				}

				newReply = (await databases.createDocument(
					env.databaseId,
					env.collections.directMessages,
					"unique()",
					replyData
				)) as unknown as DirectMessage;

				// Update parent message with thread count and last reply timestamp
				const currentThreadCount = parentMessage.threadCount || 0;
				await databases.updateDocument(
					env.databaseId,
					env.collections.directMessages,
					messageId,
					{
						threadCount: currentThreadCount + 1,
						lastThreadReplyAt: new Date().toISOString(),
					}
				);

				// Success - exit retry loop
				break;
			} catch (error) {
				if (attempt === maxRetries - 1) {
					// Final attempt failed - throw error
					throw error;
				}

				// Wait before retry with exponential backoff
				logger.debug("DM thread reply conflict, retrying", {
					attempt: attempt + 1,
					messageId,
					userId: user.$id,
				});
				await new Promise((resolve) =>
					setTimeout(resolve, 50 * (attempt + 1))
				);
			}
		}

		if (!newReply) {
			throw new Error("Failed to create DM thread reply after retries");
		}

		// Enrich the reply with profile data
		const enrichedReplies = await enrichDirectMessagesWithProfiles([
			newReply,
		]);
		const enrichedReply = enrichedReplies[0];

		const duration = Date.now() - startTime;
		trackApiCall("/api/direct-messages/[messageId]/thread", "POST", 201, duration);

		logger.info("DM thread reply created successfully", {
			messageId,
			replyId: newReply.$id,
			userId: user.$id,
		});

		return NextResponse.json(
			{
				success: true,
				reply: enrichedReply,
			},
			{ status: 201 }
		);
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error("Failed to create DM thread reply", {
			error: error instanceof Error ? error.message : String(error),
		});
		recordError(error instanceof Error ? error : new Error(String(error)), {
			endpoint: "/api/direct-messages/[messageId]/thread",
			method: "POST",
		});
		trackApiCall("/api/direct-messages/[messageId]/thread", "POST", 500, duration);

		return NextResponse.json(
			{ error: "Failed to create thread reply" },
			{ status: 500 }
		);
	}
}
