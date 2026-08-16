import { ID, Query } from "node-appwrite";

import { logger } from "@/lib/newrelic-utils";
import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const REPORTS_COLLECTION_ID = env.collections.reports;

export type ReportStatus = "pending" | "resolved" | "dismissed";

export type Report = {
    $id: string;
    reporterId: string;
    reportedUserId: string;
    justification: string;
    status: ReportStatus;
    resolvedBy?: string;
    resolutionNotes?: string;
    $createdAt: string;
};

type CreateReportInput = {
    reporterId: string;
    reportedUserId: string;
    justification: string;
};

type ListReportsOpts = {
    limit?: number;
    cursorAfter?: string;
    status?: ReportStatus;
    reporterId?: string;
    reportedUserId?: string;
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
export const DUPLICATE_REPORT_ERROR_MESSAGE =
    "You already have a pending report for this user.";

const REPORT_STATUS_VALUES = ["pending", "resolved", "dismissed"] as const;
const REPORT_STATUS_SET = new Set<ReportStatus>(REPORT_STATUS_VALUES);

function isReportStatus(value: unknown): value is ReportStatus {
    return (
        typeof value === "string" &&
        REPORT_STATUS_SET.has(value as ReportStatus)
    );
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object") {
        return {};
    }

    return value as Record<string, unknown>;
}

