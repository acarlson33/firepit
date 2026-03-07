import { ID, Query } from "appwrite";

import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import { getAdminClient } from "./appwrite-admin";
import { getFeatureFlag, FEATURE_FLAGS } from "./feature-flags";

function getDatabases() {
    return getBrowserDatabases();
}

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const AUDIT_COLLECTION_ID = env.collections.audit || undefined;

export type AuditEvent = {
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

function getMetaString(
    meta: Record<string, unknown> | undefined,
    key: string,
): string | undefined {
    const value = meta?.[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

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

    const auditData = {
        action,
        targetId,
        actorId,
        meta,
        serverId,
        userId: getMetaString(meta, "userId") || actorId,
        targetUserId,
        reason: getMetaString(meta, "reason"),
        details: getMetaString(meta, "details"),
    };

    try {
        const { databases } = getServerClient();
        await databases.createDocument(
            DATABASE_ID,
            AUDIT_COLLECTION_ID,
            ID.unique(),
            auditData,
            ['read("any")'],
        );
    } catch {
        // ignore audit failures
    }
}

export type ListAuditOpts = {
    limit?: number;
    cursorAfter?: string;
    action?: string;
    actorId?: string;
    targetId?: string;
};

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
        meta: (d as Record<string, unknown>).meta as
            | Record<string, unknown>
            | undefined,
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
        meta: (d as Record<string, unknown>).meta as
            | Record<string, unknown>
            | undefined,
    }));
    const last = items.at(-1);
    return {
        items,
        nextCursor: items.length === limit && last ? last.$id : null,
    };
}
