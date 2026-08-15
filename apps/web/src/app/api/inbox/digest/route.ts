import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { listInboxDigest } from "@/lib/inbox";
import { logger } from "@/lib/newrelic-utils";
import type { InboxContextKind } from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(value: string | null) {
    if (!value) {
        return DEFAULT_LIMIT;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return null;
    }

    return parsed;
}

type ContextKindParseResult =
    | { kind: InboxContextKind; valid: true }
    | { kind: null; valid: true }
    | { kind: null; valid: false };

function parseContextKind(value: string | null): ContextKindParseResult {
    if (!value) {
        return { kind: null, valid: true };
    }

    if (value === "channel" || value === "conversation") {
        return { kind: value satisfies InboxContextKind, valid: true };
    }

    return { kind: null, valid: false };
}

export async function GET(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    if (!limit) {
        return NextResponse.json(
            { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
            { status: 400 },
        );
    }

    const contextId = searchParams.get("contextId")?.trim() || undefined;

    const parsedContextKind = parseContextKind(
        searchParams.get("contextKind"),
    );
    if (!parsedContextKind.valid) {
        return NextResponse.json(
            { error: "contextKind must be one of channel,conversation" },
            { status: 400 },
        );
    }

    const contextKind = parsedContextKind.kind || undefined;
    if ((contextId && !contextKind) || (!contextId && contextKind)) {
        return NextResponse.json(
            {
                error: "contextId and contextKind must be provided together",
            },
            { status: 400 },
        );
    }

    try {
        const digest = await listInboxDigest({
            contextId,
            contextKind,
            limit,
            userId: session.$id,
        });

        return NextResponse.json(digest);
    } catch (error) {
        logger.error("Failed to load inbox digest", {
            contextId,
            contextKind,
            limit,
            userId: session.$id,
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to load inbox digest" },
            { status: 500 },
        );
    }
}
