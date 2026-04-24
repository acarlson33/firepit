import { Query } from "appwrite";

import { logger } from "@/lib/client-logger";
import { getBrowserDatabases, getEnvConfig } from "@/lib/appwrite-core";
import { buildMessagePoll, type PollDocShape } from "@/lib/polls";
import type { Message } from "@/lib/types";

const POLLS_PAGE_LIMIT = 100;
const POLL_VOTES_PAGE_LIMIT = 1000;
const MAX_POLL_PAGES = 50;

type PollVoteDocShape = {
    $id: string;
    pollId: string;
    userId: string;
    optionId: string;
};

function normalizePollDocument(raw: unknown): PollDocShape | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const value = raw as Record<string, unknown>;
    if (
        typeof value.$id !== "string" ||
        typeof value.messageId !== "string" ||
        typeof value.channelId !== "string" ||
        typeof value.question !== "string" ||
        typeof value.options !== "string" ||
        typeof value.createdBy !== "string"
    ) {
        return null;
    }

    return {
        $id: value.$id,
        messageId: value.messageId,
        channelId: value.channelId,
        question: value.question,
        options: value.options,
        status: value.status === "closed" ? "closed" : "open",
        createdBy: value.createdBy,
        closedAt: typeof value.closedAt === "string" ? value.closedAt : undefined,
        closedBy: typeof value.closedBy === "string" ? value.closedBy : undefined,
    };
}

function normalizePollVoteDocument(raw: unknown): PollVoteDocShape | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const value = raw as Record<string, unknown>;
    if (
        typeof value.$id !== "string" ||
        typeof value.pollId !== "string" ||
        typeof value.userId !== "string" ||
        typeof value.optionId !== "string"
    ) {
        return null;
    }

    return {
        $id: value.$id,
        pollId: value.pollId,
        userId: value.userId,
        optionId: value.optionId,
    };
}

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

    const { documents, truncated } = await import("@/lib/appwrite-pagination").then((m) =>
        m.listPages({
            databases,
            databaseId,
            collectionId: pollsCollectionId,
            baseQueries: [Query.equal("messageId", messageIds), Query.orderAsc("$id")],
            pageSize: POLLS_PAGE_LIMIT,
            maxPages: MAX_POLL_PAGES,
            warningContext: "listPollDocumentsForMessages",
        }),
    );

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

    const { documents, truncated } = await import("@/lib/appwrite-pagination").then((m) =>
        m.listPages({
            databases,
            databaseId,
            collectionId: pollVotesCollectionId,
            baseQueries: [Query.equal("pollId", pollIds), Query.orderAsc("$id")],
            pageSize: POLL_VOTES_PAGE_LIMIT,
            maxPages: MAX_POLL_PAGES,
            warningContext: "listVoteDocumentsForPolls",
        }),
    );

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
    const env = getEnvConfig();

    try {
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
            }

            pollsByMessageId.set(
                poll.messageId,
                buildMessagePoll({
                    poll,
                    votes: votesByPollId.get(poll.$id) ?? [],
                }),
            );
        }

        return messages.map((message) => ({
            ...message,
            poll: pollsByMessageId.get(message.$id),
        }));
    } catch (error) {
        logger.error("Failed to enrich messages with poll data", undefined, {
            messageCount: messages.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return messages;
    }
}
