import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { Message, DirectMessage } from "@/lib/types";
import { getAvatarUrl } from "@/lib/appwrite-profiles";
import {
	logger,
	recordError,
	setTransactionName,
	trackApiCall,
} from "@/lib/newrelic-utils";
import { compressedResponse } from "@/lib/api-compression";

type SearchResult = {
	type: "channel" | "dm";
	message: Message | DirectMessage;
};

/**
 * Parse search filters from query string
 * Supports: from:@username, in:#channel, has:image, mentions:me, before:date, after:date
 */
function parseFilters(query: string) {
	const filters: {
		text: string;
		fromUser?: string;
		inChannel?: string;
		hasImage?: boolean;
		mentionsMe?: boolean;
		beforeDate?: string;
		afterDate?: string;
	} = {
		text: "",
	};

	let remainingText = query;

	// Extract from:@username or from:username
	const fromMatch = remainingText.match(/from:@?([a-zA-Z0-9_-]+)/);
	if (fromMatch) {
		filters.fromUser = fromMatch[1];
		remainingText = remainingText.replace(fromMatch[0], "").trim();
	}

	// Extract in:#channel or in:channel
	const inMatch = remainingText.match(/in:#?([a-zA-Z0-9_-]+)/);
	if (inMatch) {
		filters.inChannel = inMatch[1];
		remainingText = remainingText.replace(inMatch[0], "").trim();
	}

	// Extract has:image
	if (remainingText.includes("has:image")) {
		filters.hasImage = true;
		remainingText = remainingText.replace(/has:image/g, "").trim();
	}

	// Extract mentions:me
	if (remainingText.includes("mentions:me")) {
		filters.mentionsMe = true;
		remainingText = remainingText.replace(/mentions:me/g, "").trim();
	}

	// Extract before:YYYY-MM-DD
	const beforeMatch = remainingText.match(/before:(\d{4}-\d{2}-\d{2})/);
	if (beforeMatch) {
		filters.beforeDate = beforeMatch[1];
		remainingText = remainingText.replace(beforeMatch[0], "").trim();
	}

	// Extract after:YYYY-MM-DD
	const afterMatch = remainingText.match(/after:(\d{4}-\d{2}-\d{2})/);
	if (afterMatch) {
		filters.afterDate = afterMatch[1];
		remainingText = remainingText.replace(afterMatch[0], "").trim();
	}

	filters.text = remainingText.trim();

	return filters;
}

/**
 * GET /api/search/messages
 * Search messages across channels and DMs with filters
 */
export async function GET(request: NextRequest) {
	const startTime = Date.now();

	try {
		setTransactionName("GET /api/search/messages");

		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			logger.warn("Unauthenticated search attempt");
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 },
			);
		}

		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q");
		const channelId = searchParams.get("channel");
		const userId = searchParams.get("user");
		const fromDate = searchParams.get("from");
		const toDate = searchParams.get("to");

		if (!query || query.trim().length < 2) {
			return NextResponse.json(
				{ error: "Search query must be at least 2 characters" },
				{ status: 400 },
			);
		}

		const env = getEnvConfig();
		const { databases } = getServerClient();

		// Parse filters from query
		const filters = parseFilters(query);

		const results: SearchResult[] = [];

		// Build query filters for channel messages
		const messageQueries: string[] = [];

		// Add text search if we have remaining text after filter extraction
		if (filters.text) {
			messageQueries.push(Query.search("text", filters.text));
		}

		// Apply channel filter
		if (channelId || filters.inChannel) {
			messageQueries.push(
				Query.equal("channelId", channelId || filters.inChannel || ""),
			);
		}

		// Apply user filter
		if (userId || filters.fromUser) {
			// If fromUser is a display name, we need to look up the userId first
			// For now, assume it's a userId
			messageQueries.push(Query.equal("userId", userId || filters.fromUser || ""));
		}

		// Apply date filters
		if (fromDate || filters.afterDate) {
			const dateStr = fromDate || filters.afterDate || "";
			messageQueries.push(Query.greaterThanEqual("$createdAt", dateStr));
		}

		if (toDate || filters.beforeDate) {
			const dateStr = toDate || filters.beforeDate || "";
			messageQueries.push(Query.lessThanEqual("$createdAt", dateStr));
		}

		// Apply image filter
		if (filters.hasImage) {
			messageQueries.push(Query.isNotNull("imageFileId"));
		}

		// Apply mentions filter
		if (filters.mentionsMe) {
			messageQueries.push(Query.search("mentions", user.$id));
		}

		// Limit results
		messageQueries.push(Query.limit(50));
		messageQueries.push(Query.orderDesc("$createdAt"));

		// Search channel messages
		try {
			const dbStartTime = Date.now();
			const channelMessages = await databases.listDocuments(
				env.databaseId,
				env.collections.messages,
				messageQueries,
			);

			trackApiCall(
				"/api/search/messages",
				"GET",
				200,
				Date.now() - dbStartTime,
				{ operation: "listDocuments", collection: "messages" },
			);

			for (const doc of channelMessages.documents) {
				const message: Message = {
					$id: String(doc.$id),
					userId: String(doc.userId),
					userName: doc.userName ? String(doc.userName) : undefined,
					text: String(doc.text),
					$createdAt: String(doc.$createdAt ?? ""),
					channelId: doc.channelId ? String(doc.channelId) : undefined,
					serverId: doc.serverId ? String(doc.serverId) : undefined,
					editedAt: doc.editedAt ? String(doc.editedAt) : undefined,
					removedAt: doc.removedAt ? String(doc.removedAt) : undefined,
					removedBy: doc.removedBy ? String(doc.removedBy) : undefined,
					imageFileId: doc.imageFileId ? String(doc.imageFileId) : undefined,
					imageUrl: doc.imageUrl ? String(doc.imageUrl) : undefined,
					replyToId: doc.replyToId ? String(doc.replyToId) : undefined,
					mentions: Array.isArray(doc.mentions)
						? (doc.mentions as string[])
						: undefined,
					reactions: Array.isArray(doc.reactions)
						? (doc.reactions as Array<{
								emoji: string;
								userIds: string[];
								count: number;
							}>)
						: undefined,
				};

				results.push({ type: "channel", message });
			}
		} catch (error) {
			logger.error("Failed to search channel messages", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Build query filters for DM messages (only if no channel filter)
		if (!channelId && !filters.inChannel) {
			const dmQueries: string[] = [];

			// Add text search
			if (filters.text) {
				dmQueries.push(Query.search("text", filters.text));
			}

			// For DMs, user must be either sender or receiver
			if (userId || filters.fromUser) {
				dmQueries.push(Query.equal("senderId", userId || filters.fromUser || ""));
			} else {
				// Search DMs where user is participant
				dmQueries.push(
					Query.or([
						Query.equal("senderId", user.$id),
						Query.equal("receiverId", user.$id),
					]),
				);
			}

			// Apply date filters
			if (fromDate || filters.afterDate) {
				const dateStr = fromDate || filters.afterDate || "";
				dmQueries.push(Query.greaterThanEqual("$createdAt", dateStr));
			}

			if (toDate || filters.beforeDate) {
				const dateStr = toDate || filters.beforeDate || "";
				dmQueries.push(Query.lessThanEqual("$createdAt", dateStr));
			}

			// Apply image filter
			if (filters.hasImage) {
				dmQueries.push(Query.isNotNull("imageFileId"));
			}

			// Apply mentions filter
			if (filters.mentionsMe) {
				dmQueries.push(Query.search("mentions", user.$id));
			}

			// Limit results
			dmQueries.push(Query.limit(50));
			dmQueries.push(Query.orderDesc("$createdAt"));

			try {
				const dbStartTime = Date.now();
				const directMessages = await databases.listDocuments(
					env.databaseId,
					env.collections.directMessages,
					dmQueries,
				);

				trackApiCall(
					"/api/search/messages",
					"GET",
					200,
					Date.now() - dbStartTime,
					{ operation: "listDocuments", collection: "directMessages" },
				);

				for (const doc of directMessages.documents) {
					const message: DirectMessage = {
						$id: String(doc.$id),
						conversationId: String(doc.conversationId),
						senderId: String(doc.senderId),
						receiverId: String(doc.receiverId),
						text: String(doc.text),
						$createdAt: String(doc.$createdAt ?? ""),
						editedAt: doc.editedAt ? String(doc.editedAt) : undefined,
						removedAt: doc.removedAt ? String(doc.removedAt) : undefined,
						removedBy: doc.removedBy ? String(doc.removedBy) : undefined,
						imageFileId: doc.imageFileId ? String(doc.imageFileId) : undefined,
						imageUrl: doc.imageUrl ? String(doc.imageUrl) : undefined,
						replyToId: doc.replyToId ? String(doc.replyToId) : undefined,
						mentions: Array.isArray(doc.mentions)
							? (doc.mentions as string[])
							: undefined,
						reactions: Array.isArray(doc.reactions)
							? (doc.reactions as Array<{
									emoji: string;
									userIds: string[];
									count: number;
								}>)
							: undefined,
					};

					results.push({ type: "dm", message });
				}
			} catch (error) {
				logger.error("Failed to search direct messages", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// Sort all results by date (most recent first)
		results.sort((a, b) => {
			const dateA = new Date(a.message.$createdAt).getTime();
			const dateB = new Date(b.message.$createdAt).getTime();
			return dateB - dateA;
		});

		// Limit to 50 results total
		const limitedResults = results.slice(0, 50);

		// Enrich results with profile data
		const userIds = new Set<string>();
		for (const result of limitedResults) {
			if (result.type === "channel") {
				const message = result.message as Message;
				userIds.add(message.userId);
			} else {
				const dm = result.message as DirectMessage;
				userIds.add(dm.senderId);
			}
		}

		// Fetch profiles for all users
		const profileMap = new Map<
			string,
			{ displayName?: string; avatarUrl?: string; pronouns?: string }
		>();
		try {
			const profiles = await databases.listDocuments(
				env.databaseId,
				env.collections.profiles,
				[Query.equal("userId", Array.from(userIds)), Query.limit(100)],
			);

			for (const profile of profiles.documents) {
				profileMap.set(String(profile.userId), {
					displayName: profile.displayName
						? String(profile.displayName)
						: undefined,
					avatarUrl: profile.avatarFileId
						? getAvatarUrl(String(profile.avatarFileId))
						: undefined,
					pronouns: profile.pronouns ? String(profile.pronouns) : undefined,
				});
			}
		} catch (error) {
			logger.error("Failed to fetch profiles for search results", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Enrich messages with profile data
		for (const result of limitedResults) {
			if (result.type === "channel") {
				const message = result.message as Message;
				const profile = profileMap.get(message.userId);
				if (profile) {
					message.displayName = profile.displayName;
					message.avatarUrl = profile.avatarUrl;
					message.pronouns = profile.pronouns;
				}
			} else {
				const dm = result.message as DirectMessage;
				const profile = profileMap.get(dm.senderId);
				if (profile) {
					dm.senderDisplayName = profile.displayName;
					dm.senderAvatarUrl = profile.avatarUrl;
					dm.senderPronouns = profile.pronouns;
				}
			}
		}

		logger.info("Message search completed", {
			userId: user.$id,
			query,
			resultCount: limitedResults.length,
			duration: Date.now() - startTime,
		});

		return compressedResponse({ results: limitedResults });
	} catch (error) {
		recordError(
			error instanceof Error ? error : new Error(String(error)),
			{
				context: "GET /api/search/messages",
				endpoint: "/api/search/messages",
			},
		);

		logger.error("Failed to search messages", {
			error: error instanceof Error ? error.message : String(error),
		});

		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to search messages",
			},
			{ status: 500 },
		);
	}
}
