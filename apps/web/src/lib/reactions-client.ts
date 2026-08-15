/**
 * Client-side API functions for message reactions
 */

import type { Reaction } from "./reactions-utils";

/**
 * Adds a reaction to a message on either the channel or DM route.
 * When isDM is true, the DM reaction endpoint is used; otherwise the channel
 * message endpoint is used.
 *
 * @param {string} messageId - Target message identifier.
 * @param {string} emoji - Emoji to add for the current user.
 * @param {boolean} isDM - Switches between DM and channel reaction APIs.
 * @returns {Promise<{ success: boolean; reactions?: Reaction[] | undefined; }>} Resolves with success metadata and an optional updated reactions array when provided by the API.
 */
export async function addReaction(
    messageId: string,
    emoji: string,
    isDM = false,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
    const endpoint = isDM
        ? `/api/direct-messages/${encodeURIComponent(messageId)}/reactions`
        : `/api/messages/${encodeURIComponent(messageId)}/reactions`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ emoji }),
    });

    if (!response.ok) {
        let errorMessage = "Failed to add reaction";
        try {
            const error = (await response.json()) as { error?: unknown };
            if (typeof error.error === "string" && error.error) {
                errorMessage = error.error;
            }
        } catch {
            // Non-JSON error body; fall back to the HTTP failure message.
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Removes a reaction from a message on either the channel or DM route.
 * When isDM is true, the DM reaction endpoint is used; otherwise the channel
 * message endpoint is used.
 *
 * @param {string} messageId - Target message identifier.
 * @param {string} emoji - Emoji to remove for the current user.
 * @param {boolean} isDM - Switches between DM and channel reaction APIs.
 * @returns {Promise<{ success: boolean; reactions?: Reaction[] | undefined; }>} Resolves with success metadata and an optional updated reactions array when provided by the API.
 */
export async function removeReaction(
    messageId: string,
    emoji: string,
    isDM = false,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
    const endpoint = isDM
        ? `/api/direct-messages/${encodeURIComponent(messageId)}/reactions`
        : `/api/messages/${encodeURIComponent(messageId)}/reactions`;

    const response = await fetch(
        `${endpoint}?emoji=${encodeURIComponent(emoji)}`,
        {
            method: "DELETE",
        },
    );

    if (!response.ok) {
        let errorMessage = "Failed to remove reaction";
        try {
            const error = (await response.json()) as { error?: unknown };
            if (typeof error.error === "string" && error.error) {
                errorMessage = error.error;
            }
        } catch {
            // Non-JSON error body; fall back to the HTTP failure message.
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Executes add or remove behavior for a reaction based on isAdding.
 * isAdding=true delegates to addReaction and isAdding=false delegates to
 * removeReaction; isDM controls whether DM or channel routes are called.
 *
 * @param {string} messageId - Target message identifier.
 * @param {string} emoji - Emoji to toggle.
 * @param {boolean} isAdding - Chooses add (true) vs remove (false) operation.
 * @param {boolean} isDM - Switches between DM and channel reaction APIs.
 * @returns {Promise<{ success: boolean; reactions?: Reaction[] | undefined; }>} Resolves with success metadata and an optional updated reactions array when provided by the API.
 */
export async function toggleReaction(
    messageId: string,
    emoji: string,
    isAdding: boolean,
    isDM = false,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
    if (isAdding) {
        return addReaction(messageId, emoji, isDM);
    }
    return removeReaction(messageId, emoji, isDM);
}
