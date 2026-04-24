import { Query } from "appwrite";
// Lightweight local logger to avoid pulling server-only telemetry into client bundles
const logger = {
    warn: (msg: string, attrs?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== "production") {
            console.warn("[WARN]", msg, attrs || "");
        }
    },
    info: (msg: string, attrs?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== "production") {
            console.info("[INFO]", msg, attrs || "");
        }
    },
    error: (msg: string, attrs?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== "production") {
            console.error("[ERROR]", msg, attrs || "");
        }
    },
};

type ListDocumentsResponseLike = {
    documents?: Array<Record<string, unknown>>;
    total?: number;
};

type Databases = {
    listDocuments: (
        databaseId: string,
        collectionId: string,
        queries?: string[],
    ) => Promise<ListDocumentsResponseLike>;
};

export async function listPages(params: {
    databases: Databases;
    databaseId: string;
    collectionId: string;
    baseQueries?: string[];
    pageSize: number;
    warningContext?: string;
    maxDocs?: number;
    maxPages?: number;
}) {
    const {
        databases,
        databaseId,
        collectionId,
        baseQueries = [],
        pageSize,
        warningContext = "",
        maxDocs,
        maxPages,
    } = params;

    if (typeof maxPages === "number" && maxPages <= 0) {
        return { documents: [] as Array<Record<string, unknown>>, truncated: false };
    }

    const documents: Array<Record<string, unknown>> = [];
    const queryWithPagination = Query as typeof Query & {
        cursorAfter?: (cursor: string) => string;
        orderAsc?: (field: string) => string;
    };

    const supportsCursorAfter = typeof queryWithPagination.cursorAfter === "function";
    const supportsOrderAsc = typeof queryWithPagination.orderAsc === "function";
    const orderAsc = supportsOrderAsc ? queryWithPagination.orderAsc!.bind(Query) : undefined;
    const cursorAfterFn = supportsCursorAfter ? queryWithPagination.cursorAfter!.bind(Query) : undefined;

    let cursorAfter: string | null = null;
    let warnedExceededPageSize = false;
    let truncated = false;
    let pageCount = 0;

    if (!supportsCursorAfter || !supportsOrderAsc) {
        logger.warn("Pagination helpers unavailable; results may be truncated", {
            context: warningContext,
            pageSize,
            hasCursorAfter: supportsCursorAfter,
            hasOrderAsc: supportsOrderAsc,
        });
    }

    let hasMore = true;
    while (hasMore) {
        pageCount += 1;
        const queries: string[] = [
            ...baseQueries,
            ...(orderAsc ? [orderAsc("$id")] : []),
            Query.limit(pageSize),
            ...(cursorAfter && cursorAfterFn ? [cursorAfterFn(cursorAfter)] : []),
        ];

        const response = await databases.listDocuments(
            databaseId,
            collectionId,
            queries,
        );

        if (!warnedExceededPageSize && typeof response.total === "number" && response.total > pageSize * 10) {
            logger.warn("Query has unusually high volume", {
                context: warningContext,
                fetched: response.documents?.length ?? 0,
                pageSize,
                total: response.total,
            });
            warnedExceededPageSize = true;
        }

        const pageDocs = response.documents ?? [];
        for (const document of pageDocs) {
            documents.push(document as Record<string, unknown>);
            if (maxDocs && documents.length > maxDocs) {
                throw new Error(`Pagination exceeded maxDocs (${maxDocs}) for collection ${collectionId}`);
            }
        }

        const lastDocument = pageDocs.at(-1);
        cursorAfter = lastDocument && typeof lastDocument.$id === "string" ? lastDocument.$id : null;

        const pageFull = pageDocs.length >= pageSize && cursorAfter;
        if (!pageFull) {
            hasMore = false;
            break;
        }

        if (typeof maxPages === "number" && pageCount >= maxPages) {
            truncated = true;
            break;
        }

        if (!supportsCursorAfter || !supportsOrderAsc) {
            truncated = true;
            break;
        }
    }

    return {
        documents,
        truncated,
    };
}
