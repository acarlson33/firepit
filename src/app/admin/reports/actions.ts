"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-server";
import { resolveReport } from "@/lib/appwrite-reports";
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

    await resolveReport(reportId, userId, "dismissed", resolutionNotes);
    await recordAudit("report_dismissed", reportId, userId, {
        details: resolutionNotes
            ? `Report dismissed: ${resolutionNotes}`
            : "Report dismissed",
    });

    revalidatePath("/admin/reports");
}

export async function actionResolveReportBound(formData: FormData) {
    const reportId = formData.get("reportId") as string;
    const notes = formData.get("resolutionNotes") as string;
    if (!reportId) {
        throw new Error("Missing report ID");
    }
    await actionResolveReport(reportId, notes || undefined);
}

export async function actionDismissReportBound(formData: FormData) {
    const reportId = formData.get("reportId") as string;
    const notes = formData.get("resolutionNotes") as string;
    if (!reportId) {
        throw new Error("Missing report ID");
    }
    await actionDismissReport(reportId, notes || undefined);
}
