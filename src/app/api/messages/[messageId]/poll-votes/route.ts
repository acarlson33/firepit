import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { parsePollOptions } from "@/lib/polls";
import {
    getPollDocumentByMessageId,
    getPollStateForMessage,
} from "@/lib/polls-server";
import { getChannelAccessForUser } from "@/lib/server-channel-access";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
    const user = await getServerSession();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { messageId } = await context.params;
    const body = await request.json();
    const optionId =
        typeof body.optionId === "string" ? body.optionId.trim() : "";

    if (!optionId) {
        return NextResponse.json(
            { error: "optionId is required" },
            { status: 400 },
        );
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();

    const message = await databases.getDocument(
        env.databaseId,
        env.collections.messages,
        messageId,
    );

    const channelId =
        typeof message.channelId === "string" ? message.channelId : null;
    if (!channelId) {
        return NextResponse.json(
            { error: "Poll voting is only supported for channel messages." },
            { status: 400 },
        );
    }

    const access = await getChannelAccessForUser(databases, env, channelId, user.$id);
    if (!access.isMember || !access.canSend) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const poll = await getPollDocumentByMessageId(databases, env, messageId);
    if (!poll) {
        return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    if (poll.status !== "open") {
        return NextResponse.json(
            { error: "This poll is closed." },
            { status: 400 },
        );
    }

    const options = parsePollOptions(poll.options);
    const selectedOption = options.find((option) => option.id === optionId);
    if (!selectedOption) {
        return NextResponse.json(
            { error: "Invalid poll option." },
            { status: 400 },
        );
    }

    const existingVoteResponse = await databases.listDocuments(
        env.databaseId,
        env.collections.pollVotes,
        [
            Query.equal("pollId", poll.$id),
            Query.equal("userId", user.$id),
            Query.limit(1),
        ],
    );

    const existingVote = existingVoteResponse.documents[0];
    const voteTimestamp = new Date().toISOString();

    if (existingVote) {
        await databases.updateDocument(
            env.databaseId,
            env.collections.pollVotes,
            String(existingVote.$id),
            {
                optionId,
                votedAt: voteTimestamp,
            },
        );
    } else {
        await databases.createDocument(
            env.databaseId,
            env.collections.pollVotes,
            ID.unique(),
            {
                pollId: poll.$id,
                userId: user.$id,
                optionId,
                votedAt: voteTimestamp,
            },
            perms.message(user.$id, {
                mod: env.teams.moderatorTeamId,
                admin: env.teams.adminTeamId,
            }),
        );
    }

    const pollState = await getPollStateForMessage(databases, env, messageId);
    return NextResponse.json({ poll: pollState });
}
