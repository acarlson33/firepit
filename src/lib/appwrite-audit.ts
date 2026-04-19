import { ID, Query } from "node-appwrite";

import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import { getAdminClient } from "./appwrite-admin";
import { getFeatureFlag, FEATURE_FLAGS } from "./feature-flags";

/**
 * Returns databases.
 * @returns {Databases} The return value.
 */
function getDatabases() {
    return getBrowserDatabases();
}

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const AUDIT_COLLECTION_ID = env.collections.audit || undefined;

type AuditEvent = {
    $id: string;
    action: string;
    targetId: string;
    actorId: string;
    $createdAt: string;
    meta?: Record<string, unknown>;
    serverId?: string;
    userId?: string;
    targetUserId?: string;
    reason?: string;
    details?: string;
};

/**
 * Returns meta string.
 *
 * @param {Record<string, unknown> | undefined} meta - The meta value.
 * @param {string} key - The key value.
 * @returns {string | undefined} The return value.
 */
function getMetaString(
    meta: Record<string, unknown> | undefined,
    key: string,
): string | undefined {
    const value = meta?.[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Handles serialize audit meta.
 *
 * @param {Record<string, unknown> | undefined} meta - The meta value.
 * @returns {string | undefined} The return value.
 */
function serializeAuditMeta(meta: Record<string, unknown> | undefined) {
    if (!meta) {
        return undefined;
    }

    try {
        return JSON.stringify(meta);
    } catch {
        return undefined;
    }
}

/**
 * Parses audit meta.
 *
 * @param {unknown} value - The value value.
 * @returns {Record<string, unknown> | undefined} The return value.
 */
function parseAuditMeta(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return undefined;
}

/**
 * Handles record audit.
 *
 * @param {string} action - The action value.
 * @param {string} targetId - The target id value.
 * @param {string} actorId - The actor id value.
 * @param {Record<string, unknown> | undefined} meta - The meta value, if provided.
 * @returns {Promise<void>} The return value.
 */
export async function recordAudit(
    action: string,
    targetId: string,
    actorId: string,
    meta?: Record<string, unknown>,
) {
    // Check if audit logging is enabled via feature flag
    const auditEnabled = await getFeatureFlag(
        FEATURE_FLAGS.ENABLE_AUDIT_LOGGING,
    );
    if (!auditEnabled) {
        return;
    }

    if (!AUDIT_COLLECTION_ID) {
        return;
    }

    const serverId = getMetaString(meta, "serverId");
    const targetUserId =
        getMetaString(meta, "targetUserId") ||
        (serverId ? targetId : undefined);
    const serializedMeta = serializeAuditMeta(meta);

    const auditData = {
        action,
        targetId,
        actorId,
        meta: serializedMeta,
        serverId,
        userId: getMetaString(meta, "userId") || actorId,
        targetUserId,
        reason: getMetaString(meta, "reason"),
        details: getMetaString(meta, "details"),
    };

    const fallbackAuditData = {
        action,
        targetId,
        actorId,
        meta: serializedMeta,
    };

    try {
        const { databases } = getServerClient();
        try {
            await databases.createDocument(
                DATABASE_ID,
                AUDIT_COLLECTION_ID,
                ID.unique(),
                auditData,
                ['read("any")'],
            );
        } catch {
            await databases.createDocument(
                DATABASE_ID,
                AUDIT_COLLECTION_ID,
                ID.unique(),
                fallbackAuditData,
                ['read("any")'],
            );
        }
    } catch {
        // ignore audit failures
    }
}

type ListAuditOpts = {
    limit?: number;
    cursorAfter?: string;
    action?: string;
    actorId?: string;
    targetId?: string;
};

/**
 * Lists audit events.
 *
 * @param {{ limit?: number | undefined; cursorAfter?: string | undefined; action?: string | undefined; actorId?: string | undefined; targetId?: string | undefined; }} opts - The opts value, if provided.
 * @returns {Promise<{ items: { $id: string; action: string; targetId: string; actorId: string; $createdAt: string; meta: Record<string, unknown> | undefined; }[]; nextCursor: string | null; }>} The return value.
 */
export async function listAuditEvents(opts: ListAuditOpts = {}) {
    if (!AUDIT_COLLECTION_ID) {
        return { items: [], nextCursor: null as string | null };
    }
    const defaultAuditLimit = 50;
    const limit = opts.limit || defaultAuditLimit;
    const queries: string[] = [
        Query.limit(limit),
        Query.orderDesc("$createdAt"),
    ];
    if (opts.cursorAfter) {
        queries.push(Query.cursorAfter(opts.cursorAfter));
    }
    if (opts.action) {
        queries.push(Query.equal("action", opts.action));
    }
    if (opts.actorId) {
        queries.push(Query.equal("actorId", opts.actorId));
    }
    if (opts.targetId) {
        queries.push(Query.equal("targetId", opts.targetId));
    }
    const res = await getDatabases().listDocuments({
        databaseId: DATABASE_ID,
        collectionId: AUDIT_COLLECTION_ID,
        queries,
    });
    const items = res.documents.map((d) => ({
        $id: String((d as Record<string, unknown>).$id),
        action: String((d as Record<string, unknown>).action),
        targetId: String((d as Record<string, unknown>).targetId),
        actorId: String((d as Record<string, unknown>).actorId),
        $createdAt: String((d as Record<string, unknown>).$createdAt),
        meta: parseAuditMeta((d as Record<string, unknown>).meta),
    }));
    const last = items.at(-1);
    return {
        items,
        nextCursor: items.length === limit && last ? last.$id : null,
    };
}

/**
 * Admin version of listAuditEvents that uses server SDK with admin privileges
 * Use this for admin-only pages to bypass permission checks
 *
 * @param {{ limit?: number | undefined; cursorAfter?: string | undefined; action?: string | undefined; actorId?: string | undefined; targetId?: string | undefined; }} opts - The opts value, if provided.
 * @returns {Promise<{ items: { $id: string; action: string; targetId: string; actorId: string; $createdAt: string; meta: Record<string, unknown> | undefined; }[]; nextCursor: string | null; }>} The return value.
 */
export async function adminListAuditEvents(opts: ListAuditOpts = {}) {
    if (!AUDIT_COLLECTION_ID) {
        return { items: [], nextCursor: null as string | null };
    }
    const defaultAuditLimit = 50;
    const limit = opts.limit || defaultAuditLimit;
    const queries: string[] = [
        Query.limit(limit),
        Query.orderDesc("$createdAt"),
    ];
    if (opts.cursorAfter) {
        queries.push(Query.cursorAfter(opts.cursorAfter));
    }
    if (opts.action) {
        queries.push(Query.equal("action", opts.action));
    }
    if (opts.actorId) {
        queries.push(Query.equal("actorId", opts.actorId));
    }
    if (opts.targetId) {
        queries.push(Query.equal("targetId", opts.targetId));
    }

    // Use admin client to bypass permission checks
    const { databases } = getAdminClient();
    const res = await databases.listDocuments(
        DATABASE_ID,
        AUDIT_COLLECTION_ID,
        queries,
    );

    const rawDocuments =
        (res as unknown as { documents?: unknown[] }).documents || [];
    const items = rawDocuments.map((d) => ({
        $id: String((d as Record<string, unknown>).$id),
        action: String((d as Record<string, unknown>).action),
        targetId: String((d as Record<string, unknown>).targetId),
        actorId: String((d as Record<string, unknown>).actorId),
        $createdAt: String((d as Record<string, unknown>).$createdAt),
        meta: parseAuditMeta((d as Record<string, unknown>).meta),
    }));
    const last = items.at(-1);
    return {
        items,
        nextCursor: items.length === limit && last ? last.$id : null,
    };
}
