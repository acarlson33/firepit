import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import type { EnvConfig } from "@/lib/appwrite-core";
import { buildMessagePoll, type PollDocShape } from "@/lib/polls";
import type { MessagePoll } from "@/lib/types";

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

export async function listVotesForPoll(
    databases: Databases,
    env: EnvConfig,
    pollId: string,
): Promise<PollVoteDocShape[]> {
    const response = await databases.listDocuments(
        env.databaseId,
        env.collections.pollVotes,
        [Query.equal("pollId", pollId), Query.limit(3000)],
    );

    return response.documents
        .map((rawVote) => normalizePollVoteDocument(rawVote))
        .filter((vote): vote is PollVoteDocShape => vote !== null);
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
