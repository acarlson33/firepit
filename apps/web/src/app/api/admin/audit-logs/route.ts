import { NextResponse } from "next/server";
import { adminListAuditEvents } from "@/lib/appwrite-audit";
import { clampLimit } from "@/lib/appwrite-reports";
import {
    getProfilesByUserIds,
} from "@/lib/appwrite-profiles";
import { logger } from "@/lib/newrelic-utils";
import { requireModerator } from "@/lib/auth-server";

export async function GET(request: Request) {
    try {
        await requireModerator();

        const { searchParams } = new URL(request.url);
        const readParam = (key: string): string | undefined =>
            searchParams.get(key)?.trim() || undefined;
        const limit = clampLimit(searchParams.get("limit"));
        const cursor = readParam("cursor");
        const action = readParam("action");
        const actorId = readParam("actorId");
        const targetId = readParam("targetId");

        const { items, nextCursor } = await adminListAuditEvents({
            limit,
            cursorAfter: cursor,
            action,
            actorId,
            targetId,
        });

        // Enrich with profile data
        const userIds = new Set<string>();
        for (const item of items) {
            if (item.actorId) userIds.add(item.actorId);
            if (item.targetId) userIds.add(item.targetId);
        }

        const profiles = new Map<
            string,
            { displayName?: string; userName?: string }
        >();
        if (userIds.size > 0) {
            const profilesResult = await getProfilesByUserIds(
                Array.from(userIds),
            );
            for (const profile of profilesResult.values()) {
                profiles.set(profile.userId, {
                    displayName: profile.displayName,
                    userName: profile.userName,
                });
            }
        }

        const enrichedItems = items.map((item) => {
            const actorProfile = item.actorId
                ? profiles.get(item.actorId)
                : null;
            const targetProfile = item.targetId
                ? profiles.get(item.targetId)
                : null;
            return {
                $id: item.$id,
                action: item.action,
                actorId: item.actorId,
                actorName:
                    actorProfile?.displayName || actorProfile?.userName,
                targetId: item.targetId,
                targetName:
                    targetProfile?.displayName || targetProfile?.userName,
                timestamp: item.$createdAt,
                meta: item.meta,
            };
        });

        return NextResponse.json({
            items: enrichedItems,
            nextCursor,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "UNAUTHORIZED") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }
        if (error instanceof Error && error.message === "FORBIDDEN") {
            return NextResponse.json(
                { error: "Forbidden: Moderator access required" },
                { status: 403 },
            );
        }
        logger.error("Error fetching admin audit logs", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch audit logs" },
            { status: 500 },
        );
    }
}
