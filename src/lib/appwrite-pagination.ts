import { Query } from "node-appwrite";
import { logger } from "@/lib/newrelic-utils";

type Databases = ReturnType<() => any>;

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
    const { databases, databaseId, collectionId, baseQueries = [], pageSize, warningContext = "", maxDocs, maxPages } = params;

    const documents: Array<Record<string, unknown>> = [];
    const queryWithPagination = Query as typeof Query & {
        cursorAfter?: (cursor: string) => string;
        orderAsc?: (field: string) => string;
    };

    const supportsCursorAfter = typeof queryWithPagination.cursorAfter === "function";
    const supportsOrderAsc = typeof queryWithPagination.orderAsc === "function";
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

    while (true) {
        pageCount += 1;
        const queries: string[] = [
            ...baseQueries,
            ...(supportsOrderAsc ? [queryWithPagination.orderAsc!("$id")] : []),
            Query.limit(pageSize),
            ...(cursorAfter && supportsCursorAfter ? [queryWithPagination.cursorAfter!(cursorAfter)] : []),
        ];

        const response = await databases.listDocuments(
            databaseId,
            collectionId,
            queries,
        );

        if (!warnedExceededPageSize && typeof response.total === "number" && response.total > pageSize * 10) {
            logger.warn("Query has unusually high volume", {
                context: warningContext,
                fetched: response.documents.length,
                pageSize,
                total: response.total,
            });
            warnedExceededPageSize = true;
        }

        for (const document of response.documents) {
            documents.push(document as Record<string, unknown>);
            if (maxDocs && documents.length > maxDocs) {
                throw new Error(`Pagination exceeded maxDocs (${maxDocs}) for collection ${collectionId}`);
            }
        }

        const lastDocument = response.documents.at(-1);
        cursorAfter = lastDocument && typeof lastDocument.$id === "string" ? lastDocument.$id : null;

        const pageFull = response.documents.length >= pageSize && Boolean(cursorAfter);
        if (!pageFull) {
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
