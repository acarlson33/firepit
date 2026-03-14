import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { listInboxItems } from "@/lib/inbox";
import { logger, recordEvent } from "@/lib/newrelic-utils";
import { upsertThreadReads } from "@/lib/thread-read-store";
import type { InboxContextKind, InboxItemKind } from "@/lib/types";
import { Query } from "node-appwrite";

const VALID_KINDS: InboxItemKind[] = ["mention", "thread"];
const VALID_CONTEXT_KINDS: InboxContextKind[] = ["channel", "conversation"];
const VALID_SCOPE_VALUES = ["all", "direct", "server"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_ITEM_UPDATES = 50;
const UPDATE_BATCH_SIZE = 25;
const env = getEnvConfig();

type InboxScope = (typeof VALID_SCOPE_VALUES)[number];

type MarkAllReadBody = {
    action: "mark-all-read";
    contextId?: string;
    contextKind?: InboxContextKind;
};

type MarkItemsReadBody = {
    itemIds?: unknown;
};

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

    const inbox = await listInboxItems({
        contextKinds,
        kinds,
        limit: isContextScoped ? Number.POSITIVE_INFINITY : limit,
        userId: session.$id,
    });

    if (isContextScoped) {
        const items = inbox.items.filter(
            (item) =>
                item.contextId === contextId &&
                item.contextKind === contextKind,
        );

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

    if (body && "action" in body && body.action === "mark-all-read") {
        const contextKind = body.contextKind;
        const contextId = body.contextId?.trim();

        if ((contextKind && !contextId) || (!contextKind && contextId)) {
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
        const scopedItems = contextKind
            ? inbox.items.filter(
                  (item) =>
                      item.contextKind === contextKind &&
                      item.contextId === contextId,
              )
            : inbox.items;

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

            for (
                let startIndex = 0;
                startIndex < documents.documents.length;
                startIndex += UPDATE_BATCH_SIZE
            ) {
                const batch = documents.documents.slice(
                    startIndex,
                    startIndex + UPDATE_BATCH_SIZE,
                );
                const mentionUpdateResults = await Promise.allSettled(
                    batch.map((document) =>
                        databases.updateDocument(
                            env.databaseId,
                            env.collections.inboxItems,
                            String(document.$id),
                            { readAt },
                        ),
                    ),
                );

                for (const [
                    resultIndex,
                    result,
                ] of mentionUpdateResults.entries()) {
                    if (result.status !== "rejected") {
                        continue;
                    }

                    const failedDocument = batch[resultIndex];
                    logger.warn("Failed to mark mention inbox item as read", {
                        documentId: failedDocument
                            ? String(failedDocument.$id)
                            : undefined,
                        reason:
                            result.reason instanceof Error
                                ? result.reason.message
                                : String(result.reason),
                    });
                }

                updatedMentionCount += mentionUpdateResults.filter(
                    (result) => result.status === "fulfilled",
                ).length;
            }
        }

        await Promise.all(
            Array.from(threadReadWrites.values()).map(async (entry) => {
                await upsertThreadReads({
                    contextId: entry.contextId,
                    contextType: entry.contextType,
                    reads: entry.reads,
                    userId: session.$id,
                });
            }),
        );

        recordEvent("InboxMarkAllRead", {
            contextId: contextId ?? null,
            contextKind: contextKind ?? null,
            updatedMentionCount,
            updatedThreadContextCount: threadReadWrites.size,
            userId: session.$id,
        });

        return NextResponse.json({
            ok: true,
            readAt,
            updatedMentionCount,
            updatedThreadContextCount: threadReadWrites.size,
        });
    }

    const requestedItemIds =
        body && "itemIds" in body ? body.itemIds : undefined;
    const filteredItemIds = Array.isArray(requestedItemIds)
        ? requestedItemIds.filter(
              (value): value is string =>
                  typeof value === "string" && value.trim().length > 0,
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
    let updatedCount = 0;
    for (
        let startIndex = 0;
        startIndex < documents.documents.length;
        startIndex += UPDATE_BATCH_SIZE
    ) {
        const batch = documents.documents.slice(
            startIndex,
            startIndex + UPDATE_BATCH_SIZE,
        );
        const batchResults = await Promise.allSettled(
            batch.map((document) =>
                databases.updateDocument(
                    env.databaseId,
                    env.collections.inboxItems,
                    String(document.$id),
                    { readAt },
                ),
            ),
        );

        for (const [resultIndex, result] of batchResults.entries()) {
            if (result.status !== "rejected") {
                continue;
            }

            const failedDocument = batch[resultIndex];
            logger.warn("Failed to mark inbox item as read", {
                documentId: failedDocument
                    ? String(failedDocument.$id)
                    : undefined,
                reason:
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
                userId: session.$id,
            });
        }

        updatedCount += batchResults.filter(
            (result) => result.status === "fulfilled",
        ).length;
    }

    recordEvent("InboxItemsRead", {
        requestedCount: filteredItemIds.length,
        truncated: filteredItemIds.length > MAX_ITEM_UPDATES,
        truncatedCount: Math.max(0, filteredItemIds.length - itemIds.length),
        updatedCount,
        userId: session.$id,
    });

    return NextResponse.json({ ok: true, readAt, updatedCount });
}
