import { Query } from "appwrite";

import { logger } from "@/lib/client-logger";
import {
    chunkValues,
    listPages,
    mapWithConcurrency,
} from "@/lib/appwrite-pagination";
import { getBrowserDatabases, getEnvConfig } from "@/lib/appwrite-core";
import {
    buildMessagePoll,
    normalizePollDocument,
    normalizePollVoteDocument,
    type PollDocShape,
    type PollVoteDocShape,
} from "@/lib/polls";
import type { Message } from "@/lib/types";

const POLLS_PAGE_LIMIT = 100;
const POLL_VOTES_PAGE_LIMIT = 1000;
const MAX_POLL_PAGES = 50;
const QUERY_ARRAY_LIMIT = 100;

async function listPollDocumentsForMessages(params: {
    messageIds: string[];
    databaseId: string;
    pollsCollectionId: string;
}): Promise<PollDocShape[]> {
    const { messageIds, databaseId, pollsCollectionId } = params;
    if (messageIds.length === 0) {
        return [];
    }
    const databases = getBrowserDatabases();

    const pages = await mapWithConcurrency({
        items: chunkValues(messageIds, QUERY_ARRAY_LIMIT),
        concurrency: 4,
        mapper: (messageIdChunk) =>
            listPages({
                databases,
                databaseId,
                collectionId: pollsCollectionId,
                baseQueries: [
                    Query.equal("messageId", messageIdChunk),
                    Query.orderAsc("$id"),
                ],
                pageSize: POLLS_PAGE_LIMIT,
                maxPages: MAX_POLL_PAGES,
                warningContext: "listPollDocumentsForMessages",
            }),
    });

    const documents = pages.flatMap((page) => page.documents);
    const truncated = pages.some((page) => page.truncated);

    const pollDocuments = documents
        .map((raw) => normalizePollDocument(raw))
        .filter((value): value is PollDocShape => value !== null);

    if (truncated) {
        logger.warn("Poll query required multiple pages", {
            pageLimit: POLLS_PAGE_LIMIT,
            messageCount: messageIds.length,
        });
    }

    return pollDocuments;
}

async function listVoteDocumentsForPolls(params: {
    pollIds: string[];
    databaseId: string;
    pollVotesCollectionId: string;
}): Promise<PollVoteDocShape[]> {
    const { pollIds, databaseId, pollVotesCollectionId } = params;
    if (pollIds.length === 0) {
        return [];
    }
    const databases = getBrowserDatabases();

    const pages = await mapWithConcurrency({
        items: chunkValues(pollIds, QUERY_ARRAY_LIMIT),
        concurrency: 4,
        mapper: (pollIdChunk) =>
            listPages({
                databases,
                databaseId,
                collectionId: pollVotesCollectionId,
                baseQueries: [
                    Query.equal("pollId", pollIdChunk),
                    Query.orderAsc("$id"),
                ],
                pageSize: POLL_VOTES_PAGE_LIMIT,
                maxPages: MAX_POLL_PAGES,
                warningContext: "listVoteDocumentsForPolls",
            }),
    });

    const documents = pages.flatMap((page) => page.documents);
    const truncated = pages.some((page) => page.truncated);

    const voteDocuments = documents
        .map((raw) => normalizePollVoteDocument(raw))
        .filter((value): value is PollVoteDocShape => value !== null);

    if (truncated) {
        logger.warn("Poll votes query required pagination safeguards", {
            pageLimit: POLL_VOTES_PAGE_LIMIT,
            pollCount: pollIds.length,
        });
    }

    return voteDocuments;
}

export async function enrichMessagesWithPolls(messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) {
        return messages;
    }

    const messageIds = messages.map((message) => message.$id);

    try {
        const env = getEnvConfig();
        if (!env.collections.polls || !env.collections.pollVotes) {
            return messages;
        }

        const pollDocuments = await listPollDocumentsForMessages({
            messageIds,
            databaseId: env.databaseId,
            pollsCollectionId: env.collections.polls,
        });

        if (pollDocuments.length === 0) {
            return messages;
        }

        const pollIds = pollDocuments.map((poll) => poll.$id);
        const voteDocuments = await listVoteDocumentsForPolls({
            pollIds,
            databaseId: env.databaseId,
            pollVotesCollectionId: env.collections.pollVotes,
        });

        const votesByPollId = new Map<string, PollVoteDocShape[]>();
        for (const vote of voteDocuments) {
            const pollVotes = votesByPollId.get(vote.pollId) ?? [];
            pollVotes.push(vote);
            votesByPollId.set(vote.pollId, pollVotes);
        }

        // One poll per message is the expected data invariant.
        const pollsByMessageId = new Map<string, ReturnType<typeof buildMessagePoll>>();
        for (const poll of pollDocuments) {
            if (pollsByMessageId.has(poll.messageId)) {
                logger.warn("Multiple poll documents found for a single message", {
                    messageId: poll.messageId,
                    existingPollId: pollsByMessageId.get(poll.messageId)?.id ?? null,
                    incomingPollId: poll.$id,
                });
                continue; // Preserve first-seen poll
            }

            pollsByMessageId.set(
                poll.messageId,
                buildMessagePoll({
                    poll,
                    votes: votesByPollId.get(poll.$id) ?? [],
                }),
            );
        }

        return messages.map((message) => {
            const poll = pollsByMessageId.get(message.$id);
            return poll ? { ...message, poll } : message;
        });
    } catch (error) {
        logger.error("Failed to enrich messages with poll data", undefined, {
            messageCount: messages.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return messages;
    }
}
