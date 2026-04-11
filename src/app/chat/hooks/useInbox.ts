"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getEnvConfig } from "@/lib/appwrite-core";
import {
    listInbox,
    markInboxContextRead,
    markInboxItemsRead,
    markInboxScopeRead,
    type InboxScope,
} from "@/lib/inbox-client";
import { getSharedClient, trackSubscription } from "@/lib/realtime-pool";
import type {
    InboxContextKind,
    InboxItem,
    InboxListResponse,
} from "@/lib/types";

type InboxContextSummary = {
    contextId: string;
    contextKind: InboxContextKind;
    firstUnreadItem: InboxItem | null;
    latestItem: InboxItem | null;
    mentionCount: number;
    muted: boolean;
    serverId?: string;
    threadCount: number;
    totalCount: number;
};

const EMPTY_INBOX: InboxListResponse = {
    contractVersion: "thread_v1",
    counts: { mention: 0, thread: 0 },
    items: [],
    unreadCount: 0,
};

const SCOPE_CONTEXT_KINDS: Record<InboxScope, InboxContextKind[]> = {
    direct: ["conversation"],
    server: ["channel"],
    all: ["channel", "conversation"],
};

function getInboxQueryKey(userId: string | null) {
    return ["inbox", userId] as const;
}

function createContextKey(item: {
    contextId: string;
    contextKind: InboxContextKind;
}) {
    return `${item.contextKind}:${item.contextId}`;
}

function sortByActivityAsc(items: InboxItem[]) {
    return [...items].sort((left, right) => {
        const activityOrder = left.latestActivityAt.localeCompare(
            right.latestActivityAt,
        );
        if (activityOrder !== 0) {
            return activityOrder;
        }

        return left.id.localeCompare(right.id);
    });
}

function formatInboxError(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    if (error) {
        const fallback = String(error);
        return fallback.length > 0 && fallback !== "[object Object]"
            ? fallback
            : "Failed to load inbox";
    }

    return null;
}

function removeItemsFromInbox(
    inbox: InboxListResponse,
    predicate: (item: InboxItem) => boolean,
): InboxListResponse {
    let removedUnread = 0;
    const removedByKind = {
        mention: 0,
        thread: 0,
    };

    const items = inbox.items.filter((item) => {
        if (!predicate(item)) {
            return true;
        }

        removedUnread += item.unreadCount;
        removedByKind[item.kind] += item.unreadCount;
        return false;
    });

    const counts = {
        mention: Math.max(0, inbox.counts.mention - removedByKind.mention),
        thread: Math.max(0, inbox.counts.thread - removedByKind.thread),
    };

    return {
        contractVersion: inbox.contractVersion,
        counts,
        items,
        unreadCount: Math.max(0, inbox.unreadCount - removedUnread),
    };
}

