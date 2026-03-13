import { listRecentMessages } from "./appwrite-messages";
import { enrichMessagesWithProfiles } from "./enrich-messages";

/**
 * Returns enriched messages.
 *
 * @param {number} pageSize - The page size value.
 * @param {string | undefined} cursor - The cursor value, if provided.
 * @param {string | null | undefined} channelId - The channel id value, if provided.
 * @returns {Promise<Message[]>} The return value.
 */
export async function getEnrichedMessages(
    pageSize: number,
    cursor?: string,
    channelId?: string | null,
) {
    // Fetch messages from Appwrite
    const messages = await listRecentMessages(
        pageSize,
        cursor,
        channelId ?? undefined,
    );

    // Enrich with profile data
    const enriched = await enrichMessagesWithProfiles(messages);

    return enriched;
}
