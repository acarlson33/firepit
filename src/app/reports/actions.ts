"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-server";
import {
    createReport,
    countRecentReportsByUser,
    hasExistingPendingReport,
    DUPLICATE_REPORT_ERROR_MESSAGE,
    DuplicateReportError,
    type Report,
} from "@/lib/appwrite-reports";
import { logger } from "@/lib/newrelic-utils";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const MIN_JUSTIFICATION_LENGTH = 10;
const MAX_JUSTIFICATION_LENGTH = 2000;

function isDuplicateReportError(error: unknown): boolean {
    return error instanceof DuplicateReportError;
}

function validateReportTarget(
    reporterId: string,
    reportedUserId: string,
    selfReportError = "You cannot report yourself.",
):
    | { success: true; normalizedReportedUserId: string }
    | { success: false; error: string } {
    const normalizedReportedUserId = reportedUserId.trim();

    if (!normalizedReportedUserId) {
        return { success: false, error: "Invalid user to report." };
    }

    if (reporterId === normalizedReportedUserId) {
        return {
            success: false,
            error: selfReportError,
        };
    }

    return {
        success: true,
        normalizedReportedUserId,
    };
}

function validateJustification(justification: string): string | null {
    const trimmed = justification.trim();

    if (trimmed.length < MIN_JUSTIFICATION_LENGTH) {
        return `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters.`;
    }
    if (trimmed.length > MAX_JUSTIFICATION_LENGTH) {
        return `Justification must be at most ${MAX_JUSTIFICATION_LENGTH} characters.`;
    }

    return null;
}

type SubmitReportResult =
    | { success: true; report: Report }
    | { success: false; error: string };

export async function submitReportAction(
    reportedUserId: string,
    justification: string,
): Promise<SubmitReportResult> {
    try {
        const user = await requireAuth();
        const reporterId = user.$id;

        const targetValidation = validateReportTarget(
            reporterId,
            reportedUserId,
            "Cannot report yourself.",
        );
        if (!targetValidation.success) {
            return {
                success: false,
                error: targetValidation.error,
            };
        }

        const justificationError = validateJustification(justification);
        if (justificationError) {
            return {
                success: false,
                error: justificationError,
            };
        }

        const normalizedJustification = justification.trim();

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
            reportedUserId: targetValidation.normalizedReportedUserId,
            justification: normalizedJustification,
        });

        revalidatePath("/admin/reports");
        return { success: true, report };
    } catch (error) {
        if (isDuplicateReportError(error)) {
            return {
                success: false,
                error: DUPLICATE_REPORT_ERROR_MESSAGE,
            };
        }

        logger.error("Failed to submit report", {
            error: error instanceof Error ? error.message : String(error),
            reportedUserHash: createHash("sha256")
                .update(reportedUserId)
                .digest("hex")
                .slice(0, 16),
        });

        return { success: false, error: "Failed to submit report." };
    }
}

type CanReportResult =
    | { canReport: true }
    | { canReport: false; reason: string };

async function getCanReportAction(
    reportedUserId: string,
): Promise<CanReportResult> {
    try {
        const user = await requireAuth();
        const reporterId = user.$id;

        const targetValidation = validateReportTarget(
            reporterId,
            reportedUserId,
        );
        if (!targetValidation.success) {
            return { canReport: false, reason: targetValidation.error };
        }

        const recentCount = await countRecentReportsByUser(
            reporterId,
            RATE_LIMIT_WINDOW_MS,
        );
        if (recentCount >= RATE_LIMIT_MAX) {
            return {
                canReport: false,
                reason: "You have submitted too many reports recently. Please try again later.",
            };
        }

        const hasPendingReport = await hasExistingPendingReport(
            reporterId,
            targetValidation.normalizedReportedUserId,
        );
        if (hasPendingReport) {
            return {
                canReport: false,
                reason: DUPLICATE_REPORT_ERROR_MESSAGE,
            };
        }

        return { canReport: true };
    } catch (error) {
        logger.error("Failed to evaluate report eligibility", {
            error: error instanceof Error ? error.message : String(error),
            reportedUserHash: createHash("sha256")
                .update(reportedUserId)
                .digest("hex")
                .slice(0, 16),
        });
        return { canReport: false, reason: "Unable to check report status." };
    }
}
