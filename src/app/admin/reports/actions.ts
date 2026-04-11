"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-server";
import { resolveReport } from "@/lib/appwrite-reports";
import { recordAudit } from "@/lib/appwrite-audit";
import { logger, recordError } from "@/lib/newrelic-utils";

type ReportActionStatus = "resolved" | "dismissed";

function normalizeReportId(reportId: string) {
    const nextReportId = reportId.trim();
    if (!nextReportId) {
        throw new Error("Missing report ID");
    }

    return nextReportId;
}

function normalizeResolutionNotes(notes: string | undefined) {
    if (typeof notes !== "string") {
        return undefined;
    }

    const normalizedNotes = notes.trim();
    return normalizedNotes.length > 0 ? normalizedNotes : undefined;
}

function parseReportForm(formData: FormData) {
    const reportIdRaw = formData.get("reportId");
    const notesRaw = formData.get("resolutionNotes");

    if (typeof reportIdRaw !== "string") {
        throw new Error("Missing report ID");
    }

    const reportId = normalizeReportId(reportIdRaw);

    const notes =
        typeof notesRaw === "string"
            ? normalizeResolutionNotes(notesRaw)
            : undefined;

    return { notes, reportId };
}

async function handleReportAction(
    reportId: string,
    resolutionNotes: string | undefined,
    status: ReportActionStatus,
    auditEventName: "report_resolved" | "report_dismissed",
) {
    const { user } = await requireAdmin();
    const userId = user.$id;

    await resolveReport(reportId, userId, status, resolutionNotes);

    try {
        await recordAudit(auditEventName, reportId, userId, {
            details: resolutionNotes
                ? `Report ${status}: ${resolutionNotes}`
                : `Report ${status}`,
        });
    } catch (error) {
        logger.error("Failed to record report audit event", {
            auditEventName,
            error: error instanceof Error ? error.message : String(error),
            reportId,
            userId,
        });

        recordError(error instanceof Error ? error : new Error(String(error)), {
            auditEventName,
            context: "admin report audit event",
            reportId,
            userId,
        });
    }

    revalidatePath("/admin/reports");
}

export async function actionResolveReport(
    reportId: string,
    resolutionNotes?: string,
) {
    const normalizedReportId = normalizeReportId(reportId);
    await handleReportAction(
        normalizedReportId,
        normalizeResolutionNotes(resolutionNotes),
        "resolved",
        "report_resolved",
    );
}

export async function actionDismissReport(
    reportId: string,
    resolutionNotes?: string,
) {
    const normalizedReportId = normalizeReportId(reportId);
    await handleReportAction(
        normalizedReportId,
        normalizeResolutionNotes(resolutionNotes),
        "dismissed",
        "report_dismissed",
    );
}

export async function actionResolveReportBound(formData: FormData) {
    const { notes, reportId } = parseReportForm(formData);
    await actionResolveReport(reportId, notes);
}

export async function actionDismissReportBound(formData: FormData) {
    const { notes, reportId } = parseReportForm(formData);
    await actionDismissReport(reportId, notes);
}
