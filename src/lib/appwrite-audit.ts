import { ID, Query } from "appwrite";

import {
  getBrowserDatabases,
  getEnvConfig,
} from "./appwrite-core";
import { getAdminClient } from "./appwrite-admin";

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
};

export async function recordAudit(
  action: string,
  targetId: string,
  actorId: string,
  meta?: Record<string, unknown>
) {
  if (!AUDIT_COLLECTION_ID) {
    return;
  }
  try {
    // Use client SDK Permission/Role for browser context
    const { Permission, Role } = await import("appwrite");
    const permissions = [Permission.read(Role.any())];
    await getDatabases().createDocument({
      databaseId: DATABASE_ID,
      collectionId: AUDIT_COLLECTION_ID,
      documentId: ID.unique(),
      data: { action, targetId, actorId, meta },
      permissions,
    });
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
  const queries: string[] = [Query.limit(limit), Query.orderDesc("$createdAt")];
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
  const queries: string[] = [Query.limit(limit), Query.orderDesc("$createdAt")];
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
  
  const rawDocuments = (res as unknown as { documents?: unknown[] }).documents || [];
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
