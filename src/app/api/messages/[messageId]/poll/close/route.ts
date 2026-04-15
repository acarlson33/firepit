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

    const message = await databases.getDocument(
        env.databaseId,
        env.collections.messages,
        messageId,
    );

    const channelId =
        typeof message.channelId === "string" ? message.channelId : null;
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

    const poll = await getPollDocumentByMessageId(databases, env, messageId);
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

    const pollState = await getPollStateForMessage(databases, env, messageId);
    return NextResponse.json({ poll: pollState });
}
