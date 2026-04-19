import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import type { EnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";
import { buildMessagePoll, type PollDocShape } from "@/lib/polls";
import type { MessagePoll } from "@/lib/types";

const POLL_VOTES_PAGE_LIMIT = 1000;

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
): Promise<PollVoteDocShape[]> {
    const votes: PollVoteDocShape[] = [];
    let cursor: string | undefined;

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

    return votes;
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

    const votes = await listVotesForPoll(databases, env, poll.$id);
    return buildMessagePoll({ poll, votes });
}
