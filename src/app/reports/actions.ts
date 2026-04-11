"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-server";
import {
    createReport,
    hasExistingPendingReport,
    type Report,
} from "@/lib/appwrite-reports";

// Rate limiting: max reports per user per hour
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const reportLog: Record<string, number[]> = {};

function checkReportRate(userId: string) {
    const now = Date.now();
    const list = reportLog[userId] || [];
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const pruned = list.filter((t) => t >= cutoff);
    if (pruned.length >= RATE_LIMIT_MAX) {
        throw new Error(
            "You have submitted too many reports recently. Please try again later.",
        );
    }
    pruned.push(now);
    reportLog[userId] = pruned;
}

const MIN_JUSTIFICATION_LENGTH = 10;
const MAX_JUSTIFICATION_LENGTH = 2000;

export type SubmitReportResult =
    | { success: true; report: Report }
    | { success: false; error: string };

export async function submitReportAction(
    reportedUserId: string,
    justification: string,
): Promise<SubmitReportResult> {
    try {
        const user = await requireAuth();
        const reporterId = user.$id;

        if (!reportedUserId || typeof reportedUserId !== "string") {
            return { success: false, error: "Invalid user to report." };
        }

        if (reporterId === reportedUserId) {
            return {
                success: false,
                error: "You cannot report yourself.",
            };
        }

        const trimmed = justification?.trim() ?? "";
        if (trimmed.length < MIN_JUSTIFICATION_LENGTH) {
            return {
                success: false,
                error: `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters.`,
            };
        }
        if (trimmed.length > MAX_JUSTIFICATION_LENGTH) {
            return {
                success: false,
                error: `Justification must be at most ${MAX_JUSTIFICATION_LENGTH} characters.`,
            };
        }

        checkReportRate(reporterId);

        const existing = await hasExistingPendingReport(
            reporterId,
            reportedUserId,
        );
        if (existing) {
            return {
                success: false,
                error: "You already have a pending report for this user.",
            };
        }

        const report = await createReport({
            reporterId,
            reportedUserId,
            justification: trimmed,
        });

        revalidatePath("/admin/reports");
        return { success: true, report };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to submit report.";
        return { success: false, error: message };
    }
}

export type CanReportResult =
    | { canReport: true }
    | { canReport: false; reason: string };

export async function getCanReportAction(
    reportedUserId: string,
): Promise<CanReportResult> {
    try {
        const user = await requireAuth();
        const reporterId = user.$id;

        if (reporterId === reportedUserId) {
            return { canReport: false, reason: "Cannot report yourself." };
        }

        const existing = await hasExistingPendingReport(
            reporterId,
            reportedUserId,
        );
        if (existing) {
            return {
                canReport: false,
                reason: "You already have a pending report for this user.",
            };
        }

        return { canReport: true };
    } catch {
        return { canReport: false, reason: "Unable to check report status." };
    }
}
