import { NextResponse } from "next/server";
import {
    listReports,
    resolveReport,
    clampLimit,
    type ReportStatus,
} from "@/lib/appwrite-reports";
import { getProfilesByUserIds } from "@/lib/appwrite-profiles";
import { recordAudit } from "@/lib/appwrite-audit";
import { logger, recordError } from "@/lib/newrelic-utils";
import { requireModerator } from "@/lib/auth-server";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";

export async function GET(request: Request) {
    try {
        await requireModerator();

        const { searchParams } = new URL(request.url);
        const limit = clampLimit(searchParams.get("limit"));
        const cursor = searchParams.get("cursor")?.trim() || undefined;
        const rawStatus = searchParams.get("status")?.trim();
        const status: ReportStatus | undefined =
            rawStatus === "pending" ||
            rawStatus === "resolved" ||
            rawStatus === "dismissed"
                ? rawStatus
                : undefined;

        const { items, nextCursor } = await listReports({
            limit,
            cursorAfter: cursor ?? undefined,
            status,
        });

        const userIds = new Set<string>();
        for (const item of items) {
            if (item.reporterId) userIds.add(item.reporterId);
            if (item.reportedUserId) userIds.add(item.reportedUserId);
            if (item.resolvedBy) userIds.add(item.resolvedBy);
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
            const reporterProfile = item.reporterId
                ? profiles.get(item.reporterId)
                : null;
            const reportedProfile = item.reportedUserId
                ? profiles.get(item.reportedUserId)
                : null;
            const resolverProfile = item.resolvedBy
                ? profiles.get(item.resolvedBy)
                : null;
            return {
                $id: item.$id,
                reporterId: item.reporterId,
                reporterName:
                    reporterProfile?.displayName ||
                    reporterProfile?.userName,
                reportedUserId: item.reportedUserId,
                reportedUserName:
                    reportedProfile?.displayName ||
                    reportedProfile?.userName,
                justification: item.justification,
                status: item.status,
                resolvedBy: item.resolvedBy,
                resolvedByName:
                    resolverProfile?.displayName ||
                    resolverProfile?.userName,
                resolutionNotes: item.resolutionNotes,
                createdAt: item.$createdAt,
            };
        });

        return NextResponse.json({
            items: enrichedItems,
            nextCursor,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            (error.message === "UNAUTHORIZED" ||
                error.message === "FORBIDDEN")
        ) {
            return NextResponse.json(
                { error: "Forbidden: Moderator access required" },
                { status: 403 },
            );
        }
        logger.error("Error fetching reports", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch reports" },
            { status: 500 },
        );
    }
}

export async function POST(request: Request) {
    try {
        const { user } = await requireModerator();
        const adminId = user.$id;

        const body = (await request.json()) as {
            reportId?: string;
            action?: "resolve" | "dismiss";
            resolutionNotes?: string;
        };

        const { reportId, action, resolutionNotes } = body;
        if (!reportId || typeof reportId !== "string") {
            return NextResponse.json(
                { error: "Missing report ID" },
                { status: 400 },
            );
        }

        if (action !== "resolve" && action !== "dismiss") {
            return NextResponse.json(
                { error: 'Action must be "resolve" or "dismiss"' },
                { status: 400 },
            );
        }

        const normalizedNotes =
            typeof resolutionNotes === "string" && resolutionNotes.trim().length > 0
                ? resolutionNotes.trim()
                : undefined;

        await resolveReport(
            reportId,
            adminId,
            action === "resolve" ? "resolved" : "dismissed",
            normalizedNotes,
        );

        try {
            await recordAudit(
                action === "resolve" ? "report_resolved" : "report_dismissed",
                reportId,
                adminId,
                {
                    details: normalizedNotes
                        ? `Report ${action === "resolve" ? "resolved" : "dismissed"}: ${normalizedNotes}`
                        : `Report ${action === "resolve" ? "resolved" : "dismissed"}`,
                },
            );
        } catch (auditError) {
            logger.error("Failed to record report audit event", {
                action,
                error:
                    auditError instanceof Error
                        ? auditError.message
                        : String(auditError),
                reportId,
                adminId,
            });
            recordError(
                auditError instanceof Error
                    ? auditError
                    : new Error(String(auditError)),
                {
                    action,
                    context: "admin report audit event",
                    reportId,
                    adminId,
                },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (
            error instanceof Error &&
            (error.message === "UNAUTHORIZED" ||
                error.message === "FORBIDDEN")
        ) {
            return NextResponse.json(
                { error: "Forbidden: Moderator access required" },
                { status: 403 },
            );
        }
        if (isDocumentNotFoundError(error)) {
            return NextResponse.json(
                { error: "Report not found" },
                { status: 404 },
            );
        }
        logger.error("Failed to resolve report", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to resolve report" },
            { status: 500 },
        );
    }
}
