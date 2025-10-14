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

		// Enrich messages with profile data
		return messages.map((message) => {
			const profile = profilesMap.get(message.userId);
			if (!profile) {
				return message;
			}

			return {
				...message,
				displayName: profile.displayName || undefined,
				pronouns: profile.pronouns || undefined,
				avatarFileId: profile.avatarFileId || undefined,
				avatarUrl: profile.avatarFileId
					? getAvatarUrl(profile.avatarFileId)
					: undefined,
			};
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
