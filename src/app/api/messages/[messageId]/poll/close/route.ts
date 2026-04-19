import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import {
    getPollDocumentByMessageId,
    getPollStateForMessage,
} from "@/lib/polls-server";
import {
    getChannelAccessForUser,
    getServerPermissionsForUser,
} from "@/lib/server-channel-access";

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

export async function POST(_request: NextRequest, context: RouteContext) {
    const user = await getServerSession();
    if (!user) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { messageId } = await context.params;
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
            { error: "Poll closing is only supported for channel messages." },
            { status: 400 },
        );
    }

    const access = await getChannelAccessForUser(databases, env, channelId, user.$id);
    if (!access.isMember || !access.canRead) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let poll: Awaited<ReturnType<typeof getPollDocumentByMessageId>>;
    try {
        poll = await getPollDocumentByMessageId(databases, env, messageId);
    } catch (error) {
        if (isNotFoundError(error)) {
            return NextResponse.json({ error: "Poll not found" }, { status: 404 });
        }

        throw error;
    }

    if (!poll) {
        return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    const serverPermissions = await getServerPermissionsForUser(
        databases,
        env,
        access.serverId,
        user.$id,
    );

    const canClose =
        poll.createdBy === user.$id ||
        serverPermissions.permissions.manageMessages ||
        serverPermissions.permissions.administrator;

    if (!canClose) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (poll.status !== "closed") {
        await databases.updateDocument(
            env.databaseId,
            env.collections.polls,
            poll.$id,
            {
                status: "closed",
                closedAt: new Date().toISOString(),
                closedBy: user.$id,
            },
        );
    }

    let pollState: Awaited<ReturnType<typeof getPollStateForMessage>>;
    try {
        pollState = await getPollStateForMessage(databases, env, messageId);
    } catch (error) {
        if (isNotFoundError(error)) {
            return NextResponse.json({ error: "Poll not found" }, { status: 404 });
        }

        throw error;
    }

    if (!pollState) {
        return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    return NextResponse.json({ poll: pollState });
}
