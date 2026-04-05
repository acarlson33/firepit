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

type BatchProfileLookup = {
    profileMap: Map<string, BatchProfileData>;
    visibleUserIds: Set<string> | null;
};

/**
 * Batch-fetch profiles via the Next.js API route (client-safe).
 * Uses the /api/profiles/batch endpoint so no server SDK is needed.
 *
 * @param {string[]} userIds - The user ids value.
 * @returns {Promise<BatchProfileLookup>} The return value.
 */
async function fetchProfilesBatch(
    userIds: string[],
): Promise<BatchProfileLookup> {
    const profileMap = new Map<string, BatchProfileData>();
    if (userIds.length === 0) {
        return {
            profileMap,
            visibleUserIds: new Set(),
        };
    }

    try {
        const response = await fetch("/api/profiles/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds }),
        });

        if (!response.ok) {
            return {
                profileMap,
                visibleUserIds: null,
            };
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
            visibleUserIds?: string[];
        };

        for (const [uid, profile] of Object.entries(data.profiles)) {
            profileMap.set(uid, {
                userId: uid,
                displayName: profile.displayName,
                pronouns: profile.pronouns,
                avatarUrl: profile.avatarUrl,
            });
        }

        return {
            profileMap,
            visibleUserIds: Array.isArray(data.visibleUserIds)
                ? new Set(data.visibleUserIds)
                : null,
        };
    } catch {
        // Batch failed — return empty map; callers handle gracefully
    }
    return {
        profileMap,
        visibleUserIds: null,
    };
}

/**
 * Enriches messages with profile information (displayName, pronouns, avatarUrl)
 * by batch-fetching profiles through the /api/profiles/batch API route.
 * This version is client-safe — no server SDK imports.
 * Also enriches messages with reply context if replyToId is present.
 *
 * @param {Message[]} messages - The messages value.
 * @returns {Promise<Message[]>} The return value.
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
        const { profileMap, visibleUserIds } =
            await fetchProfilesBatch(userIds);

        const visibleMessages =
            visibleUserIds === null
                ? messages
                : messages.filter((message) =>
                      visibleUserIds.has(message.userId),
                  );

        // Build a map of messages by ID for quick lookup of parent messages
        const messagesById = new Map(visibleMessages.map((m) => [m.$id, m]));

        // Enrich messages with profile data and reply context
        return visibleMessages.map((message) => {
            const profile = profileMap.get(message.userId);
            const enriched: Message = {
                ...message,
                // Parse reactions if they're a JSON string
                reactions: parseReactions(message.reactions),
            };

            if (profile?.displayName !== undefined) {
                enriched.displayName = profile.displayName;
            }

            if (profile?.pronouns !== undefined) {
                enriched.pronouns = profile.pronouns;
            }

            if (profile?.avatarUrl !== undefined) {
                enriched.avatarUrl = profile.avatarUrl;
            }

            // Add reply context if this message is a reply
            if (message.replyToId) {
                const parentMessage = messagesById.get(message.replyToId);
                if (parentMessage) {
                    const parentProfile = profileMap.get(parentMessage.userId);
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
 *
 * @param {{ $id: string; userId: string; userName?: string | undefined; text: string; $createdAt: string; channelId?: string | undefined; serverId?: string | undefined; editedAt?: string | undefined; removedAt?: string | undefined; removedBy?: string | undefined; imageFileId?: string | undefined; imageUrl?: string | undefined; attachments?: FileAttachment[] | undefined; replyToId?: string | undefined; threadId?: string | undefined; threadMessageCount?: number | undefined; threadParticipants?: string[] | undefined; lastThreadReplyAt?: string | undefined; mentions?: string[] | undefined; reactions?: { emoji: string; userIds: string[]; count: number; }[] | undefined; displayName?: string | undefined; avatarFileId?: string | undefined; avatarUrl?: string | undefined; pronouns?: string | undefined; replyTo?: { text: string; userName?: string | undefined; displayName?: string | undefined; } | undefined; threadReplyCount?: number | undefined; isPinned?: boolean | undefined; pinnedAt?: string | undefined; pinnedBy?: string | undefined; }} message - The message value.
 * @returns {Promise<Message | null>} The return value.
 */
