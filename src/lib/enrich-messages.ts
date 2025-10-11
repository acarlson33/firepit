import {
	getProfilesByUserIds,
	getAvatarUrl,
	getUserProfile,
} from "./appwrite-profiles";
import type { Message } from "./types";

/**
 * Enriches messages with profile information (displayName, pronouns, avatarUrl)
 * by batch-fetching profiles for all unique userIds
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

		// Batch fetch profiles
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
 */
export async function enrichMessageWithProfile(
	message: Message
): Promise<Message> {
	try {
		const profile = await getUserProfile(message.userId);
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
	} catch (error) {
		// If enrichment fails, return original message
		return message;
	}
}
