/**
 * Client-side API wrapper for Direct Messages
 * Uses server-side API routes to avoid permission issues
 */

import type { Conversation, DirectMessage, UserProfileData } from "./types";
import { parseReactions } from "./reactions-utils";
import { extractMentionedUsernames } from "./mention-utils";

/**
 * Upload an image to Appwrite Storage
 */
export async function uploadImage(
    file: File,
): Promise<{ fileId: string; url: string }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload image");
    }

    const data = await response.json();
    return { fileId: data.fileId, url: data.url };
}

/**
 * Delete an image from Appwrite Storage
 */
export async function deleteImage(fileId: string): Promise<void> {
    const response = await fetch(
        `/api/upload-image?fileId=${encodeURIComponent(fileId)}`,
        {
            method: "DELETE",
        },
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete image");
    }
}

/**
 * Fetch a user profile from the existing profile API
 */
async function fetchUserProfile(userId: string) {
    try {
        const response = await fetch(
            `/api/profile/${encodeURIComponent(userId)}`,
        );
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data;
    } catch {
        return null;
    }
}

/**
 * Batch fetch multiple user profiles in a single API call
 */
async function fetchUserProfilesBatchAPI(
    userIds: string[],
): Promise<Map<string, Partial<UserProfileData>>> {
    const profileMap = new Map<string, Partial<UserProfileData>>();

    if (userIds.length === 0) {
        return profileMap;
    }

    try {
        const response = await fetch("/api/profiles/batch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ userIds }),
        });

        if (!response.ok) {
            // Fallback to individual fetches if batch endpoint fails
            console.warn(
                "Batch profile fetch failed, falling back to individual fetches",
            );
            return fetchUserProfilesBatch(userIds);
        }

        const data = (await response.json()) as {
            profiles: Record<string, UserProfileData>;
        };
        const profiles = data.profiles;

        Object.entries(profiles).forEach(([userId, profile]) => {
            profileMap.set(userId, {
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                status: profile.status,
            });
        });

        return profileMap;
    } catch (error) {
        console.error("Batch profile fetch error:", error);
        // Fallback to individual fetches
        return fetchUserProfilesBatch(userIds);
    }
}

/**
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(
    userId1: string,
    userId2: string,
): Promise<Conversation> {
    const response = await fetch(
        `/api/direct-messages?type=conversation&userId1=${encodeURIComponent(
            userId1,
        )}&userId2=${encodeURIComponent(userId2)}`,
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get conversation");
    }

    const data = await response.json();
    return data.conversation;
}

/**
 * Create a group DM conversation with 3+ participants
 */
export async function createGroupConversation(
    participantIds: string[],
    options?: { name?: string; avatarUrl?: string },
): Promise<Conversation> {
    if (!participantIds || participantIds.length < 3) {
        throw new Error("Group conversations require at least 3 participants");
    }

    const response = await fetch("/api/direct-messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            operation: "createConversation",
            participants: participantIds,
            name: options?.name,
            avatarUrl: options?.avatarUrl,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create conversation");
    }

    const data = await response.json();
    return data.conversation as Conversation;
}

/**
 * List all conversations for the current user
 */
export async function listConversations(
    userId: string,
): Promise<Conversation[]> {
    const response = await fetch("/api/direct-messages?type=conversations");

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to list conversations");
    }

    const data = await response.json();
    const conversations = data.conversations as Conversation[];

    const otherParticipantIds = new Set<string>();
    conversations.forEach((conv) => {
        conv.participants
            ?.filter((id) => id !== userId)
            .forEach((id) => otherParticipantIds.add(id));
    });

    const profileMap = await fetchUserProfilesBatchAPI(
        Array.from(otherParticipantIds),
    );

    const enriched = conversations.map((conv) => {
        const participantIds = conv.participants || [];
        const isGroup = conv.isGroup || participantIds.length > 2;
        const others = participantIds.filter((id) => id !== userId);
        const participantProfiles = others.map((id) => {
            const profile = profileMap.get(id);
            return {
                userId: id,
                displayName: profile?.displayName,
                avatarUrl: profile?.avatarUrl,
                status: profile?.status?.status,
            };
        });

        const computedName =
            conv.name ||
            (isGroup
                ? participantProfiles
                      .slice(0, 3)
                      .map((p) => p.displayName || p.userId)
                      .join(", ") || "Group DM"
                : participantProfiles[0]?.displayName);

        const computedAvatar =
            conv.avatarUrl ||
            (!isGroup ? participantProfiles[0]?.avatarUrl : undefined);

        const base: Conversation = {
            ...conv,
            isGroup,
            participantCount: participantIds.length,
            name: computedName || conv.name,
            avatarUrl: computedAvatar,
        };

        if (!isGroup) {
            const otherUserProfile = participantProfiles[0];
            return {
                ...base,
                otherUser: otherUserProfile
                    ? {
                          userId: otherUserProfile.userId,
                          displayName: otherUserProfile.displayName,
                          avatarUrl: otherUserProfile.avatarUrl,
                          status: otherUserProfile.status,
                      }
                    : base.otherUser,
            };
        }

        return base;
    });

    return enriched;
}

