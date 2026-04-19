import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { listInboxItems } from "@/lib/inbox";
import { logger, recordEvent } from "@/lib/newrelic-utils";
import { upsertThreadReads } from "@/lib/thread-read-store";
import type { InboxContextKind, InboxItemKind } from "@/lib/types";
import { Query, type Models } from "node-appwrite";
import { apiCache } from "@/lib/cache-utils";
import { compareInboxVsDmUnreadThreads } from "@/lib/unread-consistency";

const VALID_KINDS: InboxItemKind[] = ["mention", "thread"];
const VALID_CONTEXT_KINDS: InboxContextKind[] = ["channel", "conversation"];
const VALID_SCOPE_VALUES = ["all", "direct", "server"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_ITEM_UPDATES = 50;
const UPDATE_BATCH_SIZE = 25;
const UPDATE_BATCH_CONCURRENCY = 2;
const env = getEnvConfig();
const INBOX_ROUTE_CACHE_TTL_MS = 5 * 1000;
const INBOX_CACHE_EPOCH_TTL_MS = 5 * 60 * 1000;
const INBOX_CACHE_EPOCH_SWEEP_INTERVAL_MS = 30 * 1000;
const MAX_INBOX_CACHE_EPOCH_ENTRIES = 2000;
// Process-local epoch tracking: PATCH bumps only invalidate this instance.
// Cross-instance cache coherence is bounded by INBOX_ROUTE_CACHE_TTL_MS.
const inboxCacheEpochByUser = new Map<
    string,
    { epoch: number; expiresAt: number }
>();
let lastInboxCacheEpochSweepAt = 0;

type InboxScope = (typeof VALID_SCOPE_VALUES)[number];

type MarkAllReadBody = {
    action: "mark-all-read";
    contextId?: string;
    contextKind?: InboxContextKind;
};

type MarkItemsReadBody = {
    itemIds?: unknown;
};

async function runBatchedUpdates<T>(params: {
    batchConcurrency: number;
    batchSize: number;
    documents: T[];
    getDocumentId: (document: T) => string;
    loggerContext?: Record<string, unknown>;
    loggerMessage: string;
    updater: (document: T) => Promise<unknown>;
}) {
    const {
        batchConcurrency,
        batchSize,
        documents,
        getDocumentId,
        loggerContext,
        loggerMessage,
        updater,
    } = params;

    const batches: T[][] = [];
    for (
        let startIndex = 0;
        startIndex < documents.length;
        startIndex += batchSize
    ) {
        batches.push(documents.slice(startIndex, startIndex + batchSize));
    }

    let fulfilledCount = 0;
    const workerCount = Math.max(1, Math.min(batchConcurrency, batches.length));
    const workers = Array.from({ length: workerCount }, (_, workerIndex) => {
        return (async () => {
            for (
                let batchIndex = workerIndex;
                batchIndex < batches.length;
                batchIndex += workerCount
            ) {
                const batch = batches[batchIndex] ?? [];
                const batchResults = await Promise.allSettled(
                    batch.map((document) => updater(document)),
                );

                for (const [resultIndex, result] of batchResults.entries()) {
                    if (result.status !== "rejected") {
                        continue;
                    }

                    const failedDocument = batch[resultIndex];
                    logger.warn(loggerMessage, {
                        ...loggerContext,
                        documentId: failedDocument
                            ? getDocumentId(failedDocument)
                            : undefined,
                        reason:
                            result.reason instanceof Error
                                ? result.reason.message
                                : String(result.reason),
                    });
                }

                fulfilledCount += batchResults.filter(
                    (result) => result.status === "fulfilled",
                ).length;
            }
        })();
    });

    await Promise.all(workers);
    return fulfilledCount;
}

function parseScope(value: string | null): InboxScope | null {
    if (!value) {
        return "all";
    }

    return VALID_SCOPE_VALUES.includes(value as InboxScope)
        ? (value as InboxScope)
        : null;
}

function scopeToContextKinds(
    scope: InboxScope,
): InboxContextKind[] | undefined {
    if (scope === "direct") {
        return ["conversation"];
    }

    if (scope === "server") {
        return ["channel"];
    }

    return undefined;
}

function isValidContextKind(
    value: string | null | undefined,
): value is InboxContextKind {
    return Boolean(
        value && VALID_CONTEXT_KINDS.includes(value as InboxContextKind),
    );
}

function parseKinds(searchParams: URLSearchParams) {
    const requested = searchParams
        .getAll("kind")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean);

    if (requested.length === 0) {
        return VALID_KINDS;
    }

    const invalidKinds = requested.filter(
        (value) => !VALID_KINDS.includes(value as InboxItemKind),
    );

    if (invalidKinds.length > 0) {
        return null;
    }

    return Array.from(new Set(requested)) as InboxItemKind[];
}

