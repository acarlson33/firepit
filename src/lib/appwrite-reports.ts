import { ID, Query } from "node-appwrite";

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

export type CreateReportInput = {
    reporterId: string;
    reportedUserId: string;
    justification: string;
};

export type ListReportsOpts = {
    limit?: number;
    cursorAfter?: string;
    status?: ReportStatus;
    reporterId?: string;
    reportedUserId?: string;
};

const DEFAULT_LIST_LIMIT = 50;

function parseReport(doc: Record<string, unknown>): Report {
    return {
        $id: String(doc.$id),
        reporterId: String(doc.reporterId),
        reportedUserId: String(doc.reportedUserId),
        justification: String(doc.justification),
        status: String(doc.status) as ReportStatus,
        resolvedBy:
            typeof doc.resolvedBy === "string" ? doc.resolvedBy : undefined,
        resolutionNotes:
            typeof doc.resolutionNotes === "string"
                ? doc.resolutionNotes
                : undefined,
        $createdAt: String(doc.$createdAt),
    };
}

export async function createReport(input: CreateReportInput): Promise<Report> {
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

    return parseReport(doc as unknown as Record<string, unknown>);
}

export async function listReports(
    opts: ListReportsOpts = {},
): Promise<{ items: Report[]; nextCursor: string | null }> {
    if (!REPORTS_COLLECTION_ID) {
        return { items: [], nextCursor: null };
    }

    const { databases } = getServerClient();
    const limit = opts.limit || DEFAULT_LIST_LIMIT;
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

    const rawDocuments =
        (res as unknown as { documents?: unknown[] }).documents || [];
    const items = rawDocuments.map((d) =>
        parseReport(d as Record<string, unknown>),
    );
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
    const { databases } = getServerClient();

    await databases.updateDocument(
        DATABASE_ID,
        REPORTS_COLLECTION_ID,
        reportId,
        {
            status,
            resolvedBy: adminId,
            resolutionNotes: resolutionNotes || null,
        },
    );
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

export async function hasExistingPendingReport(
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
