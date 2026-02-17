import type { Message } from "./types";
import { apiCache, CACHE_TTL } from "./cache-utils";
import { parseReactions } from "./reactions-utils";

type BatchProfileData = {
    userId: string;
    displayName?: string;
    pronouns?: string;
    avatarFileId?: string;
    avatarUrl?: string;
};

/**
 * Batch-fetch profiles via the Next.js API route (client-safe).
 * Uses the /api/profiles/batch endpoint so no server SDK is needed.
 */
async function fetchProfilesBatch(
    userIds: string[],
): Promise<Map<string, BatchProfileData>> {
    const profileMap = new Map<string, BatchProfileData>();
    if (userIds.length === 0) {
        return profileMap;
    }

    try {
        const response = await fetch("/api/profiles/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds }),
        });

        if (!response.ok) {
            return profileMap;
        }

        const data = (await response.json()) as {
            profiles: Record<
                string,
                {
                    userId: string;
                    displayName?: string;
                    pronouns?: string;
                    avatarUrl?: string;
                }
            >;
        };

        for (const [uid, profile] of Object.entries(data.profiles)) {
            profileMap.set(uid, {
                userId: uid,
                displayName: profile.displayName,
                pronouns: profile.pronouns,
                avatarUrl: profile.avatarUrl,
            });
        }
    } catch {
        // Batch failed — return empty map; callers handle gracefully
    }
    return profileMap;
}

/**
 * Enriches messages with profile information (displayName, pronouns, avatarUrl)
 * by batch-fetching profiles through the /api/profiles/batch API route.
 * This version is client-safe — no server SDK imports.
 * Also enriches messages with reply context if replyToId is present.
 */
export async function enrichMessagesWithProfiles(
    messages: Message[],
): Promise<Message[]> {
    if (messages.length === 0) {
        return messages;
    }

    try {
        // Get unique user IDs from messages
        const userIds = [...new Set(messages.map((m) => m.userId))];

        // Batch fetch profiles via API route (client-safe)
        const profilesMap = await fetchProfilesBatch(userIds);

        // Build a map of messages by ID for quick lookup of parent messages
        const messagesById = new Map(messages.map((m) => [m.$id, m]));

        // Enrich messages with profile data and reply context
        return messages.map((message) => {
            const profile = profilesMap.get(message.userId);
            const enriched = {
                ...message,
                displayName: profile?.displayName || undefined,
                pronouns: profile?.pronouns || undefined,
                avatarUrl: profile?.avatarUrl || undefined,
                // Parse reactions if they're a JSON string
                reactions: parseReactions(message.reactions),
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
    } catch {
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
    message: Message,
): Promise<Message> {
    try {
        // Use cache with deduplication to avoid redundant profile fetches
        const profile = await apiCache.dedupe(
            `profile:${message.userId}`,
            async () => {
                const response = await fetch(
                    `/api/users/${message.userId}/profile`,
                );
                if (!response.ok) {
                    return null;
                }
                return response.json();
            },
            CACHE_TTL.PROFILES,
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
            // Parse reactions if they're a JSON string
            reactions: parseReactions(message.reactions),
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
    allMessages: Message[],
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