function toCounts(items: Array<{ kind: InboxItemKind; unreadCount: number }>) {
    return items.reduce<Record<InboxItemKind, number>>(
        (accumulator, item) => {
            accumulator[item.kind] += item.unreadCount;
            return accumulator;
        },
        { mention: 0, thread: 0 },
    );
}

function parseLimit(value: string | null) {
    if (!value) {
        return DEFAULT_LIMIT;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return null;
    }

    return parsed;
}

function canUseInboxRouteCache(): boolean {
    return process.env.NODE_ENV !== "test";
}

function sweepExpiredInboxCacheEpochs(force = false): void {
    const now = Date.now();

    if (
        !force &&
        now - lastInboxCacheEpochSweepAt < INBOX_CACHE_EPOCH_SWEEP_INTERVAL_MS
    ) {
        return;
    }
    lastInboxCacheEpochSweepAt = now;

    for (const [userId, entry] of inboxCacheEpochByUser.entries()) {
        if (entry.expiresAt <= now) {
            inboxCacheEpochByUser.delete(userId);
        }
    }
}

function getInboxCacheEpoch(userId: string): number {
    sweepExpiredInboxCacheEpochs();

    const entry = inboxCacheEpochByUser.get(userId);
    if (!entry) {
        return 0;
    }

    if (entry.expiresAt <= Date.now()) {
        inboxCacheEpochByUser.delete(userId);
        return 0;
    }

    // Intentionally refresh the inboxCacheEpochByUser entry for userId to the end
    // of Map iteration order (LRU pattern). This read mutates the Map.
    inboxCacheEpochByUser.delete(userId);
    inboxCacheEpochByUser.set(userId, entry);
    return entry.epoch;
}

function bumpInboxCacheEpoch(userId: string): void {
    const nextEpoch = getInboxCacheEpoch(userId) + 1;
    inboxCacheEpochByUser.set(userId, {
        epoch: nextEpoch,
        expiresAt: Date.now() + INBOX_CACHE_EPOCH_TTL_MS,
    });

    while (inboxCacheEpochByUser.size > MAX_INBOX_CACHE_EPOCH_ENTRIES) {
        const oldestUserId = inboxCacheEpochByUser.keys().next().value;
        if (typeof oldestUserId !== "string") {
            break;
        }

        inboxCacheEpochByUser.delete(oldestUserId);
    }
}

function normalizedKindsKey(kinds: InboxItemKind[]): string {
    return [...kinds].sort().join(",");
}

function normalizedContextKindsKey(
    contextKinds: InboxContextKind[] | undefined,
): string {
    if (!contextKinds || contextKinds.length === 0) {
        return "all";
    }

    return [...contextKinds].sort().join(",");
}

function buildInboxCacheKey(params: {
    contextId?: string;
    contextKind?: InboxContextKind;
    contextKinds?: InboxContextKind[];
    kinds: InboxItemKind[];
    limit: number;
    scope: InboxScope;
    userId: string;
}) {
    return [
        "api:inbox",
        params.userId,
        `epoch=${String(getInboxCacheEpoch(params.userId))}`,
        `scope=${params.scope}`,
        `kinds=${normalizedKindsKey(params.kinds)}`,
        `contexts=${normalizedContextKindsKey(params.contextKinds)}`,
        `contextId=${params.contextId ?? ""}`,
        `contextKind=${params.contextKind ?? ""}`,
        `limit=${Number.isFinite(params.limit) ? String(params.limit) : "infinite"}`,
    ].join(":");
}

