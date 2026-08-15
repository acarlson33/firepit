import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getPollStateForMessage } from "@/lib/polls-server";
import { getChannelAccessForUser } from "@/lib/server-channel-access";
import {
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";

type RouteContext = {
    params: Promise<{
        messageId: string;
    }>;
};

/**
 * GET /api/messages/[messageId]/poll
 * Returns the poll state for a message, including options and votes.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
    const user = await getServerSession();
    if (!user) {
        return returnUnauthorized();
    }

    const { messageId } = await context.params;
    const env = getEnvConfig();
    const { databases } = getServerClient();

    try {
        const message = await databases.getDocument(
            env.databaseId,
            env.collections.messages,
            messageId,
        );
        const messageRecord = message as Record<string, unknown>;
        const channelId =
            typeof messageRecord.channelId === "string"
                ? messageRecord.channelId
                : null;
        if (channelId) {
            const access = await getChannelAccessForUser(
                databases,
                env,
                channelId,
                user.$id,
            );
            if (!access.canRead) {
                return returnForbidden();
            }
        }

        const pollState = await getPollStateForMessage(databases, env, messageId);
        return NextResponse.json({ poll: pollState });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to fetch poll",
            },
            { status: 500 },
        );
    }
}
