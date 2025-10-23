import {
	getProfilesByUserIds,
	getAvatarUrl,
} from "./appwrite-profiles";
import type { Message } from "./types";
import { apiCache, CACHE_TTL } from "./cache-utils";

/**
 * Enriches messages with profile information (displayName, pronouns, avatarUrl)
 * by batch-fetching profiles for all unique userIds.
 * This version uses server-side database access for better performance.
 * Also enriches messages with reply context if replyToId is present.
 */
export async function enrichMessagesWithProfiles(
	messages: Message[]
): Promise<Message[]> {
	if (messages.length === 0) {
		return messages;
	}

	try {
		// Get unique user IDs from messages
		const userIds = [...new Set(messages.map((m) => m.userId))];

		// Batch fetch profiles using server SDK
		const profilesMap = await getProfilesByUserIds(userIds);

		// Build a map of messages by ID for quick lookup of parent messages
		const messagesById = new Map(messages.map((m) => [m.$id, m]));

		// Enrich messages with profile data and reply context
		return messages.map((message) => {
			const profile = profilesMap.get(message.userId);
			const enriched = {
				...message,
				displayName: profile?.displayName || undefined,
				pronouns: profile?.pronouns || undefined,
				avatarFileId: profile?.avatarFileId || undefined,
				avatarUrl: profile?.avatarFileId
					? getAvatarUrl(profile.avatarFileId)
					: undefined,
			};

			// Add reply context if this message is a reply
			if (message.replyToId) {
				const parentMessage = messagesById.get(message.replyToId);
				if (parentMessage) {
					const parentProfile = profilesMap.get(parentMessage.userId);
					enriched.replyTo = {
						text: parentMessage.text,
						userName: parentMessage.userName,
						displayName: parentProfile?.displayName || undefined,
					};
				}
			}

			return enriched;
		});
	} catch (error) {
		// If enrichment fails, return original messages
		// This ensures chat still works even if profiles can't be loaded
		return messages;
	}
}

/**
 * Enriches a single message with profile information
 * Useful for realtime updates where we receive one message at a time
 * Uses client-side fetch to work in browser context with caching
 * Note: Reply context should be enriched by the caller if needed (using existing messages)
 */
export async function enrichMessageWithProfile(
	message: Message
): Promise<Message> {
	try {
		// Use cache with deduplication to avoid redundant profile fetches
		const profile = await apiCache.dedupe(
			`profile:${message.userId}`,
			async () => {
				const response = await fetch(`/api/users/${message.userId}/profile`);
				if (!response.ok) {
					return null;
				}
				return response.json();
			},
			CACHE_TTL.PROFILES
		);

		if (!profile) {
			return message;
		}

		return {
			...message,
			displayName: profile.displayName || undefined,
			pronouns: profile.pronouns || undefined,
			avatarFileId: profile.avatarFileId || undefined,
			avatarUrl: profile.avatarUrl || undefined,
		};
	} catch (error) {
		// If enrichment fails, return original message
		return message;
	}
}

/**
 * Enriches a message with reply context from a list of messages
 * Used for realtime updates where we need to add reply info after profile enrichment
 */
export function enrichMessageWithReplyContext(
	message: Message,
	allMessages: Message[]
): Message {
	if (!message.replyToId) {
		return message;
	}

	const parentMessage = allMessages.find((m) => m.$id === message.replyToId);
	if (!parentMessage) {
		return message;
	}

	return {
		...message,
		replyTo: {
			text: parentMessage.text,
			userName: parentMessage.userName,
			displayName: parentMessage.displayName,
		},
	};
}
