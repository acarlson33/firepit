import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getThreadReads, upsertThreadReads } from "@/lib/thread-read-store";
import { type ThreadReadContextType } from "@/lib/thread-read-states";

const VALID_CONTEXT_TYPES: ThreadReadContextType[] = [
    "channel",
    "conversation",
];
const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FRACTIONAL_SECONDS_PATTERN = /\.(\d{1,3})Z$/;
const ZERO_MILLISECONDS_PATTERN = /\.000Z$/;

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

    function isValidIsoTimestamp(candidate: string) {
        if (!isoUtcPattern.test(candidate)) {
            return false;
        }

        const parsed = Date.parse(candidate);
        if (Number.isNaN(parsed)) {
            return false;
        }

        const normalizedCandidate = candidate
            .replace(FRACTIONAL_SECONDS_PATTERN, (_, fraction: string) => {
                return `.${fraction.padEnd(3, "0")}Z`;
            })
            .replace(ZERO_MILLISECONDS_PATTERN, "Z");
        const normalizedParsed = new Date(parsed)
            .toISOString()
            .replace(ZERO_MILLISECONDS_PATTERN, "Z");

        return normalizedParsed === normalizedCandidate;
    }

    return Object.entries(value).every(
        ([messageId, readAt]) =>
            typeof messageId === "string" &&
            messageId.length > 0 &&
            typeof readAt === "string" &&
            readAt.length > 0 &&
            isValidIsoTimestamp(readAt),
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

    let body: PatchBody;
    try {
        body = (await request.json()) as PatchBody;
    } catch {
        return NextResponse.json(
            { error: "Request body must be valid JSON" },
            { status: 400 },
        );
    }

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
