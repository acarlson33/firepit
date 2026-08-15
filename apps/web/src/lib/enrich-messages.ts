import type { Message } from "./types";
import { apiCache, CACHE_TTL } from "./cache-utils";
import { parseReactions } from "./reactions-utils";

type BatchProfileData = {
    userId: string;
    displayName?: string;
    pronouns?: string;
    avatarFileId?: string;
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
};

type BatchProfileLookup = {
    profileMap: Map<string, BatchProfileData>;
    visibleUserIds: Set<string> | null;
};

const PROFILE_VISIBILITY_CACHE_TTL_MS = 60 * 1000;

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
            // Fail closed: a non-ok response means visibility is unknown, so
            // hide messages instead of showing ones we couldn't verify.
            return {
                profileMap,
                visibleUserIds: new Set(),
            };
        }

        const data = (await response.json()) as {
            profiles: Record<
                string,
                {
                    userId: string;
                    displayName?: string;
                    pronouns?: string;
                    avatarFileId?: string;
                    avatarUrl?: string;
                    avatarFramePreset?: string;
                    avatarFrameUrl?: string;
                }
            >;
            visibleUserIds?: string[];
        };

        for (const [uid, profile] of Object.entries(data.profiles)) {
            profileMap.set(uid, {
                userId: uid,
                displayName: profile.displayName,
                pronouns: profile.pronouns,
                avatarFileId: profile.avatarFileId,
                avatarUrl: profile.avatarUrl,
                avatarFramePreset: profile.avatarFramePreset,
                avatarFrameUrl: profile.avatarFrameUrl,
            });
        }

        return {
            profileMap,
            visibleUserIds: Array.isArray(data.visibleUserIds)
                ? new Set(data.visibleUserIds)
                : null,
        };
    } catch {
        // Batch failed — fail closed for visibility filtering (empty set hides
        // unverifiable messages instead of showing them all)
    }
    return {
        profileMap,
        visibleUserIds: new Set(),
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

            if (profile?.avatarFramePreset !== undefined) {
                enriched.avatarFramePreset = profile.avatarFramePreset;
            }

            if (profile?.avatarFrameUrl !== undefined) {
                enriched.avatarFrameUrl = profile.avatarFrameUrl;
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
 * @param {string} [viewerId] - The current viewer's user id. Visibility is viewer-specific, so the cached result is scoped by it.
 * @returns {Promise<Message | null>} The return value.
 */
export async function enrichMessageWithProfile(
    message: Message,
    viewerId?: string | null,
): Promise<Message | null> {
    try {
        // Cache profile data (viewer-independent) separately from the
        // viewer-specific visibility result so one viewer's result is never
        // reused for another viewer.
        const profileKey = `profile:${message.userId}`;
        const visibilityKey = viewerId
            ? `profile-visibility:${viewerId}:${message.userId}`
            : null;

        const cachedProfile = apiCache.get<{ profile: BatchProfileData | null }>(
            profileKey,
        );
        const cachedVisibility =
            visibilityKey !== null ? apiCache.get<boolean>(visibilityKey) : null;

        let profile: BatchProfileData | null;
        let isVisible: boolean;

        if (cachedProfile !== null && cachedVisibility !== null) {
            profile = cachedProfile.profile;
            isVisible = cachedVisibility;
        } else {
            const { profileMap, visibleUserIds } = await fetchProfilesBatch([
                message.userId,
            ]);
            profile = profileMap.get(message.userId) ?? null;
            isVisible = visibleUserIds
                ? visibleUserIds.has(message.userId)
                : true;

            apiCache.set(profileKey, { profile }, CACHE_TTL.PROFILES);
            if (visibilityKey !== null) {
                apiCache.set(
                    visibilityKey,
                    isVisible,
                    PROFILE_VISIBILITY_CACHE_TTL_MS,
                );
            }
        }

        if (!isVisible) {
            return null;
        }

        if (!profile) {
            return message;
        }

        const enriched: Message = {
            ...message,
            // Parse reactions if they're a JSON string
            reactions: parseReactions(message.reactions),
        };

        if (profile.displayName !== undefined) {
            enriched.displayName = profile.displayName;
        }

        if (profile.pronouns !== undefined) {
            enriched.pronouns = profile.pronouns;
        }

        if (profile.avatarFileId !== undefined) {
            enriched.avatarFileId = profile.avatarFileId;
        }

        if (profile.avatarUrl !== undefined) {
            enriched.avatarUrl = profile.avatarUrl;
        }

        if (profile.avatarFramePreset !== undefined) {
            enriched.avatarFramePreset = profile.avatarFramePreset;
        }

        if (profile.avatarFrameUrl !== undefined) {
            enriched.avatarFrameUrl = profile.avatarFrameUrl;
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
