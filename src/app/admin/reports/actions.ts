"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-server";
import { getReportById, resolveReport } from "@/lib/appwrite-reports";
import { recordAudit } from "@/lib/appwrite-audit";

export async function actionResolveReport(
    reportId: string,
    resolutionNotes?: string,
) {
    const { user } = await requireAdmin();
    const userId = user.$id;

    if (!reportId) {
        throw new Error("Missing report ID");
    }

    const report = await getReportById(reportId);
    if (report.status !== "pending") {
        throw new Error("Report has already been processed");
    }

    await resolveReport(reportId, userId, "resolved", resolutionNotes);
    await recordAudit("report_resolved", reportId, userId, {
        details: resolutionNotes
            ? `Report resolved: ${resolutionNotes}`
            : "Report resolved",
    });

    revalidatePath("/admin/reports");
}

export async function actionDismissReport(
    reportId: string,
    resolutionNotes?: string,
) {
    const { user } = await requireAdmin();
    const userId = user.$id;

    if (!reportId) {
        throw new Error("Missing report ID");
    }

    const report = await getReportById(reportId);
    if (report.status !== "pending") {
        throw new Error("Report has already been processed");
    }

    await resolveReport(reportId, userId, "dismissed", resolutionNotes);
    await recordAudit("report_dismissed", reportId, userId, {
        details: resolutionNotes
            ? `Report dismissed: ${resolutionNotes}`
            : "Report dismissed",
    });

    revalidatePath("/admin/reports");
}

export async function actionResolveReportBound(formData: FormData) {
    const reportIdRaw = formData.get("reportId");
    const notesRaw = formData.get("resolutionNotes");

    if (typeof reportIdRaw !== "string" || !reportIdRaw.trim()) {
        throw new Error("Missing report ID");
    }

    const notes =
        typeof notesRaw === "string" ? notesRaw.trim() || undefined : undefined;

    await actionResolveReport(reportIdRaw.trim(), notes);
}

export async function actionDismissReportBound(formData: FormData) {
    const reportIdRaw = formData.get("reportId");
    const notesRaw = formData.get("resolutionNotes");

    if (typeof reportIdRaw !== "string" || !reportIdRaw.trim()) {
        throw new Error("Missing report ID");
    }

    const notes =
        typeof notesRaw === "string" ? notesRaw.trim() || undefined : undefined;

    await actionDismissReport(reportIdRaw.trim(), notes);
}
