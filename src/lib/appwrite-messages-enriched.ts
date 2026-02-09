import { listRecentMessages } from "./appwrite-messages";
import { enrichMessagesWithProfiles } from "./enrich-messages";

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
