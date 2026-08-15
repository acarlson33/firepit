import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import type { EnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";
import { chunkValues, listPages } from "@/lib/appwrite-pagination";
import {
    buildMessagePoll,
    normalizePollDocument,
    normalizePollVoteDocument,
    type PollDocShape,
    type PollVoteDocShape,
} from "@/lib/polls";
import type { MessagePoll } from "@/lib/types";

const POLL_VOTES_PAGE_LIMIT = 1000;
const QUERY_ARRAY_LIMIT = 100;

export async function getPollDocumentByMessageId(
    databases: Databases,
    env: EnvConfig,
    messageId: string,
): Promise<PollDocShape | null> {
    const response = await databases.listDocuments(env.databaseId, env.collections.polls, [
        Query.equal("messageId", messageId),
        Query.limit(1),
    ]);

    if (response.documents.length === 0) {
        return null;
    }

    return normalizePollDocument(response.documents[0]);
}

async function listVotesForPoll(
    databases: Databases,
    env: EnvConfig,
    pollId: string,
): Promise<{ votes: PollVoteDocShape[]; truncated: boolean }> {
    const votes: PollVoteDocShape[] = [];
    let cursor: string | undefined;
    let truncated = false;

    while (true) {
        const queries = [
            Query.equal("pollId", pollId),
            Query.orderAsc("$id"),
            Query.limit(POLL_VOTES_PAGE_LIMIT),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ];

        const response = await databases.listDocuments(
            env.databaseId,
            env.collections.pollVotes,
            queries,
        );

        votes.push(
            ...response.documents
                .map((rawVote) => normalizePollVoteDocument(rawVote))
                .filter((vote): vote is PollVoteDocShape => vote !== null),
        );

        if (response.documents.length < POLL_VOTES_PAGE_LIMIT) {
            break;
        }

        const lastDocument = response.documents.at(-1);
        if (!lastDocument || typeof lastDocument.$id !== "string") {
            truncated = true;
            break;
        }

        if (lastDocument.$id === cursor) {
            truncated = true;
            break;
        }

        cursor = lastDocument.$id;
    }

    if (votes.length >= POLL_VOTES_PAGE_LIMIT) {
        logger.warn("Poll has high vote count requiring pagination", {
            pollId,
            totalVotes: votes.length,
        });
    }

    return { votes, truncated };
}

export async function getPollStateForMessage(
    databases: Databases,
    env: EnvConfig,
    messageId: string,
): Promise<MessagePoll | null> {
    const poll = await getPollDocumentByMessageId(databases, env, messageId);
    if (!poll) {
        return null;
    }

    const { votes, truncated } = await listVotesForPoll(databases, env, poll.$id);
    if (truncated) {
        logger.warn(
            "Poll vote pagination truncated; skipping poll state to avoid incomplete counts",
            { pollId: poll.$id, messageId },
        );
        return null;
    }

    return buildMessagePoll({ poll, votes });
}

export async function getPollStatesForMessages(
    databases: Databases,
    env: EnvConfig,
    messageIds: string[],
): Promise<Map<string, MessagePoll>> {
    const result = new Map<string, MessagePoll>();
    if (messageIds.length === 0) return result;

    const polls: PollDocShape[] = [];
    for (const messageIdChunk of chunkValues(messageIds, QUERY_ARRAY_LIMIT)) {
        const { documents } = await listPages({
            databases,
            databaseId: env.databaseId,
            collectionId: env.collections.polls,
            baseQueries: [Query.equal("messageId", messageIdChunk)],
            pageSize: 100,
            warningContext: "getPollStatesForMessages-polls",
        });

        for (const document of documents) {
            const poll = normalizePollDocument(document);
            if (poll) polls.push(poll);
        }
    }

    if (polls.length === 0) return result;

    const pollIds = polls.map((p) => p.$id);
    const votesByPollId = new Map<string, PollVoteDocShape[]>();
    for (const pollIdChunk of chunkValues(pollIds, QUERY_ARRAY_LIMIT)) {
        const { documents } = await listPages({
            databases,
            databaseId: env.databaseId,
            collectionId: env.collections.pollVotes,
            baseQueries: [Query.equal("pollId", pollIdChunk)],
            pageSize: POLL_VOTES_PAGE_LIMIT,
            warningContext: "getPollStatesForMessages-votes",
        });

        for (const rawVote of documents) {
            const vote = normalizePollVoteDocument(rawVote);
            if (!vote) continue;
            const existing = votesByPollId.get(vote.pollId);
            if (existing) {
                existing.push(vote);
            } else {
                votesByPollId.set(vote.pollId, [vote]);
            }
        }
    }

    // Build each poll state
    for (const poll of polls) {
        const pollVotes = votesByPollId.get(poll.$id) ?? [];
        result.set(poll.messageId, buildMessagePoll({ poll, votes: pollVotes }));
    }

    return result;
}