function getRequiredStringField(
    record: Record<string, unknown>,
    key: string,
): string {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Invalid report document: missing ${key}`);
    }

    return value;
}

export class DuplicateReportError extends Error {
    constructor(message = DUPLICATE_REPORT_ERROR_MESSAGE) {
        super(message);
        this.name = "DuplicateReportError";
    }
}

export function clampLimit(value: unknown): number {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_LIST_LIMIT;
    }
    return Math.min(parsed, MAX_LIST_LIMIT);
}

function parseReport(doc: unknown): Report {
    const parsed = toRecord(doc);
    const parsedStatus = parsed.status;
    const hasValidStatus = isReportStatus(parsedStatus);
    if (!hasValidStatus) {
        logger.warn("Invalid report status, defaulting to pending", {
            reportId: typeof parsed.$id === "string" ? parsed.$id : undefined,
            status: parsedStatus,
        });
    }
    const status: ReportStatus = hasValidStatus ? parsedStatus : "pending";

    return {
        $id: getRequiredStringField(parsed, "$id"),
        reporterId: getRequiredStringField(parsed, "reporterId"),
        reportedUserId: getRequiredStringField(parsed, "reportedUserId"),
        justification: getRequiredStringField(parsed, "justification"),
        status,
        resolvedBy:
            typeof parsed.resolvedBy === "string"
                ? parsed.resolvedBy
                : undefined,
        resolutionNotes:
            typeof parsed.resolutionNotes === "string"
                ? parsed.resolutionNotes
                : undefined,
        $createdAt: getRequiredStringField(parsed, "$createdAt"),
    };
}

export async function createReport(input: CreateReportInput): Promise<Report> {
    // Best-effort duplicate check. Appwrite lacks unique constraints, so
    // concurrent requests may still create duplicates. Callers should handle
    // the "already have a pending report" error gracefully.
    const existing = await hasExistingPendingReport(
        input.reporterId,
        input.reportedUserId,
    );
    if (existing) {
        throw new DuplicateReportError();
    }

    const { databases } = getServerClient();

    const doc = await databases.createDocument(
        DATABASE_ID,
        REPORTS_COLLECTION_ID,
        ID.unique(),
        {
            reporterId: input.reporterId,
            reportedUserId: input.reportedUserId,
            justification: input.justification,
            status: "pending",
        },
        [`read("user:${input.reporterId}")`],
    );

    return parseReport(doc);
}

export async function listReports(
    opts: ListReportsOpts = {},
): Promise<{ items: Report[]; nextCursor: string | null }> {
    if (!REPORTS_COLLECTION_ID) {
        return { items: [], nextCursor: null };
    }

    const { databases } = getServerClient();
    const limit = clampLimit(opts.limit);
    const queries: string[] = [
        Query.limit(limit),
        Query.orderDesc("$createdAt"),
    ];

    if (opts.cursorAfter) {
        queries.push(Query.cursorAfter(opts.cursorAfter));
    }
    if (opts.status) {
        queries.push(Query.equal("status", opts.status));
    }
    if (opts.reporterId) {
        queries.push(Query.equal("reporterId", opts.reporterId));
    }
    if (opts.reportedUserId) {
        queries.push(Query.equal("reportedUserId", opts.reportedUserId));
    }

    const res = await databases.listDocuments(
        DATABASE_ID,
        REPORTS_COLLECTION_ID,
        queries,
    );

    const rawDocuments = Array.isArray(res.documents) ? res.documents : [];
    const items: Report[] = [];
    for (const document of rawDocuments) {
        try {
            items.push(parseReport(document));
        } catch (err) {
            const record = toRecord(document);
            logger.warn("Skipping malformed report row", {
                reportId:
                    typeof record.$id === "string" ? record.$id : undefined,
                error: err instanceof Error ? err.message : String(err),
            });
            // Skip malformed rows so one bad document does not break listing.
        }
    }
    const last = items.at(-1);

    return {
        items,
        nextCursor: items.length === limit && last ? last.$id : null,
    };
}

export async function resolveReport(
    reportId: string,
    adminId: string,
    status: "resolved" | "dismissed",
    resolutionNotes?: string,
): Promise<void> {
    const { tablesDB } = getServerClient();

    // Use a transaction for atomic read-check-and-write.
    // On commit, Appwrite verifies the row hasn't changed externally.
    // If another admin resolved it first, the commit fails with a conflict error.
    const tx = await tablesDB.createTransaction();

    try {
        const existing = await tablesDB.getRow(
            DATABASE_ID,
            REPORTS_COLLECTION_ID,
            reportId,
            [],
            tx.$id,
        );

        const existingRecord = toRecord(existing);
        const existingStatus = isReportStatus(existingRecord.status)
            ? existingRecord.status
            : null;

        if (existingStatus !== "pending") {
            throw new Error("Report has already been processed");
        }

        await tablesDB.updateRow(
            DATABASE_ID,
            REPORTS_COLLECTION_ID,
            reportId,
            {
                status,
                resolvedBy: adminId,
                resolutionNotes: resolutionNotes ?? null,
            },
            undefined,
            tx.$id,
        );

        await tablesDB.updateTransaction(tx.$id, true);
    } catch (err) {
        // Roll back on any failure before propagating.
        try {
            await tablesDB.updateTransaction(tx.$id, undefined, true);
        } catch {
            // Best-effort rollback.
        }
        throw err;
    }
}

export async function getPendingReportCount(): Promise<number> {
    if (!REPORTS_COLLECTION_ID) {
        return 0;
    }

    const { databases } = getServerClient();
    const res = await databases.listDocuments(
        DATABASE_ID,
        REPORTS_COLLECTION_ID,
        [Query.equal("status", "pending"), Query.limit(1)],
    );

    return res.total;
}

async function hasExistingPendingReport(
    reporterId: string,
    reportedUserId: string,
): Promise<boolean> {
    if (!REPORTS_COLLECTION_ID) {
        return false;
    }

    const { databases } = getServerClient();
    const res = await databases.listDocuments(
        DATABASE_ID,
        REPORTS_COLLECTION_ID,
        [
            Query.equal("reporterId", reporterId),
            Query.equal("reportedUserId", reportedUserId),
            Query.equal("status", "pending"),
            Query.limit(1),
        ],
    );

    return res.total > 0;
}

export async function countRecentReportsByUser(
    reporterId: string,
    windowMs: number,
): Promise<number> {
    if (!REPORTS_COLLECTION_ID) {
        return 0;
    }

    const { databases } = getServerClient();
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const res = await databases.listDocuments(
        DATABASE_ID,
        REPORTS_COLLECTION_ID,
        [
            Query.equal("reporterId", reporterId),
            Query.greaterThanEqual("$createdAt", cutoff),
            Query.limit(1),
        ],
    );

    return res.total;
}
