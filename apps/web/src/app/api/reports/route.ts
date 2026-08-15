import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import {
    createReport,
    countRecentReportsByUser,
    DUPLICATE_REPORT_ERROR_MESSAGE,
    DuplicateReportError,
} from "@/lib/appwrite-reports";
import { logger } from "@/lib/newrelic-utils";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MIN_JUSTIFICATION_LENGTH = 10;
const MAX_JUSTIFICATION_LENGTH = 2000;

function isDuplicateReportError(error: unknown): boolean {
    return error instanceof DuplicateReportError;
}

export async function POST(request: Request) {
    try {
        const user = await requireAuth();
        const reporterId = user.$id;

        const body = (await request.json()) as {
            targetUserId?: string;
            justification?: string;
        };
        const { targetUserId, justification } = body;

        if (!targetUserId || typeof targetUserId !== "string") {
            return NextResponse.json(
                { error: "Invalid target user ID" },
                { status: 400 },
            );
        }

        if (!justification || typeof justification !== "string") {
            return NextResponse.json(
                { error: "Justification is required" },
                { status: 400 },
            );
        }

        const trimmed = justification.trim();
        if (trimmed.length < MIN_JUSTIFICATION_LENGTH) {
            return NextResponse.json(
                {
                    error: `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters.`,
                },
                { status: 400 },
            );
        }
        if (trimmed.length > MAX_JUSTIFICATION_LENGTH) {
            return NextResponse.json(
                {
                    error: `Justification must be at most ${MAX_JUSTIFICATION_LENGTH} characters.`,
                },
                { status: 400 },
            );
        }

        const normalizedUserId = targetUserId.trim();
        if (!normalizedUserId) {
            return NextResponse.json(
                { error: "Invalid user to report." },
                { status: 400 },
            );
        }

        if (reporterId === normalizedUserId) {
            return NextResponse.json(
                { error: "Cannot report yourself." },
                { status: 400 },
            );
        }

        const recentCount = await countRecentReportsByUser(
            reporterId,
            RATE_LIMIT_WINDOW_MS,
        );
        if (recentCount >= RATE_LIMIT_MAX) {
            return NextResponse.json(
                {
                    error: "You have submitted too many reports recently. Please try again later.",
                },
                { status: 429 },
            );
        }

        const report = await createReport({
            reporterId,
            reportedUserId: normalizedUserId,
            justification: trimmed,
        });

        return NextResponse.json({ success: true, report });
    } catch (error) {
        if (isDuplicateReportError(error)) {
            return NextResponse.json(
                { error: DUPLICATE_REPORT_ERROR_MESSAGE },
                { status: 409 },
            );
        }

        logger.error("Failed to submit report", {
            error:
                error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
            { error: "Failed to submit report." },
            { status: 500 },
        );
    }
}
