import { ID, Query } from "node-appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import {
    normalizeThreadReads,
    type ThreadReadContextType,
} from "@/lib/thread-read-states";

type ThreadReadDocument = {
    $id: string;
    contextId: string;
    contextType: ThreadReadContextType;
    reads: Record<string, string>;
    userId: string;
};

const THREAD_READ_QUERY_LIMIT = 500;

function isAlreadyExistsConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === 409) {
        return true;
    }

    return typeof candidate.message === "string"
        ? candidate.message.toLowerCase().includes("already exists")
        : false;
}

/**
 * Handles merge thread reads by max.
 *
 * @param {{ existingReads: Record<string, string>; incomingReads: Record<string, string>; }} params - The params value.
 * @returns {{ [x: string]: string; }} The return value.
 */
export function mergeThreadReadsByMax(params: {
    existingReads: Record<string, string>;
    incomingReads: Record<string, string>;
}) {
    const mergedReads = { ...params.existingReads };

    for (const [messageId, incomingTimestamp] of Object.entries(
        params.incomingReads,
    )) {
        const existingTimestamp = mergedReads[messageId];
        if (!existingTimestamp || existingTimestamp < incomingTimestamp) {
            mergedReads[messageId] = incomingTimestamp;
        }
    }

    return mergedReads;
}

/**
 * Handles map thread read document.
 *
 * @param {{ [x: string]: unknown; }} document - The document value.
 * @returns {{ $id: string; contextId: string; contextType: ThreadReadContextType; reads: Record<string, string>; userId: string; }} The return value.
 */
function mapThreadReadDocument(
    document: Record<string, unknown>,
): ThreadReadDocument {
    return {
        $id: String(document.$id),
        contextId: String(document.contextId),
        contextType: String(document.contextType) as ThreadReadContextType,
        reads: normalizeThreadReads(document.reads),
        userId: String(document.userId),
    };
}

function mergeReadsAcrossDocuments(
    documents: ThreadReadDocument[],
    initialReads: Record<string, string> = {},
) {
    return documents.reduce<Record<string, string>>(
        (accumulator, currentDocument) =>
            mergeThreadReadsByMax({
                existingReads: accumulator,
                incomingReads: currentDocument.reads,
            }),
        initialReads,
    );
}

/**
 * Lists thread read documents for one context.
 *
 * @param {{ contextId: string; contextType: ThreadReadContextType; userId: string; }} params - The params value.
 * @returns {Promise<ThreadReadDocument[]>} The return value.
 */
async function listThreadReadDocumentsForContext(params: {
    contextId: string;
    contextType: ThreadReadContextType;
    userId: string;
}) {
    const { databases } = getAdminClient();
    const env = getEnvConfig();
    const documents = await databases.listDocuments(
        env.databaseId,
        env.collections.threadReads,
        [
            Query.equal("userId", params.userId),
            Query.equal("contextType", params.contextType),
            Query.equal("contextId", params.contextId),
            Query.limit(THREAD_READ_QUERY_LIMIT),
        ],
    );

    return documents.documents.map((document) =>
        mapThreadReadDocument(document as unknown as Record<string, unknown>),
    );
}

/**
 * Returns thread reads.
 *
 * @param {{ contextId: string; contextType: ThreadReadContextType; userId: string; }} params - The params value.
 * @returns {Promise<ThreadReadDocument | null>} The return value.
 */
export async function getThreadReads(params: {
    contextId: string;
    contextType: ThreadReadContextType;
    userId: string;
}) {
    const documents = await listThreadReadDocumentsForContext(params);
    const document = documents.at(0);
    if (!document) {
        return null;
    }

    const mergedReads = mergeReadsAcrossDocuments(documents);

    return {
        ...document,
        reads: mergedReads,
    };
}

/**
 * Lists thread reads by context.
 *
 * @param {{ contextIds: string[]; contextType: ThreadReadContextType; userId: string; }} params - The params value.
 * @returns {Promise<any>} The return value.
 */
export async function listThreadReadsByContext(params: {
    contextIds: string[];
    contextType: ThreadReadContextType;
    userId: string;
}) {
    if (params.contextIds.length === 0) {
        return new Map<string, Record<string, string>>();
    }

    const { databases } = getAdminClient();
    const env = getEnvConfig();
    const documents = await databases.listDocuments(
        env.databaseId,
        env.collections.threadReads,
        [
            Query.equal("userId", params.userId),
            Query.equal("contextType", params.contextType),
            Query.equal("contextId", params.contextIds),
            Query.limit(THREAD_READ_QUERY_LIMIT),
        ],
    );

    return documents.documents.reduce<Map<string, Record<string, string>>>(
        (accumulator, document) => {
            const mapped = mapThreadReadDocument(
                document as unknown as Record<string, unknown>,
            );
            const existingReads = accumulator.get(mapped.contextId) ?? {};
            accumulator.set(
                mapped.contextId,
                mergeThreadReadsByMax({
                    existingReads,
                    incomingReads: mapped.reads,
                }),
            );
            return accumulator;
        },
        new Map(),
    );
}

/**
 * Handles upsert thread reads.
 *
 * @param {{ contextId: string; contextType: ThreadReadContextType; reads: Record<string, string>; userId: string; }} params - The params value.
 * @returns {Promise<ThreadReadDocument>} The return value.
 */
export async function upsertThreadReads(params: {
    contextId: string;
    contextType: ThreadReadContextType;
    reads: Record<string, string>;
    userId: string;
}) {
    const { databases } = getAdminClient();
    const env = getEnvConfig();
    const incomingReads = normalizeThreadReads(params.reads);
    const existingDocuments = await listThreadReadDocumentsForContext(params);

    if (existingDocuments.length > 0) {
        const primaryDocument = existingDocuments[0];
        const mergedReads = mergeReadsAcrossDocuments(
            existingDocuments,
            incomingReads,
        );

        const updatedDocument = await databases.updateDocument(
            env.databaseId,
            env.collections.threadReads,
            primaryDocument.$id,
            {
                reads: JSON.stringify(mergedReads),
            },
        );

        return mapThreadReadDocument(
            updatedDocument as unknown as Record<string, unknown>,
        );
    }

    const payload = {
        contextId: params.contextId,
        contextType: params.contextType,
        reads: JSON.stringify(incomingReads),
        userId: params.userId,
    };

    try {
        const createdDocument = await databases.createDocument(
            env.databaseId,
            env.collections.threadReads,
            ID.unique(),
            payload,
            perms.serverOwner(params.userId),
        );

        return mapThreadReadDocument(
            createdDocument as unknown as Record<string, unknown>,
        );
    } catch (error) {
        if (!isAlreadyExistsConflict(error)) {
            throw error;
        }

        // A concurrent create won the race; merge and update the now-existing record.
        const concurrentDocuments =
            await listThreadReadDocumentsForContext(params);
        if (concurrentDocuments.length === 0) {
            throw error;
        }

        const primaryDocument = concurrentDocuments[0];
        const mergedReads = mergeReadsAcrossDocuments(
            concurrentDocuments,
            incomingReads,
        );

        const updatedDocument = await databases.updateDocument(
            env.databaseId,
            env.collections.threadReads,
            primaryDocument.$id,
            {
                reads: JSON.stringify(mergedReads),
            },
        );

        return mapThreadReadDocument(
            updatedDocument as unknown as Record<string, unknown>,
        );
    }
}
