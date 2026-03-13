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
    const { databases } = getAdminClient();
    const env = getEnvConfig();
    const documents = await databases.listDocuments(
        env.databaseId,
        env.collections.threadReads,
        [
            Query.equal("userId", params.userId),
            Query.equal("contextType", params.contextType),
            Query.equal("contextId", params.contextId),
            Query.limit(1),
        ],
    );
    const document = documents.documents.at(0);

    return document
        ? mapThreadReadDocument(document as unknown as Record<string, unknown>)
        : null;
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
            Query.limit(500),
        ],
    );

    return documents.documents.reduce<Map<string, Record<string, string>>>(
        (accumulator, document) => {
            const mapped = mapThreadReadDocument(
                document as unknown as Record<string, unknown>,
            );
            accumulator.set(mapped.contextId, mapped.reads);
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
    const existing = await getThreadReads(params);
    const mergedReads = mergeThreadReadsByMax({
        existingReads: existing?.reads ?? {},
        incomingReads: params.reads,
    });
    const payload = {
        contextId: params.contextId,
        contextType: params.contextType,
        reads: JSON.stringify(normalizeThreadReads(mergedReads)),
        userId: params.userId,
    };

    if (existing) {
        const updated = await databases.updateDocument(
            env.databaseId,
            env.collections.threadReads,
            existing.$id,
            payload,
        );

        return mapThreadReadDocument(
            updated as unknown as Record<string, unknown>,
        );
    }

    const created = await databases.createDocument(
        env.databaseId,
        env.collections.threadReads,
        ID.unique(),
        payload,
        perms.serverOwner(params.userId),
    );

    return mapThreadReadDocument(created as unknown as Record<string, unknown>);
}
