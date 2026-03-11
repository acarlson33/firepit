import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getThreadReads, upsertThreadReads } from "@/lib/thread-read-store";
import { type ThreadReadContextType } from "@/lib/thread-read-states";

const VALID_CONTEXT_TYPES: ThreadReadContextType[] = [
    "channel",
    "conversation",
];

type PatchBody = {
    contextId?: string;
    contextType?: ThreadReadContextType;
    reads?: Record<string, string>;
};

function isValidContextType(
    value: string | null | undefined,
): value is ThreadReadContextType {
    return Boolean(
        value && VALID_CONTEXT_TYPES.includes(value as ThreadReadContextType),
    );
}

function isValidReadsMap(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return Object.entries(value).every(
        ([messageId, readAt]) =>
            typeof messageId === "string" &&
            messageId.length > 0 &&
            typeof readAt === "string" &&
            readAt.length > 0,
    );
}

export async function GET(request: Request) {
    const user = await getServerSession();
    if (!user?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const contextId = searchParams.get("contextId");
    const contextType = searchParams.get("contextType");

    if (!contextId || !isValidContextType(contextType)) {
        return NextResponse.json(
            { error: "contextId and valid contextType are required" },
            { status: 400 },
        );
    }

    const document = await getThreadReads({
        contextId,
        contextType,
        userId: user.$id,
    });

    return NextResponse.json({
        contextId,
        contextType,
        reads: document?.reads ?? {},
    });
}

export async function PATCH(request: Request) {
    const user = await getServerSession();
    if (!user?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const body = (await request.json()) as PatchBody;
    if (!body.contextId || !isValidContextType(body.contextType)) {
        return NextResponse.json(
            { error: "contextId and valid contextType are required" },
            { status: 400 },
        );
    }

    if (!isValidReadsMap(body.reads)) {
        return NextResponse.json(
            {
                error: "reads must be a record of message ids to ISO timestamps",
            },
            { status: 400 },
        );
    }

    const updated = await upsertThreadReads({
        contextId: body.contextId,
        contextType: body.contextType,
        reads: body.reads,
        userId: user.$id,
    });

    return NextResponse.json({
        contextId: body.contextId,
        contextType: body.contextType,
        reads: updated.reads,
    });
}
