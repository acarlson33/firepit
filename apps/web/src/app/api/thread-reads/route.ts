import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getThreadReads, upsertThreadReads } from "@/lib/thread-read-store";
import { type ThreadReadContextType } from "@/lib/thread-read-states";
import { logger } from "@/lib/newrelic-utils";

const VALID_CONTEXT_TYPES: ThreadReadContextType[] = [
    "channel",
    "conversation",
];
const MAX_READS_ENTRIES = 1000;
const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FRACTIONAL_SECONDS_PATTERN = /\.(\d{1,3})Z$/;
const ZERO_MILLISECONDS_PATTERN = /\.000Z$/;

type PatchBody = {
    contextId?: string;
    contextKind?: ThreadReadContextType;
    reads?: Record<string, string>;
};

function normalizeIsoTimestamp(value: string): string {
    return new Date(value)
        .toISOString()
        .replace(ZERO_MILLISECONDS_PATTERN, "Z");
}

function isValidIsoTimestamp(candidate: string): boolean {
    if (!isoUtcPattern.test(candidate)) {
        return false;
    }

    const parsed = Date.parse(candidate);
    if (Number.isNaN(parsed)) {
        return false;
    }

    const normalizedCandidate = normalizeIsoTimestamp(
        candidate.replace(
            FRACTIONAL_SECONDS_PATTERN,
            (_, fraction: string) => {
                return `.${fraction.padEnd(3, "0")}Z`;
            },
        ),
    );
    const normalizedParsed = normalizeIsoTimestamp(
        new Date(parsed).toISOString(),
    );

    return normalizedParsed === normalizedCandidate;
}

function clampReadAt(readAt: string, now: number): string {
    const parsed = Date.parse(readAt);
    if (Number.isFinite(parsed) && parsed > now) {
        return new Date(now).toISOString();
    }

    return readAt;
}

function normalizeReadsMap(
    reads: Record<string, string>,
    now = Date.now(),
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(reads).map(([messageId, readAt]) => [
            messageId,
            normalizeIsoTimestamp(clampReadAt(readAt, now)),
        ]),
    );
}

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

    const entries = Object.entries(value);
    if (entries.length > MAX_READS_ENTRIES) {
        return false;
    }

    return entries.every(
        ([messageId, readAt]) =>
            typeof messageId === "string" &&
            messageId.length > 0 &&
            typeof readAt === "string" &&
            readAt.length > 0 &&
            isValidIsoTimestamp(readAt),
    );
}

export async function GET(request: Request) {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const contextId = searchParams.get("contextId");
        const contextKind = searchParams.get("contextKind");

        if (!contextId || !isValidContextType(contextKind)) {
            return NextResponse.json(
                { error: "contextId and valid contextKind are required" },
                { status: 400 },
            );
        }

        const document = await getThreadReads({
            contextId,
            contextType: contextKind,
            userId: user.$id,
        });

        return NextResponse.json({
            contextId,
            contextKind,
            reads: document?.reads ?? {},
        });
    } catch (error) {
        logger.error("Error in GET /api/thread-reads", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to load thread reads" },
            { status: 500 },
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        let body: PatchBody;
        try {
            const parsedBody = (await request.json()) as unknown;
            if (
                !parsedBody ||
                typeof parsedBody !== "object" ||
                Array.isArray(parsedBody)
            ) {
                return NextResponse.json(
                    { error: "Request body must be a non-null JSON object" },
                    { status: 400 },
                );
            }

            body = parsedBody as PatchBody;
        } catch {
            return NextResponse.json(
                { error: "Request body must be valid JSON" },
                { status: 400 },
            );
        }

        if (!body.contextId || !isValidContextType(body.contextKind)) {
            return NextResponse.json(
                { error: "contextId and valid contextKind are required" },
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

        const normalizedReads = normalizeReadsMap(body.reads);

        const updated = await upsertThreadReads({
            contextId: body.contextId,
            contextType: body.contextKind,
            reads: normalizedReads,
            userId: user.$id,
        });

        return NextResponse.json({
            contextId: body.contextId,
            contextKind: body.contextKind,
            reads: normalizeReadsMap(updated.reads),
        });
    } catch (error) {
        logger.error("Error in PATCH /api/thread-reads", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update thread reads" },
            { status: 500 },
        );
    }
}
