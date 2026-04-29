import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
    dispatchScheduledAnnouncements,
    getAnnouncementRuntimeSettings,
} from "@/lib/appwrite-announcements";
import { logger } from "@/lib/newrelic-utils";

function parseLimit(rawLimit: string | null): number {
    if (!rawLimit) {
        return 25;
    }

    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isNaN(parsed)) {
        return 25;
    }

    return Math.max(1, Math.min(parsed, 100));
}

export async function POST(request: Request) {
    const { dispatcherSecret, systemSenderUserId } =
        getAnnouncementRuntimeSettings();

    if (!dispatcherSecret) {
        return NextResponse.json(
            {
                success: false,
                error: "Announcements dispatcher secret is not configured",
            },
            { status: 503 },
        );
    }

    if (!systemSenderUserId) {
        return NextResponse.json(
            {
                success: false,
                error: "System sender user ID is not configured",
            },
            { status: 503 },
        );
    }

    const providedSecret = request.headers.get(
        "x-announcements-dispatcher-secret",
    );
    if (!providedSecret) {
        return NextResponse.json(
            {
                success: false,
                error: "Unauthorized",
            },
            { status: 401 },
        );
    }

    const providedSecretBuffer = Buffer.from(providedSecret);
    const dispatcherSecretBuffer = Buffer.from(dispatcherSecret);
    if (providedSecretBuffer.length !== dispatcherSecretBuffer.length) {
        return NextResponse.json(
            {
                success: false,
                error: "Unauthorized",
            },
            { status: 401 },
        );
    }

    if (!timingSafeEqual(providedSecretBuffer, dispatcherSecretBuffer)) {
        return NextResponse.json(
            {
                success: false,
                error: "Unauthorized",
            },
            { status: 401 },
        );
    }

    const requestUrl = new URL(request.url);
    const limit = parseLimit(requestUrl.searchParams.get("limit"));
    try {
        const result = await dispatchScheduledAnnouncements(limit);

        return NextResponse.json({
            success: true,
            dispatched: result.dueCount,
            announcementIds: result.announcementIds,
        });
    } catch (error) {
        logger.error("Failed to dispatch announcements from API route", {
            error: error instanceof Error ? error.message : String(error),
            limit,
        });

        return NextResponse.json(
            {
                success: false,
                error: "Failed to dispatch announcements",
            },
            { status: 500 },
        );
    }
}
