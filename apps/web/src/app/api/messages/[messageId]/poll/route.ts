import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getPollStateForMessage } from "@/lib/polls-server";
import { returnUnauthorized } from "@/lib/newrelic-utils";

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
        const pollState = await getPollStateForMessage(databases, env, messageId);
        return NextResponse.json({ poll: pollState });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to fetch poll",
            },
            { status: 500 },
        );
    }
}
