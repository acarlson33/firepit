"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getEnvConfig } from "@/lib/appwrite-core";
import {
    listInbox,
    markInboxContextRead,
    markInboxItemsRead,
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

function removeItemsFromInbox(
    inbox: InboxListResponse,
    predicate: (item: InboxItem) => boolean,
): InboxListResponse {
    const items = inbox.items.filter((item) => !predicate(item));

    return {
        contractVersion: inbox.contractVersion,
        counts: items.reduce(
            (accumulator, item) => {
                accumulator[item.kind] += item.unreadCount;
                return accumulator;
            },
            { mention: 0, thread: 0 },
        ),
        items,
        unreadCount: items.reduce((total, item) => total + item.unreadCount, 0),
    };
}

export function useInbox(userId: string | null) {
    const queryClient = useQueryClient();
    const env = getEnvConfig();
    const isEnabled = Boolean(userId);

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
            const latestItem = items[0] ?? null;

            return {
                contextId: items[0]?.contextId ?? "",
                contextKind: items[0]?.contextKind ?? "channel",
                firstUnreadItem: sortedAscending[0] ?? null,
                latestItem,
                mentionCount: items
                    .filter((item) => item.kind === "mention")
                    .reduce((total, item) => total + item.unreadCount, 0),
                muted: items.every((item) => item.muted),
                serverId: items[0]?.serverId,
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
            if (item.kind === "mention") {
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
                return;
            }

            await markContextRead(item.contextKind, item.contextId);
        },
        [markContextRead, refetch, updateInboxCache],
    );

    const getContextSummary = useCallback(
        (contextKind: InboxContextKind, contextId: string) =>
            contextSummaryByKey.get(
                createContextKey({ contextId, contextKind }),
            ) ?? null,
        [contextSummaryByKey],
    );

    return {
        contractVersion: data.contractVersion,
        counts: data.counts,
        error:
            error instanceof Error
                ? error.message
                : error
                  ? "Failed to load inbox"
                  : null,
        getContextSummary,
        items: data.items,
        loading: isEnabled ? isLoading : false,
        markContextRead,
        markItemRead,
        refresh: refetch,
        summaries: contextSummaries,
        unreadCount: data.unreadCount,
    };
}