function countConversationThreadUnread(
    items: Array<{ contextKind: InboxContextKind; kind: InboxItemKind; unreadCount: number }>,
) {
    return items.reduce((total, item) => {
        if (item.kind !== "thread" || item.contextKind !== "conversation") {
            return total;
        }

        return total + item.unreadCount;
    }, 0);
}

function observeInboxDmUnreadConsistency(params: {
    contextKind?: InboxContextKind;
    items: Array<{
        contextKind: InboxContextKind;
        kind: InboxItemKind;
        unreadCount: number;
    }>;
    kinds: InboxItemKind[];
    scope: InboxScope;
    userId: string;
}) {
    const { contextKind, items, kinds, scope, userId } = params;
    if (!kinds.includes("thread")) {
        return;
    }

    if (scope === "server") {
        return;
    }

    if (contextKind && contextKind !== "conversation") {
        return;
    }

    const comparison = compareInboxVsDmUnreadThreads({
        inboxConversationThreadUnreadCount: countConversationThreadUnread(items),
        userId,
    });

    if (!comparison) {
        return;
    }

    recordEvent("InboxDmUnreadConsistencyObserved", {
        conversationCount: comparison.dmSnapshot.conversationCount,
        delta: comparison.delta,
        dmConversationUnreadThreadCount: comparison.dmSnapshot.totalUnreadThreadCount,
        dmSnapshotTruncated: comparison.dmSnapshot.truncated,
        inboxConversationThreadUnreadCount:
            comparison.inboxConversationThreadUnreadCount,
        mismatched: comparison.absDelta > 0,
        snapshotAgeMs: comparison.snapshotAgeMs,
        userId,
    });

    if (comparison.absDelta > 0) {
        logger.warn("Inbox/DM unread consistency mismatch", {
            conversationCount: comparison.dmSnapshot.conversationCount,
            delta: comparison.delta,
            dmConversationUnreadThreadCount:
                comparison.dmSnapshot.totalUnreadThreadCount,
            dmSnapshotTruncated: comparison.dmSnapshot.truncated,
            inboxConversationThreadUnreadCount:
                comparison.inboxConversationThreadUnreadCount,
            snapshotAgeMs: comparison.snapshotAgeMs,
            userId,
        });
    }
}

