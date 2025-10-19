/**
 * Client-side API wrapper for Direct Messages
 * Uses server-side API routes to avoid permission issues
 */

import type { Conversation, DirectMessage } from "./types";

/**
 * Fetch a user profile from the existing profile API
 */
async function fetchUserProfile(userId: string) {
  try {
    const response = await fetch(`/api/profile/${encodeURIComponent(userId)}`);
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
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(
  userId1: string,
  userId2: string
): Promise<Conversation> {
  const response = await fetch(
    `/api/direct-messages?type=conversation&userId1=${encodeURIComponent(
      userId1
    )}&userId2=${encodeURIComponent(userId2)}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get conversation");
  }

  const data = await response.json();
  return data.conversation;
}

/**
 * List all conversations for the current user
 */
export async function listConversations(
  userId: string
): Promise<Conversation[]> {
  const response = await fetch("/api/direct-messages?type=conversations");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to list conversations");
  }

  const data = await response.json();
  const conversations = data.conversations as Conversation[];

  // Enrich with other user's profile data
  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const otherUserId = conv.participants.find((id) => id !== userId);
      if (!otherUserId) {
        return conv;
      }

      try {
        const profile = await fetchUserProfile(otherUserId);
        return {
          ...conv,
          otherUser: {
            userId: otherUserId,
            displayName: profile?.displayName,
            avatarUrl: profile?.avatarUrl,
          },
        };
      } catch {
        return {
          ...conv,
          otherUser: {
            userId: otherUserId,
          },
        };
      }
    })
  );

  return enriched;
}

/**
 * Send a direct message
 */
export async function sendDirectMessage(
  conversationId: string,
  senderId: string,
  receiverId: string,
  text: string
): Promise<DirectMessage> {
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
 * List direct messages in a conversation
 */
export async function listDirectMessages(
  conversationId: string,
  limit = 50,
  cursor?: string
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

  // Enrich with sender profile data
  const enriched = await Promise.all(
    items.map(async (msg) => {
      try {
        const profile = await fetchUserProfile(msg.senderId);
        return {
          ...msg,
          senderDisplayName: profile?.displayName,
          senderAvatarUrl: profile?.avatarUrl,
          senderPronouns: profile?.pronouns,
        };
      } catch {
        return msg;
      }
    })
  );

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
  newText: string
): Promise<void> {
  const response = await fetch(`/api/direct-messages?id=${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: newText,
    }),
  });

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
  _userId: string // Kept for API compatibility but not used (server validates from session)
): Promise<void> {
  const response = await fetch(`/api/direct-messages?id=${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete message");
  }
}
