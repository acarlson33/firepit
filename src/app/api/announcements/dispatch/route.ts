import { NextResponse } from "next/server";

import {
    dispatchScheduledAnnouncements,
    getAnnouncementRuntimeSettings,
    isInstanceAnnouncementsEnabled,
} from "@/lib/appwrite-announcements";

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
    if (!(await isInstanceAnnouncementsEnabled())) {
        return NextResponse.json(
            {
                success: false,
                error: "Instance announcements are disabled",
            },
            { status: 404 },
        );
    }

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

    const providedSecret = request.headers.get("x-announcements-dispatcher-secret");
    if (providedSecret !== dispatcherSecret) {
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
    const result = await dispatchScheduledAnnouncements(limit);

    return NextResponse.json({
        success: true,
        dispatched: result.dueCount,
        announcementIds: result.announcementIds,
    });
}
