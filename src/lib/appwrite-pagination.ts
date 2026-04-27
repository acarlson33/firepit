import { Query } from "appwrite";

export type PaginationLogger = {
    warn: (msg: string, attrs?: Record<string, unknown>) => void;
    info: (msg: string, attrs?: Record<string, unknown>) => void;
    error: (msg: string, attrs?: Record<string, unknown>) => void;
};

const defaultLogger: PaginationLogger = {
    warn: (_msg, _attrs) => {},
    info: (_msg, _attrs) => {},
    error: (_msg, _attrs) => {},
};

type ListDocumentsResponseLike = {
    documents?: Array<Record<string, unknown>>;
    total?: number;
};

type Databases = {
    listDocuments: {
        (
            databaseId: string,
            collectionId: string,
            queries?: string[],
        ): Promise<ListDocumentsResponseLike>;
        (args: {
            databaseId: string;
            collectionId: string;
            queries?: string[];
        }): Promise<ListDocumentsResponseLike>;
    };
};

function shouldRetryWithPositionalCall(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    const isTypeError = error.name === "TypeError";

    return (
        isTypeError ||
        message.includes("invalid argument") ||
        message.includes("invalid arguments") ||
        message.includes("unexpected argument")
    );
}

async function callListDocuments(
    databases: Databases,
    databaseId: string,
    collectionId: string,
    queries: string[],
): Promise<ListDocumentsResponseLike> {
    const listDocuments = databases.listDocuments;

    try {
        return await listDocuments(databaseId, collectionId, queries);
    } catch (error) {
        if (!shouldRetryWithPositionalCall(error)) {
            throw error;
        }

        return listDocuments({
            databaseId,
            collectionId,
            queries,
        });
    }
}

export type ListPagesResult = {
    documents: Array<Record<string, unknown>>;
    truncated: boolean;
};

/**
 * Lists documents across pages using cursor pagination when available.
 * - `logger` controls warning/error visibility; defaults to a no-op logger.
 * - `highVolumeMultiplier` controls when high-volume warnings fire: `total > pageSize * highVolumeMultiplier`.
 */
export async function listPages(params: {
    databases: Databases;
    databaseId: string;
    collectionId: string;
    baseQueries?: string[];
    pageSize: number;
    warningContext?: string;
    maxDocs?: number;
    maxPages?: number;
    logger?: PaginationLogger;
    highVolumeMultiplier?: number;
}): Promise<ListPagesResult> {
    const {
        databases,
        databaseId,
        collectionId,
        baseQueries = [],
        pageSize,
        warningContext = "",
        maxDocs,
        maxPages,
        logger = defaultLogger,
        highVolumeMultiplier = 10,
    } = params;

    const warningThreshold = Math.max(1, Math.floor(highVolumeMultiplier));

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
    const orderAsc = supportsOrderAsc
        ? queryWithPagination.orderAsc.bind(Query)
        : undefined;
    const cursorAfterFn = supportsCursorAfter
        ? queryWithPagination.cursorAfter.bind(Query)
        : undefined;

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

        const response = await callListDocuments(
            databases,
            databaseId,
            collectionId,
            queries,
        );

        if (!warnedExceededPageSize && typeof response.total === "number" && response.total > pageSize * warningThreshold) {
            logger.warn("Query has unusually high volume", {
                context: warningContext,
                fetched: response.documents?.length ?? 0,
                pageSize,
                total: response.total,
                warningThreshold,
            });
            warnedExceededPageSize = true;
        }

        const pageDocs = response.documents ?? [];
        for (const document of pageDocs) {
            if (maxDocs && documents.length >= maxDocs) {
                throw new Error(`Pagination exceeded maxDocs (${maxDocs}) for collection ${collectionId}`);
            }
            documents.push(document as Record<string, unknown>);
        }

        const lastDocument = pageDocs.at(-1);
        cursorAfter = lastDocument && typeof lastDocument.$id === "string" ? lastDocument.$id : null;

        const pageFull = pageDocs.length >= pageSize && cursorAfter;
        if (!pageFull) {
            hasMore = false;
        }

        if (
            typeof maxPages === "number" &&
            pageCount >= maxPages &&
            Boolean(pageFull || hasMore)
        ) {
            truncated = true;
            break;
        }

        if (!supportsCursorAfter || !supportsOrderAsc) {
            if (pageFull) {
                truncated = true;
            } else {
                hasMore = false;
            }
            break;
        }
    }

    return {
        documents,
        truncated,
    };
}