export async function enrichMessageWithProfile(
    message: Message,
): Promise<Message | null> {
    try {
        // Use cache with deduplication to avoid redundant profile fetches
        const lookup = await apiCache.dedupe(
            `profile:${message.userId}`,
            async () => {
                const { profileMap, visibleUserIds } = await fetchProfilesBatch(
                    [message.userId],
                );

                return {
                    profile: profileMap.get(message.userId) ?? null,
                    isVisible: visibleUserIds
                        ? visibleUserIds.has(message.userId)
                        : true,
                };
            },
            CACHE_TTL.PROFILES,
        );

        if (!lookup.isVisible) {
            return null;
        }

        if (!lookup.profile) {
            return message;
        }

        const enriched: Message = {
            ...message,
            // Parse reactions if they're a JSON string
            reactions: parseReactions(message.reactions),
        };

        if (lookup.profile.displayName !== undefined) {
            enriched.displayName = lookup.profile.displayName;
        }

        if (lookup.profile.pronouns !== undefined) {
            enriched.pronouns = lookup.profile.pronouns;
        }

        if (lookup.profile.avatarFileId !== undefined) {
            enriched.avatarFileId = lookup.profile.avatarFileId;
        }

        if (lookup.profile.avatarUrl !== undefined) {
            enriched.avatarUrl = lookup.profile.avatarUrl;
        }

        return enriched;
    } catch {
        // If enrichment fails, return original message
        return message;
    }
}

/**
 * Enriches a message with reply context from a list of messages
 * Used for realtime updates where we need to add reply info after profile enrichment
 *
 * @param {{ $id: string; userId: string; userName?: string | undefined; text: string; $createdAt: string; channelId?: string | undefined; serverId?: string | undefined; editedAt?: string | undefined; removedAt?: string | undefined; removedBy?: string | undefined; imageFileId?: string | undefined; imageUrl?: string | undefined; attachments?: FileAttachment[] | undefined; replyToId?: string | undefined; threadId?: string | undefined; threadMessageCount?: number | undefined; threadParticipants?: string[] | undefined; lastThreadReplyAt?: string | undefined; mentions?: string[] | undefined; reactions?: { emoji: string; userIds: string[]; count: number; }[] | undefined; displayName?: string | undefined; avatarFileId?: string | undefined; avatarUrl?: string | undefined; pronouns?: string | undefined; replyTo?: { text: string; userName?: string | undefined; displayName?: string | undefined; } | undefined; threadReplyCount?: number | undefined; isPinned?: boolean | undefined; pinnedAt?: string | undefined; pinnedBy?: string | undefined; }} message - The message value.
 * @param {Message[]} allMessages - The all messages value.
 * @returns { $id: string; userId: string; userName?: string | undefined; text: string; $createdAt: string; channelId?: string | undefined; serverId?: string | undefined; editedAt?: string | undefined; removedAt?: string | undefined; removedBy?: string | undefined; imageFileId?: string | undefined; imageUrl?: string | undefined; attachments?: FileAttachment[] | undefined; replyToId?: string | undefined; threadId?: string | undefined; threadMessageCount?: number | undefined; threadParticipants?: string[] | undefined; lastThreadReplyAt?: string | undefined; mentions?: string[] | undefined; reactions?: { emoji: string; userIds: string[]; count: number; }[] | undefined; displayName?: string | undefined; avatarFileId?: string | undefined; avatarUrl?: string | undefined; pronouns?: string | undefined; replyTo?: { text: string; userName?: string | undefined; displayName?: string | undefined; } | undefined; threadReplyCount?: number | undefined; isPinned?: boolean | undefined; pinnedAt?: string | undefined; pinnedBy?: string | undefined; }.
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
