import { Query } from "appwrite";

import { getBrowserDatabases, getEnvConfig } from "@/lib/appwrite-core";
import { buildMessagePoll, type PollDocShape } from "@/lib/polls";
import type { Message } from "@/lib/types";

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

export async function enrichMessagesWithPolls(messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) {
        return messages;
    }

    const messageIds = messages.map((message) => message.$id);
    const env = getEnvConfig();
    const databases = getBrowserDatabases();

    try {
        const pollDocumentsResponse = await databases.listDocuments({
            databaseId: env.databaseId,
            collectionId: env.collections.polls,
            queries: [Query.equal("messageId", messageIds), Query.limit(100)],
        });

        const pollDocuments = pollDocumentsResponse.documents
            .map((raw) => normalizePollDocument(raw))
            .filter((value): value is PollDocShape => value !== null);

        if (pollDocuments.length === 0) {
            return messages;
        }

        const pollIds = pollDocuments.map((poll) => poll.$id);
        const voteDocumentsResponse = await databases.listDocuments({
            databaseId: env.databaseId,
            collectionId: env.collections.pollVotes,
            queries: [Query.equal("pollId", pollIds), Query.limit(3000)],
        });

        const votesByPollId = new Map<string, PollVoteDocShape[]>();
        for (const rawVote of voteDocumentsResponse.documents) {
            const vote = normalizePollVoteDocument(rawVote);
            if (!vote) {
                continue;
            }

            const pollVotes = votesByPollId.get(vote.pollId) ?? [];
            pollVotes.push(vote);
            votesByPollId.set(vote.pollId, pollVotes);
        }

        const pollsByMessageId = new Map(
            pollDocuments.map((poll) => [
                poll.messageId,
                buildMessagePoll({
                    poll,
                    votes: votesByPollId.get(poll.$id) ?? [],
                }),
            ]),
        );

        return messages.map((message) => ({
            ...message,
            poll: pollsByMessageId.get(message.$id),
        }));
    } catch {
        return messages;
    }
}
