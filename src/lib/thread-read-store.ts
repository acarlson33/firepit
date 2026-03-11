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

export async function upsertThreadReads(params: {
    contextId: string;
    contextType: ThreadReadContextType;
    reads: Record<string, string>;
    userId: string;
}) {
    const { databases } = getAdminClient();
    const env = getEnvConfig();
    const existing = await getThreadReads(params);
    const payload = {
        contextId: params.contextId,
        contextType: params.contextType,
        reads: JSON.stringify(normalizeThreadReads(params.reads)),
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