export function useInbox(userId: string | null) {
    const queryClient = useQueryClient();
    const env = getEnvConfig();
    const isEnabled = Boolean(userId);
    const [bulkLoading, setBulkLoading] = useState<InboxScope | null>(null);

    const {
        data = EMPTY_INBOX,
        error,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: getInboxQueryKey(userId),
        queryFn: listInbox,
        enabled: isEnabled,
        staleTime: 15_000,
        gcTime: 10 * 60 * 1000,
    });

    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        const channels = [
            env.collections.directMessages,
            env.collections.inboxItems,
            env.collections.messages,
            env.collections.threadReads,
        ].map(
            (collectionId) =>
                `databases.${env.databaseId}.collections.${collectionId}.documents`,
        );

        let cleanupFn: (() => void) | undefined;
        let cancelled = false;

        void Promise.resolve().then(() => {
            if (cancelled) {
                return;
            }

            const client = getSharedClient();
            const unsubscribe = client.subscribe(channels, () => {
                void queryClient.invalidateQueries({
                    queryKey: getInboxQueryKey(userId),
                    refetchType: "active",
                });
            });
            const untrack = channels.map((channel) =>
                trackSubscription(channel),
            );

            cleanupFn = () => {
                for (const stopTracking of untrack) {
                    stopTracking();
                }
                unsubscribe();
            };
        });

        return () => {
            cancelled = true;
            cleanupFn?.();
        };
    }, [
        env.collections.directMessages,
        env.collections.inboxItems,
        env.collections.messages,
        env.collections.threadReads,
        env.databaseId,
        isEnabled,
        queryClient,
        userId,
    ]);

    const contextSummaries = useMemo(() => {
        const grouped = data.items.reduce<Map<string, InboxItem[]>>(
            (accumulator, item) => {
                const key = createContextKey(item);
                const currentItems = accumulator.get(key) ?? [];
                currentItems.push(item);
                accumulator.set(key, currentItems);
                return accumulator;
            },
            new Map(),
        );

        return Array.from(grouped.values()).map((items) => {
            const sortedAscending = sortByActivityAsc(items);
            const firstItem = sortedAscending[0] ?? null;
            const latestItem = sortedAscending.at(-1) ?? null;

            return {
                contextId: firstItem?.contextId ?? "",
                contextKind: firstItem?.contextKind ?? "channel",
                firstUnreadItem: firstItem,
                latestItem,
                mentionCount: items
                    .filter((item) => item.kind === "mention")
                    .reduce((total, item) => total + item.unreadCount, 0),
                muted: items.every((item) => item.muted),
                serverId: firstItem?.serverId,
                threadCount: items
                    .filter((item) => item.kind === "thread")
                    .reduce((total, item) => total + item.unreadCount, 0),
                totalCount: items.reduce(
                    (total, item) => total + item.unreadCount,
                    0,
                ),
            } satisfies InboxContextSummary;
        });
    }, [data.items]);

    const contextSummaryByKey = useMemo(
        () =>
            contextSummaries.reduce<Map<string, InboxContextSummary>>(
                (accumulator, summary) => {
                    accumulator.set(createContextKey(summary), summary);
                    return accumulator;
                },
                new Map(),
            ),
        [contextSummaries],
    );

    const updateInboxCache = useCallback(
        (updater: (currentInbox: InboxListResponse) => InboxListResponse) => {
            queryClient.setQueryData<InboxListResponse>(
                getInboxQueryKey(userId),
                (currentInbox) => updater(currentInbox ?? EMPTY_INBOX),
            );
        },
        [queryClient, userId],
    );

    const markContextRead = useCallback(
        async (contextKind: InboxContextKind, contextId: string) => {
            const summary = contextSummaryByKey.get(
                createContextKey({ contextId, contextKind }),
            );
            if (!summary) {
                return;
            }

            const matchingItems = data.items.filter(
                (item) =>
                    item.contextKind === contextKind &&
                    item.contextId === contextId,
            );

            updateInboxCache((currentInbox) =>
                removeItemsFromInbox(
                    currentInbox,
                    (item) =>
                        item.contextKind === contextKind &&
                        item.contextId === contextId,
                ),
            );

            try {
                if (matchingItems.length > 0) {
                    await markInboxContextRead({ contextId, contextKind });
                }
            } catch {
                await refetch();
            }
        },
        [contextSummaryByKey, data.items, refetch, updateInboxCache],
    );

    const markItemRead = useCallback(
        async (item: InboxItem) => {
            updateInboxCache((currentInbox) =>
                removeItemsFromInbox(
                    currentInbox,
                    (currentItem) => currentItem.id === item.id,
                ),
            );

            try {
                await markInboxItemsRead({ itemIds: [item.id] });
            } catch {
                await refetch();
            }
        },
        [refetch, updateInboxCache],
    );

    const markScopeRead = useCallback(
        async (scope: InboxScope) => {
            setBulkLoading(scope);

            if (scope === "all") {
                updateInboxCache(() => EMPTY_INBOX);
            } else {
                const scopeContextKinds = SCOPE_CONTEXT_KINDS[scope];
                updateInboxCache((currentInbox) =>
                    removeItemsFromInbox(currentInbox, (item) =>
                        scopeContextKinds.includes(item.contextKind),
                    ),
                );
            }

            try {
                await markInboxScopeRead(scope);
            } catch {
                await refetch();
            } finally {
                setBulkLoading(null);
            }
        },
        [refetch, updateInboxCache],
    );

    const getContextSummary = useCallback(
        (contextKind: InboxContextKind, contextId: string) =>
            contextSummaryByKey.get(
                createContextKey({ contextId, contextKind }),
            ) ?? null,
        [contextSummaryByKey],
    );

    return {
        bulkLoading,
        contractVersion: data.contractVersion,
        counts: data.counts,
        error: formatInboxError(error),
        getContextSummary,
        items: data.items,
        loading: isEnabled ? isLoading : false,
        markContextRead,
        markItemRead,
        markScopeRead,
        refresh: refetch,
        summaries: contextSummaries,
        unreadCount: data.unreadCount,
    };
}