export async function GET(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const kinds = parseKinds(searchParams);
    const scope = parseScope(searchParams.get("scope"));
    const contextId = searchParams.get("contextId")?.trim() || undefined;
    const contextKindParam = searchParams.get("contextKind");
    const contextKind = isValidContextKind(contextKindParam)
        ? contextKindParam
        : contextKindParam
          ? null
          : undefined;
    if (!kinds) {
        return NextResponse.json(
            { error: "kind must be one or more of mention,thread" },
            { status: 400 },
        );
    }

    if (!scope) {
        return NextResponse.json(
            { error: "scope must be one of all,direct,server" },
            { status: 400 },
        );
    }

    if ((contextId && !contextKind) || (!contextId && contextKind)) {
        return NextResponse.json(
            {
                error: "contextId and contextKind must be provided together",
            },
            { status: 400 },
        );
    }

    if (contextKind === null) {
        return NextResponse.json(
            { error: "contextKind must be one of channel,conversation" },
            { status: 400 },
        );
    }

    const limit = parseLimit(searchParams.get("limit"));
    if (!limit) {
        return NextResponse.json(
            { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
            { status: 400 },
        );
    }

    const isContextScoped = Boolean(contextId && contextKind);
    const contextKinds = contextKind
        ? [contextKind]
        : scopeToContextKinds(scope);

    const inboxListLimit = isContextScoped ? Number.POSITIVE_INFINITY : limit;
    const loadInbox = () =>
        listInboxItems({
            contextKinds,
            kinds,
            limit: inboxListLimit,
            userId: session.$id,
        });

    const inbox = canUseInboxRouteCache()
        ? await apiCache.dedupe(
              buildInboxCacheKey({
                  contextId,
                  contextKind,
                  contextKinds,
                  kinds,
                  limit: inboxListLimit,
                  scope,
                  userId: session.$id,
              }),
              loadInbox,
              INBOX_ROUTE_CACHE_TTL_MS,
          )
        : await loadInbox();

    if (isContextScoped) {
        const items = inbox.items.filter(
            (item) =>
                item.contextId === contextId &&
                item.contextKind === contextKind,
        );

        observeInboxDmUnreadConsistency({
            contextKind,
            items,
            kinds,
            scope,
            userId: session.$id,
        });

        return NextResponse.json({
            contractVersion: inbox.contractVersion,
            counts: toCounts(items),
            items,
            unreadCount: items.reduce(
                (total, item) => total + item.unreadCount,
                0,
            ),
        });
    }

    observeInboxDmUnreadConsistency({
        items: inbox.items,
        kinds,
        scope,
        userId: session.$id,
    });

    return NextResponse.json(inbox);
}

export async function PATCH(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const body = (await request.json().catch(() => null)) as
        | MarkAllReadBody
        | MarkItemsReadBody
        | null;
    const isObjectBody = typeof body === "object" && body !== null;

    if (isObjectBody && "action" in body && body.action === "mark-all-read") {
        const contextKind = body.contextKind;
        const contextId = body.contextId?.trim();

        if (!contextKind && contextId) {
            return NextResponse.json(
                { error: "contextKind and contextId are required together" },
                { status: 400 },
            );
        }

        if (contextKind && !isValidContextKind(contextKind)) {
            return NextResponse.json(
                { error: "contextKind must be one of channel,conversation" },
                { status: 400 },
            );
        }

        const readAt = new Date().toISOString();
        const inbox = await listInboxItems({
            contextKinds: contextKind ? [contextKind] : undefined,
            kinds: VALID_KINDS,
            limit: Number.POSITIVE_INFINITY,
            userId: session.$id,
        });
        let scopedItems = inbox.items;
        if (contextKind && contextId) {
            scopedItems = inbox.items.filter(
                (item) =>
                    item.contextKind === contextKind &&
                    item.contextId === contextId,
            );
        } else if (contextKind) {
            scopedItems = inbox.items.filter(
                (item) => item.contextKind === contextKind,
            );
        }

        const mentionItemIds = scopedItems
            .filter((item) => item.kind === "mention")
            .map((item) => item.id);

        const threadReadWrites = scopedItems
            .filter((item) => item.kind === "thread")
            .reduce<
                Map<
                    string,
                    {
                        contextId: string;
                        contextType: "channel" | "conversation";
                        reads: Record<string, string>;
                    }
                >
            >((accumulator, item) => {
                const key = `${item.contextKind}:${item.contextId}`;
                const current = accumulator.get(key) ?? {
                    contextId: item.contextId,
                    contextType:
                        item.contextKind === "channel"
                            ? "channel"
                            : "conversation",
                    reads: {},
                };

                const parentMessageId = item.parentMessageId ?? item.messageId;
                const previousReadAt = current.reads[parentMessageId];
                if (
                    !previousReadAt ||
                    previousReadAt.localeCompare(item.latestActivityAt) < 0
                ) {
                    current.reads[parentMessageId] = item.latestActivityAt;
                }

                accumulator.set(key, current);
                return accumulator;
            }, new Map());

        const { databases } = getAdminClient();
        let updatedMentionCount = 0;
        if (mentionItemIds.length > 0) {
            const documents = await databases.listDocuments(
                env.databaseId,
                env.collections.inboxItems,
                [
                    Query.equal("$id", mentionItemIds),
                    Query.equal("userId", session.$id),
                    Query.limit(mentionItemIds.length),
                ],
            );

            updatedMentionCount += await runBatchedUpdates({
                batchConcurrency: UPDATE_BATCH_CONCURRENCY,
                batchSize: UPDATE_BATCH_SIZE,
                documents: documents.documents,
                getDocumentId: (document) => String(document.$id),
                loggerMessage: "Failed to mark mention inbox item as read",
                updater: (document) =>
                    databases.updateDocument<
                        Models.Document & { readAt?: string | null }
                    >(
                        env.databaseId,
                        env.collections.inboxItems,
                        String(document.$id),
                        { readAt },
                    ),
            });
        }

        const threadUpsertResults = await Promise.allSettled(
            Array.from(threadReadWrites.values()).map((entry) =>
                upsertThreadReads({
                    contextId: entry.contextId,
                    contextType: entry.contextType,
                    reads: entry.reads,
                    userId: session.$id,
                }),
            ),
        );

        const updatedThreadContextCount = threadUpsertResults.filter(
            (result) => result.status === "fulfilled",
        ).length;
        const failedThreadUpserts = threadUpsertResults.filter(
            (result) => result.status === "rejected",
        );

        if (failedThreadUpserts.length > 0) {
            const reasons = failedThreadUpserts.map((result) =>
                result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason),
            );
            logger.error("Failed to upsert thread read states", {
                contextId: contextId ?? null,
                contextKind: contextKind ?? null,
                failureCount: failedThreadUpserts.length,
                userId: session.$id,
                reasons,
            });

            return NextResponse.json(
                {
                    error: "Internal server error updating thread read states",
                },
                { status: 500 },
            );
        }

        recordEvent("InboxMarkAllRead", {
            contextId: contextId ?? null,
            contextKind: contextKind ?? null,
            updatedMentionCount,
            updatedThreadContextCount,
            userId: session.$id,
        });
        bumpInboxCacheEpoch(session.$id);

        return NextResponse.json({
            ok: true,
            readAt,
            updatedMentionCount,
            updatedThreadContextCount,
        });
    }

    const requestedItemIds =
        isObjectBody && "itemIds" in body ? body.itemIds : undefined;
    const filteredItemIds = Array.isArray(requestedItemIds)
        ? Array.from(
              new Set(
                  requestedItemIds
                      .map((value) =>
                          typeof value === "string" ? value.trim() : "",
                      )
                      .filter((value): value is string => value.length > 0),
              ),
          )
        : [];
    const itemIds = filteredItemIds.slice(0, MAX_ITEM_UPDATES);

    if (itemIds.length === 0) {
        return NextResponse.json(
            { error: "itemIds must contain at least one inbox item id" },
            { status: 400 },
        );
    }

    const { databases } = getAdminClient();
    const documents = await databases.listDocuments(
        env.databaseId,
        env.collections.inboxItems,
        [
            Query.equal("$id", itemIds),
            Query.equal("userId", session.$id),
            Query.limit(itemIds.length),
        ],
    );

    const readAt = new Date().toISOString();
    const updatedCount = await runBatchedUpdates({
        batchConcurrency: UPDATE_BATCH_CONCURRENCY,
        batchSize: UPDATE_BATCH_SIZE,
        documents: documents.documents,
        getDocumentId: (document) => String(document.$id),
        loggerContext: {
            userId: session.$id,
        },
        loggerMessage: "Failed to mark inbox item as read",
        updater: (document) =>
            databases.updateDocument<
                Models.Document & { readAt?: string | null }
            >(
                env.databaseId,
                env.collections.inboxItems,
                String(document.$id),
                { readAt },
            ),
    });

    recordEvent("InboxItemsRead", {
        requestedCount: filteredItemIds.length,
        truncated: filteredItemIds.length > MAX_ITEM_UPDATES,
        truncatedCount: Math.max(0, filteredItemIds.length - itemIds.length),
        updatedCount,
        userId: session.$id,
    });
    bumpInboxCacheEpoch(session.$id);

    return NextResponse.json({
        ok: true,
        readAt,
        updatedCount,
        truncated: filteredItemIds.length > MAX_ITEM_UPDATES,
        truncatedCount: Math.max(0, filteredItemIds.length - itemIds.length),
    });
}