/**
 * Send a direct message
 */
export async function sendDirectMessage(
    conversationId: string,
    senderId: string,
    receiverId: string | undefined,
    text: string,
    imageFileId?: string,
    imageUrl?: string,
    replyToId?: string,
    attachments?: unknown[],
): Promise<DirectMessage> {
    // Parse mentions from text
    const mentions = extractMentionedUsernames(text);

    const response = await fetch("/api/direct-messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            conversationId,
            senderId,
            receiverId,
            text,
            imageFileId,
            imageUrl,
            attachments:
                attachments && attachments.length > 0 ? attachments : undefined,
            replyToId,
            mentions: mentions.length > 0 ? mentions : undefined,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send message");
    }

    const data = await response.json();
    return data.message;
}

/**
 * Fetch multiple user profiles in batch
 * This is the fallback method that fetches profiles individually in batches of 5
 * Used if the batch API endpoint fails
 */
async function fetchUserProfilesBatch(
    userIds: string[],
): Promise<Map<string, Partial<UserProfileData>>> {
    const uniqueUserIds = [...new Set(userIds)];
    const profileMap = new Map<string, Partial<UserProfileData>>();

    // Fetch all profiles in parallel (but limit concurrency to avoid overwhelming the server)
    const batchSize = 5;
    for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
        const batch = uniqueUserIds.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map(async (userId) => {
                const profile = await fetchUserProfile(userId);
                return { userId, profile };
            }),
        );

        results.forEach((result) => {
            if (result.status === "fulfilled" && result.value.profile) {
                profileMap.set(result.value.userId, {
                    displayName: result.value.profile.displayName,
                    avatarUrl: result.value.profile.avatarUrl,
                    status: result.value.profile.status,
                });
            }
        });
    }

    return profileMap;
}

/**
 * Load image URLs for messages that have imageFileId but no imageUrl yet
 * This is called separately after initial message load to avoid blocking
 */
export async function loadMessageImages(
    messages: DirectMessage[],
): Promise<Map<string, string>> {
    const imageMap = new Map<string, string>();

    // Find messages with images that need URLs loaded
    const messagesNeedingImages = messages.filter(
        (msg) => msg.imageFileId && !msg.imageUrl,
    );

    if (messagesNeedingImages.length === 0) {
        return imageMap;
    }

    // Load image URLs from the API (batch if possible in future)
    // For now, we'll just return the map since imageUrl is already in the response
    // This function is here for future optimization if we want to lazy-load images

    return imageMap;
}

/**
 * List direct messages in a conversation
 * Optimized to batch queries and load images separately
 */
export async function listDirectMessages(
    conversationId: string,
    limit = 50,
    cursor?: string,
): Promise<{ items: DirectMessage[]; nextCursor?: string }> {
    const params = new URLSearchParams({
        type: "messages",
        conversationId,
        limit: limit.toString(),
    });

    if (cursor) {
        params.append("cursor", cursor);
    }

    const response = await fetch(`/api/direct-messages?${params.toString()}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to list messages");
    }

    const data = await response.json();
    const items = data.items as DirectMessage[];

    // Batch fetch user profiles for all unique sender IDs
    const senderIds = [...new Set(items.map((msg) => msg.senderId))];
    const profileMap = await fetchUserProfilesBatchAPI(senderIds);

    // Build a message map for reply context lookup
    const messagesById = new Map(items.map((m) => [m.$id, m]));

    // Enrich messages with profile data and reply context
    const enriched = items.map((msg) => {
        const profile = profileMap.get(msg.senderId);
        const enrichedMsg: DirectMessage = {
            ...msg,
            senderDisplayName: profile?.displayName,
            senderAvatarUrl: profile?.avatarUrl,
            // Parse reactions if they're a JSON string
            reactions: parseReactions(msg.reactions),
        };

        // Add reply context if this message is a reply
        if (msg.replyToId) {
            const parentMessage = messagesById.get(msg.replyToId);
            if (parentMessage) {
                const parentProfile = profileMap.get(parentMessage.senderId);
                enrichedMsg.replyTo = {
                    text: parentMessage.text,
                    senderDisplayName: parentProfile?.displayName,
                };
            }
        }

        return enrichedMsg;
    });

    return {
        items: enriched,
        nextCursor: data.nextCursor || undefined,
    };
}

/**
 * Edit a direct message
 */
export async function editDirectMessage(
    messageId: string,
    newText: string,
): Promise<void> {
    const response = await fetch(
        `/api/direct-messages?id=${encodeURIComponent(messageId)}`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                text: newText,
            }),
        },
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to edit message");
    }
}

/**
 * Delete a direct message (soft delete)
 */
export async function deleteDirectMessage(
    messageId: string,
    _userId: string, // Kept for API compatibility but not used (server validates from session)
): Promise<void> {
    const response = await fetch(
        `/api/direct-messages?id=${encodeURIComponent(messageId)}`,
        {
            method: "DELETE",
        },
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete message");
    }
}
