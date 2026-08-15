import { NextResponse } from "next/server";

import {
    createAnnouncement,
    listAnnouncements,
    parseLimit,
} from "@/lib/appwrite-announcements";
import type {
    AnnouncementCreateMode,
    AnnouncementPriority,
    AnnouncementStatus,
} from "@/lib/types";
import { AuthError, requireAdmin } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";

const ALLOWED_PRIORITIES: ReadonlySet<AnnouncementPriority> = new Set([
    "normal",
    "urgent",
]);

const ALLOWED_STATUSES: ReadonlySet<AnnouncementStatus> = new Set([
    "archived",
    "dispatching",
    "draft",
    "failed",
    "scheduled",
    "sent",
]);

const ALLOWED_MODES: ReadonlySet<AnnouncementCreateMode> = new Set([
    "draft",
    "schedule",
    "send_now",
]);

interface AnnouncementPayload {
    body?: unknown;
    idempotencyKey?: unknown;
    mode?: unknown;
    priority?: unknown;
    scheduledFor?: unknown;
    title?: unknown;
}

function parseStatuses(rawStatuses: string | null): AnnouncementStatus[] {
    if (!rawStatuses) {
        return [];
    }

    const statuses = rawStatuses
        .split(",")
        .map((status) => status.trim())
        .filter((status): status is AnnouncementStatus =>
            ALLOWED_STATUSES.has(status as AnnouncementStatus),
        );

    return Array.from(new Set(statuses));
}

function parseMode(rawMode: unknown): AnnouncementCreateMode | null {
    if (rawMode === undefined) {
        return "draft";
    }

    if (
        typeof rawMode === "string" &&
        ALLOWED_MODES.has(rawMode as AnnouncementCreateMode)
    ) {
        return rawMode as AnnouncementCreateMode;
    }

    return null;
}

function parsePriority(rawPriority: unknown): AnnouncementPriority | null {
    if (rawPriority === undefined) {
        return "normal";
    }

    if (
        typeof rawPriority === "string" &&
        ALLOWED_PRIORITIES.has(rawPriority as AnnouncementPriority)
    ) {
        return rawPriority as AnnouncementPriority;
    }

    return null;
}

function authErrorResponse(error: AuthError): NextResponse {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ success: false, error: error.message }, { status });
}

export async function GET(request: Request): Promise<NextResponse> {
    try {
        await requireAdmin();

        const url = new URL(request.url);
        const cursorAfter = url.searchParams.get("cursorAfter") ?? undefined;
        const limit = parseLimit(url.searchParams.get("limit"));
        const statuses = parseStatuses(url.searchParams.get("statuses"));

        const result = await listAnnouncements({
            cursorAfter,
            limit,
            statuses,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return authErrorResponse(error);
        }

        logger.error("Failed to list announcements", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            {
                success: false,
                error: "Failed to list announcements",
            },
            { status: 500 },
        );
    }
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const { user } = await requireAdmin();

        let payloadValue: unknown;

        try {
            payloadValue = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON payload" },
                { status: 400 },
            );
        }

        if (
            !payloadValue ||
            typeof payloadValue !== "object" ||
            Array.isArray(payloadValue)
        ) {
            return NextResponse.json(
                { success: false, error: "Invalid JSON payload" },
                { status: 400 },
            );
        }

        const payload = payloadValue as AnnouncementPayload;

        if (
            typeof payload.body !== "string" ||
            payload.body.trim().length === 0
        ) {
            return NextResponse.json(
                { success: false, error: "body must be a non-empty string" },
                { status: 400 },
            );
        }

        if (payload.title !== undefined && typeof payload.title !== "string") {
            return NextResponse.json(
                { success: false, error: "title must be a string" },
                { status: 400 },
            );
        }

        if (
            payload.scheduledFor !== undefined &&
            typeof payload.scheduledFor !== "string"
        ) {
            return NextResponse.json(
                { success: false, error: "scheduledFor must be a string" },
                { status: 400 },
            );
        }

        if (
            payload.idempotencyKey !== undefined &&
            typeof payload.idempotencyKey !== "string"
        ) {
            return NextResponse.json(
                { success: false, error: "idempotencyKey must be a string" },
                { status: 400 },
            );
        }

        const mode = parseMode(payload.mode);
        if (mode === null) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "mode must be one of draft, schedule, or send_now",
                },
                { status: 400 },
            );
        }

        const priority = parsePriority(payload.priority);
        if (priority === null) {
            return NextResponse.json(
                {
                    success: false,
                    error: "priority must be one of normal or urgent",
                },
                { status: 400 },
            );
        }

        const announcement = await createAnnouncement({
            actorId: user.$id,
            body: payload.body,
            idempotencyKey: payload.idempotencyKey,
            mode,
            priority,
            scheduledFor: payload.scheduledFor,
            title: payload.title,
        });

        return NextResponse.json(
            {
                success: true,
                announcement,
            },
            { status: 201 },
        );
    } catch (error) {
        if (error instanceof AuthError) {
            return authErrorResponse(error);
        }

        if (error instanceof Error) {
            logger.error("Failed to create announcement", {
                error: error.message,
            });
        } else {
            logger.error("Failed to create announcement", {
                error: String(error),
            });
        }

        return NextResponse.json(
            { success: false, error: "Failed to create announcement" },
            { status: 500 },
        );
    }
}
