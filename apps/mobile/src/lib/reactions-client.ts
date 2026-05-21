/**
 * Client-side API functions for message reactions (React Native)
 */

type Reaction = {
  emoji: string;
  userIds: string[];
  count: number;
};

export async function addReaction(
  messageId: string,
  emoji: string,
  isDM = false,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
  const endpoint = isDM
    ? `/api/direct-messages/${messageId}/reactions`
    : `/api/messages/${messageId}/reactions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emoji }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to add reaction");
  }

  return response.json();
}

export async function removeReaction(
  messageId: string,
  emoji: string,
  isDM = false,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
  const endpoint = isDM
    ? `/api/direct-messages/${messageId}/reactions`
    : `/api/messages/${messageId}/reactions`;

  const response = await fetch(`${endpoint}?emoji=${encodeURIComponent(emoji)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to remove reaction");
  }

  return response.json();
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
  isAdding: boolean,
  isDM = false,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
  if (isAdding) return addReaction(messageId, emoji, isDM);
  return removeReaction(messageId, emoji, isDM);
}
