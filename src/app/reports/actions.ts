"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-server";
import {
    createReport,
    countRecentReportsByUser,
    type Report,
} from "@/lib/appwrite-reports";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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

        const recentCount = await countRecentReportsByUser(
            reporterId,
            RATE_LIMIT_WINDOW_MS,
        );
        if (recentCount >= RATE_LIMIT_MAX) {
            return {
                success: false,
                error: "You have submitted too many reports recently. Please try again later.",
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
        if (message.includes("duplicate") || message.includes("already")) {
            return {
                success: false,
                error: "You already have a pending report for this user.",
            };
        }
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

        return { canReport: true };
    } catch {
        return { canReport: false, reason: "Unable to check report status." };
    }
}
