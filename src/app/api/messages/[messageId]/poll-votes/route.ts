import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { Query } from "node-appwrite";

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

function isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = "code" in error ? Number(error.code) : Number.NaN;
    if (code === 404) {
        return true;
    }

    const type = "type" in error ? String(error.type).toLowerCase() : "";
    if (type.includes("not_found") || type.includes("document_not_found")) {
        return true;
    }

    const message =
        "message" in error ? String(error.message).toLowerCase() : "";
    return (
        message.includes("not found") ||
        message.includes("document with the requested id could not be found")
    );
}

function isConflictError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = "code" in error ? Number(error.code) : Number.NaN;
    if (code === 409) {
        return true;
    }

    const type = "type" in error ? String(error.type).toLowerCase() : "";
    if (type.includes("conflict") || type.includes("already_exists")) {
        return true;
    }

    const message =
        "message" in error ? String(error.message).toLowerCase() : "";
    return message.includes("already exists") || message.includes("duplicate");
}

async function findExistingVote(params: {
    databases: ReturnType<typeof getServerClient>["databases"];
    databaseId: string;
    collectionId: string;
    pollId: string;
    userId: string;
}) {
    const { databases, databaseId, collectionId, pollId, userId } = params;

    const response = await databases.listDocuments(databaseId, collectionId, [
        Query.equal("pollId", pollId),
        Query.equal("userId", userId),
        Query.limit(1),
    ]);

    return response.documents.at(0) ?? null;
}

export async function POST(request: NextRequest, context: RouteContext) {
    const user = await getServerSession();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { messageId } = await context.params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON request body" },
            { status: 400 },
        );
    }


    const reqBody = body as { optionId?: unknown };
    const optionId =
        typeof reqBody.optionId === "string"
            ? reqBody.optionId.trim()
            : "";

    if (!optionId) {
        return NextResponse.json(
            { error: "optionId is required" },
            { status: 400 },
        );
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();

    let message: Awaited<ReturnType<typeof databases.getDocument>>;
    try {
        message = await databases.getDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
        );
    } catch (error) {
        if (isNotFoundError(error)) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 },
            );
        }

        throw error;
    }

    const messageRecord = message as Record<string, unknown>;
    const channelId =
        typeof messageRecord.channelId === "string"
            ? messageRecord.channelId
            : null;
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

    const voteTimestamp = new Date().toISOString();
    const voteId = createHash("sha256")
        .update(`${poll.$id}:${user.$id}`)
        .digest("hex")
        .slice(0, 32);

    const existingVote = await findExistingVote({
        databases,
        databaseId: env.databaseId,
        collectionId: env.collections.pollVotes,
        pollId: poll.$id,
        userId: user.$id,
    });

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

        const pollState = await getPollStateForMessage(databases, env, messageId);
        return NextResponse.json({ poll: pollState });
    }

    try {
        await databases.createDocument(
            env.databaseId,
            env.collections.pollVotes,
            voteId,
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
    } catch (error) {
        if (!isConflictError(error)) {
            throw error;
        }

        const retryVote = await findExistingVote({
            databases,
            databaseId: env.databaseId,
            collectionId: env.collections.pollVotes,
            pollId: poll.$id,
            userId: user.$id,
        });

        if (!retryVote) {
            throw error;
        }

        await databases.updateDocument(
            env.databaseId,
            env.collections.pollVotes,
            String(retryVote.$id),
            {
                optionId,
                votedAt: voteTimestamp,
            },
        );
    }

    const pollState = await getPollStateForMessage(databases, env, messageId);
    return NextResponse.json({ poll: pollState });
}
